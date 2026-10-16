"""新規登録・ログイン・ログアウト・パスワード再設定。"""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Form, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import ratelimit, services
from app.config import settings
from app.db import get_db
from app.deps import get_current_user, verify_csrf
from app.mailer import send_email
from app.models import EmailToken, User, utcnow
from app.security import (
    clear_session,
    client_ip,
    hash_password,
    issue_session,
    new_url_token,
    password_needs_rehash,
    sha256_hex,
    verify_password,
)
from app.services import ValidationError
from app.templating import redirect, render
from app.utils import safe_next_path

router = APIRouter()

TOKEN_TTL = timedelta(hours=2)
VERIFY_TTL = timedelta(days=3)


def _issue_token(db: Session, user: User, purpose: str, ttl: timedelta) -> str:
    raw, hashed = new_url_token()
    db.add(
        EmailToken(
            user_id=user.id,
            token_hash=hashed,
            purpose=purpose,
            expires_at=utcnow() + ttl,
        )
    )
    db.flush()
    return raw


def _consume_token(db: Session, raw: str, purpose: str) -> User | None:
    record = db.scalar(
        select(EmailToken).where(
            EmailToken.token_hash == sha256_hex(raw), EmailToken.purpose == purpose
        )
    )
    if record is None or record.used_at is not None:
        return None
    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=utcnow().tzinfo)
    if expires < utcnow():
        return None
    user = db.get(User, record.user_id)
    if user is None or user.is_deleted:
        return None
    record.used_at = utcnow()
    db.flush()
    return user


def _send_verification(user: User, raw_token: str) -> None:
    link = f"{settings.base_url}/verify/{raw_token}"
    send_email(
        user.email,
        f"[{settings.site_name}] メールアドレスの確認",
        f"{settings.site_name} へのご登録ありがとうございます。\n\n"
        f"次のリンクを開くと、メールアドレスの確認が完了します（3日間有効）。\n{link}\n\n"
        "心当たりがない場合は、このメールを破棄してください。\n",
    )


def _sync_admin_role(user: User) -> None:
    """ADMIN_EMAILS に載っているアドレスだけを管理者にする。

    ブラウザから送られた値は一切見ない。サーバー側の設定のみで決める。
    """
    should_be_admin = user.email in settings.admin_emails
    if should_be_admin and user.role != "admin":
        user.role = "admin"
    elif not should_be_admin and user.role == "admin":
        user.role = "user"


# ------------------------------------------------------------------
# 新規登録
# ------------------------------------------------------------------
@router.get("/register")
def register_form(request: Request, user: User | None = Depends(get_current_user)):
    if user:
        return redirect("/mypage")
    return render(request, "auth/register.html", {"form": {}, "errors": {}})


@router.post("/register")
def register(
    request: Request,
    email: str = Form(""),
    display_name: str = Form(""),
    password: str = Form(""),
    password_confirm: str = Form(""),
    agree: str = Form(""),
    _: None = Depends(verify_csrf),
    db: Session = Depends(get_db),
):
    errors: dict[str, str] = {}
    form = {"email": email, "display_name": display_name}

    def fail(status: int = 400):
        return render(
            request,
            "auth/register.html",
            {"form": form, "errors": errors},
            status_code=status,
        )

    try:
        clean_email = services.validate_email(email)
    except ValidationError as exc:
        errors[exc.field] = exc.message
        clean_email = ""
    try:
        clean_name = services.validate_display_name(display_name)
    except ValidationError as exc:
        errors[exc.field] = exc.message
        clean_name = ""
    try:
        clean_password = services.validate_password(password, password_confirm)
    except ValidationError as exc:
        errors[exc.field] = exc.message
        clean_password = ""
    if agree != "yes":
        errors["agree"] = "利用規約とプライバシーポリシーへの同意が必要です。"

    if errors:
        return fail()

    if not ratelimit.check(db, "register_ip", client_ip(request)):
        db.rollback()
        errors["email"] = "短時間に多くの登録が行われました。しばらくお待ちください。"
        return fail(429)

    user = User(
        email=clean_email,
        display_name=clean_name,
        password_hash=hash_password(clean_password),
        email_verified=not settings.require_email_verification,
    )
    _sync_admin_role(user)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        errors["email"] = (
            "このメールアドレスはすでに登録されています。"
            "ログイン、またはパスワード再設定をお試しください。"
        )
        return fail(409)

    raw_token = _issue_token(db, user, "verify_email", VERIFY_TTL)
    db.commit()
    _send_verification(user, raw_token)

    response = redirect(
        "/", flash="verify_sent" if settings.require_email_verification else "registered"
    )
    issue_session(response, user.id, user.session_version)
    return response


@router.get("/verify/{raw_token}")
def verify_email(request: Request, raw_token: str, db: Session = Depends(get_db)):
    user = _consume_token(db, raw_token, "verify_email")
    if user is None:
        db.rollback()
        return render(
            request,
            "error.html",
            {
                "status_code": 400,
                "title": "確認リンクが無効です",
                "message": "有効期限が切れているか、すでに使用されています。"
                "マイページから確認メールを再送できます。",
            },
            status_code=400,
        )
    user.email_verified = True
    db.commit()
    return redirect("/mypage", flash="verified")


# ------------------------------------------------------------------
# ログイン／ログアウト
# ------------------------------------------------------------------
@router.get("/login")
def login_form(
    request: Request,
    next: str = Query("/"),
    user: User | None = Depends(get_current_user),
):
    if user:
        return redirect(safe_next_path(next, "/mypage"))
    return render(
        request, "auth/login.html", {"form": {}, "errors": {}, "next": safe_next_path(next)}
    )


@router.post("/login")
def login(
    request: Request,
    email: str = Form(""),
    password: str = Form(""),
    next: str = Form("/"),
    _: None = Depends(verify_csrf),
    db: Session = Depends(get_db),
):
    next_path = safe_next_path(next)
    errors: dict[str, str] = {}
    form = {"email": email}

    def fail(message: str, status: int = 400):
        errors["form"] = message
        return render(
            request,
            "auth/login.html",
            {"form": form, "errors": errors, "next": next_path},
            status_code=status,
        )

    ip = client_ip(request)
    normalized = (email or "").strip().lower()

    # 総当たり攻撃の抑制。IP単位とアカウント単位の両方で数える。
    if not ratelimit.check(db, "login_ip", ip):
        db.rollback()
        return fail("ログイン試行が多すぎます。15分ほど時間をおいてください。", 429)
    if normalized and not ratelimit.check(db, "login_email", normalized):
        db.commit()
        return fail("ログイン試行が多すぎます。15分ほど時間をおいてください。", 429)
    db.commit()

    user = db.scalar(select(User).where(User.email == normalized)) if normalized else None

    # どちらが違うかを教えない（アカウントの存在を推測されないため）
    generic = "メールアドレスまたはパスワードが正しくありません。"
    if user is None or user.is_deleted:
        # タイミング差でアカウントの有無を推測されないよう、同じ計算量をかける
        hash_password(password or "dummy-password")
        return fail(generic, 401)
    if not verify_password(user.password_hash, password or ""):
        return fail(generic, 401)

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    _sync_admin_role(user)
    user.last_login_at = utcnow()
    ratelimit.reset(db, "login_email", normalized)
    ratelimit.reset(db, "login_ip", ip)
    db.commit()

    response = redirect(next_path, flash="logged_in")
    issue_session(response, user.id, user.session_version)
    return response


@router.post("/logout")
def logout(_: None = Depends(verify_csrf)):
    response = redirect("/", flash="logged_out")
    clear_session(response)
    return response


# ------------------------------------------------------------------
# パスワード再設定
# ------------------------------------------------------------------
@router.get("/password/forgot")
def forgot_form(request: Request):
    return render(request, "auth/forgot.html", {"form": {}, "errors": {}})


@router.post("/password/forgot")
def forgot(
    request: Request,
    email: str = Form(""),
    _: None = Depends(verify_csrf),
    db: Session = Depends(get_db),
):
    normalized = (email or "").strip().lower()

    if not ratelimit.check(db, "password_reset", client_ip(request)):
        db.rollback()
        return render(
            request,
            "auth/forgot.html",
            {
                "form": {"email": email},
                "errors": {"form": "リクエストが多すぎます。時間をおいてお試しください。"},
            },
            status_code=429,
        )

    user = db.scalar(select(User).where(User.email == normalized)) if normalized else None
    if user is not None and not user.is_deleted:
        raw_token = _issue_token(db, user, "password_reset", TOKEN_TTL)
        db.commit()
        link = f"{settings.base_url}/password/reset/{raw_token}"
        send_email(
            user.email,
            f"[{settings.site_name}] パスワード再設定",
            "パスワード再設定のリクエストを受け付けました。\n\n"
            f"次のリンクから新しいパスワードを設定してください（2時間有効）。\n{link}\n\n"
            "心当たりがない場合は、このメールを破棄してください。\n",
        )
    else:
        db.commit()

    # アカウントの有無にかかわらず同じ結果を返す（存在推測の防止）
    return redirect("/login", flash="reset_sent")


@router.get("/password/reset/{raw_token}")
def reset_form(request: Request, raw_token: str, db: Session = Depends(get_db)):
    record = db.scalar(
        select(EmailToken).where(
            EmailToken.token_hash == sha256_hex(raw_token),
            EmailToken.purpose == "password_reset",
            EmailToken.used_at.is_(None),
        )
    )
    if record is None:
        return render(
            request,
            "error.html",
            {
                "status_code": 400,
                "title": "再設定リンクが無効です",
                "message": "有効期限が切れているか、すでに使用されています。もう一度お試しください。",
            },
            status_code=400,
        )
    return render(request, "auth/reset.html", {"token": raw_token, "errors": {}})


@router.post("/password/reset/{raw_token}")
def reset(
    request: Request,
    raw_token: str,
    password: str = Form(""),
    password_confirm: str = Form(""),
    _: None = Depends(verify_csrf),
    db: Session = Depends(get_db),
):
    try:
        clean_password = services.validate_password(password, password_confirm)
    except ValidationError as exc:
        return render(
            request,
            "auth/reset.html",
            {"token": raw_token, "errors": {exc.field: exc.message}},
            status_code=400,
        )

    user = _consume_token(db, raw_token, "password_reset")
    if user is None:
        db.rollback()
        return render(
            request,
            "error.html",
            {
                "status_code": 400,
                "title": "再設定リンクが無効です",
                "message": "有効期限が切れているか、すでに使用されています。",
            },
            status_code=400,
        )

    user.password_hash = hash_password(clean_password)
    # 既存のログインセッションをすべて無効にする
    user.session_version += 1
    db.commit()

    response = redirect("/login", flash="reset_done")
    clear_session(response)
    return response

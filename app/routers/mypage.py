"""マイページ（表示名変更・自分の投稿・アカウント設定・退会）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app import services
from app.config import settings
from app.db import get_db
from app.deps import require_user, verify_csrf
from app.models import Post, Thread, User, utcnow
from app.security import clear_session, hash_password, verify_password
from app.services import ValidationError
from app.templating import redirect, render
from app.utils import page_range

router = APIRouter(prefix="/mypage")


def _stats(db: Session, user: User) -> dict:
    thread_count = db.scalar(
        select(func.count())
        .select_from(Thread)
        .where(Thread.user_id == user.id, Thread.is_deleted.is_(False))
    )
    post_count = db.scalar(
        select(func.count())
        .select_from(Post)
        .where(Post.user_id == user.id, Post.is_deleted.is_(False))
    )
    return {"thread_count": thread_count or 0, "post_count": post_count or 0}


@router.get("")
def mypage(
    request: Request,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    recent = db.scalars(
        select(Post)
        .where(Post.user_id == user.id, Post.is_deleted.is_(False))
        .options(joinedload(Post.thread))
        .order_by(Post.created_at.desc())
        .limit(5)
    ).unique().all()
    return render(
        request,
        "mypage/index.html",
        {"stats": _stats(db, user), "recent_posts": list(recent), "errors": {}},
    )


@router.post("/display-name")
def update_display_name(
    request: Request,
    display_name: str = Form(""),
    _: None = Depends(verify_csrf),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        user.display_name = services.validate_display_name(display_name)
    except ValidationError as exc:
        recent = db.scalars(
            select(Post)
            .where(Post.user_id == user.id, Post.is_deleted.is_(False))
            .options(joinedload(Post.thread))
            .order_by(Post.created_at.desc())
            .limit(5)
        ).unique().all()
        return render(
            request,
            "mypage/index.html",
            {
                "stats": _stats(db, user),
                "recent_posts": list(recent),
                "errors": {exc.field: exc.message},
            },
            status_code=400,
        )
    db.commit()
    return redirect("/mypage", flash="name_updated")


@router.post("/password")
def update_password(
    request: Request,
    current_password: str = Form(""),
    password: str = Form(""),
    password_confirm: str = Form(""),
    _: None = Depends(verify_csrf),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    errors: dict[str, str] = {}
    if not verify_password(user.password_hash, current_password or ""):
        errors["current_password"] = "現在のパスワードが正しくありません。"
    else:
        try:
            services.validate_password(password, password_confirm)
        except ValidationError as exc:
            errors[exc.field] = exc.message

    if errors:
        return render(
            request, "mypage/settings.html", {"errors": errors}, status_code=400
        )

    user.password_hash = hash_password(password)
    user.session_version += 1  # 他の端末のログインもすべて無効化
    db.commit()

    response = redirect("/login", flash="password_updated")
    clear_session(response)
    return response


@router.get("/settings")
def settings_page(request: Request, user: User = Depends(require_user)):
    return render(request, "mypage/settings.html", {"errors": {}})


@router.get("/posts")
def my_posts(
    request: Request,
    page: int = Query(1, ge=1, le=10_000),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Post)
        .where(Post.user_id == user.id, Post.is_deleted.is_(False))
        .options(joinedload(Post.thread))
        .order_by(Post.created_at.desc())
    )
    posts, total, total_pages = services.paginate(db, stmt, page, settings.threads_per_page)
    return render(
        request,
        "mypage/posts.html",
        {
            "posts": posts,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
        },
    )


@router.get("/threads")
def my_threads(
    request: Request,
    page: int = Query(1, ge=1, le=10_000),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    stmt = (
        services.visible_threads()
        .where(Thread.user_id == user.id)
        .order_by(Thread.created_at.desc())
    )
    threads, total, total_pages = services.paginate(db, stmt, page, settings.threads_per_page)
    return render(
        request,
        "mypage/threads.html",
        {
            "threads": threads,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
        },
    )


@router.get("/delete")
def delete_form(request: Request, user: User = Depends(require_user)):
    return render(request, "mypage/delete.html", {"errors": {}})


@router.post("/delete")
def delete_account(
    request: Request,
    password: str = Form(""),
    confirm: str = Form(""),
    _: None = Depends(verify_csrf),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    errors: dict[str, str] = {}
    if not verify_password(user.password_hash, password or ""):
        errors["password"] = "パスワードが正しくありません。"
    if confirm.strip() != "削除します":
        errors["confirm"] = "確認欄に「削除します」と入力してください。"

    if errors:
        return render(request, "mypage/delete.html", {"errors": errors}, status_code=400)

    # 退会処理（個人情報を消し、投稿はスレッドの文脈を壊さないよう残す）。
    # 残した投稿の表示名は「退会したユーザー」になります。
    user.is_deleted = True
    user.deleted_at = utcnow()
    user.display_name = "退会したユーザー"
    user.email = f"deleted+{user.id}@deleted.invalid"  # 再利用も復元もできない値に置き換える
    user.password_hash = hash_password(f"disabled-{user.id}-{utcnow().timestamp()}")
    user.role = "user"
    user.session_version += 1
    db.commit()

    response = redirect("/", flash="account_deleted")
    clear_session(response)
    return response

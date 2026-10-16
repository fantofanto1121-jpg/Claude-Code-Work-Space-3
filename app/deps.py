"""FastAPI の依存性（Depends）。

ログイン状態の判定と権限チェックは、必ずここを通します。
ブラウザから送られてきた値（Cookie の中身や hidden フィールド）だけで
管理者かどうかを判断しては絶対にいけません。
必ず「Cookie の署名を検証 → DB からユーザーを取り直す → role を見る」順です。
"""
from __future__ import annotations

from fastapi import Depends, Form, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.errors import AppError, Forbidden, LoginRequired
from app.models import User
from app.security import csrf_token_is_valid, read_session


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """ログイン中ならユーザーを返す。未ログインなら None。"""
    data = read_session(request)
    if not data:
        return None

    user = db.get(User, data.get("uid"))
    if user is None or user.is_deleted:
        return None
    # session_version が一致しない＝パスワード変更や強制ログアウト後の古いCookie
    if user.session_version != data.get("sv"):
        return None

    request.state.current_user = user
    return user


def require_user(
    request: Request,
    user: User | None = Depends(get_current_user),
) -> User:
    """ログイン必須。未ログインならログイン画面へ。"""
    if user is None:
        raise LoginRequired(next_path=request.url.path)
    return user


def require_poster(user: User = Depends(require_user)) -> User:
    """投稿できる状態かどうか（BAN・メール確認）を確認する。"""
    if user.ban_is_active():
        reason = user.ban_reason or "利用規約違反のため"
        raise Forbidden(f"現在このアカウントは投稿を制限されています。理由: {reason}")
    if settings.require_email_verification and not user.email_verified:
        raise AppError(
            403,
            "メールアドレスの確認が必要です",
            "登録時にお送りした確認メールのリンクを開いてください。"
            "マイページから確認メールを再送できます。",
        )
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    """管理者必須。role は必ずサーバー側（DB）の値で判定する。"""
    if not user.is_admin:
        raise Forbidden("管理者のみが利用できる画面です。")
    return user


def verify_csrf(request: Request, csrf_token: str = Form(default="")) -> None:
    """すべての POST で呼ぶ。トークンが合わなければ処理を中断する。"""
    if not csrf_token_is_valid(request, csrf_token):
        raise AppError(
            400,
            "送信を受け付けられませんでした",
            "ページを開いたまま時間が経ったか、不正な送信の可能性があります。"
            "お手数ですが、前のページに戻って操作をやり直してください。",
        )

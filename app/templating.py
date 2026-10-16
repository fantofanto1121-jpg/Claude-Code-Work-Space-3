"""テンプレート描画の共通処理。

すべての画面はこの render() を通します。こうしておくと
「CSRFトークンの埋め込み」「ログイン情報」「お知らせメッセージ」を
書き忘れることがありません。
"""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.responses import Response

from app.config import BASE_DIR, settings
from app.models import REPORT_REASONS
from app.security import attach_csrf_cookie, get_or_create_csrf_token
from app.utils import excerpt, format_datetime, format_relative, render_body

templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))

# Jinja2 は既定で自動エスケープ（XSS対策）が有効。念のため明示する。
templates.env.autoescape = True
templates.env.trim_blocks = True
templates.env.lstrip_blocks = True

templates.env.filters["jst"] = format_datetime
templates.env.filters["rel"] = format_relative
templates.env.filters["postbody"] = render_body
templates.env.filters["excerpt"] = excerpt

templates.env.globals["site_name"] = settings.site_name
templates.env.globals["limits"] = settings
templates.env.globals["report_reasons"] = REPORT_REASONS

FLASH_COOKIE = "kawara_flash"

# 画面に出すお知らせは、コードで管理する（自由文をCookieに入れない）
FLASH_MESSAGES: dict[str, tuple[str, str]] = {
    "registered": ("success", "登録が完了しました。ようこそ。"),
    "verify_sent": ("info", "確認メールを送信しました。受信箱をご確認ください。"),
    "verified": ("success", "メールアドレスの確認が完了しました。"),
    "logged_in": ("success", "ログインしました。"),
    "logged_out": ("info", "ログアウトしました。"),
    "thread_created": ("success", "スレッドを作成しました。"),
    "post_created": ("success", "投稿しました。"),
    "post_deleted": ("info", "投稿を削除しました。"),
    "reported": ("success", "通報を受け付けました。運営が内容を確認します。"),
    "already_reported": ("info", "この投稿はすでに通報済みです。"),
    "name_updated": ("success", "表示名を変更しました。"),
    "password_updated": ("success", "パスワードを変更しました。再度ログインしてください。"),
    "reset_sent": ("info", "再設定用のメールを送信しました（登録がある場合のみ）。"),
    "reset_done": ("success", "パスワードを再設定しました。新しいパスワードでログインしてください。"),
    "account_deleted": ("info", "アカウントを削除しました。ご利用ありがとうございました。"),
    "admin_done": ("success", "操作を適用しました。"),
}


def render(
    request: Request,
    template_name: str,
    context: dict | None = None,
    status_code: int = 200,
) -> Response:
    ctx: dict = {"request": request}
    ctx.update(context or {})
    ctx["current_user"] = getattr(request.state, "current_user", None)
    ctx["csrf_token"] = get_or_create_csrf_token(request)

    flash_code = request.cookies.get(FLASH_COOKIE)
    ctx["flash"] = FLASH_MESSAGES.get(flash_code) if flash_code else None

    response = templates.TemplateResponse(
        request=request, name=template_name, context=ctx, status_code=status_code
    )
    attach_csrf_cookie(request, response)
    if flash_code:
        response.delete_cookie(FLASH_COOKIE, path="/")
    return response


def redirect(url: str, flash: str | None = None, status_code: int = 303) -> RedirectResponse:
    """POST のあとは必ずリダイレクト（PRGパターン）。

    リロードで二重投稿になるのを防ぎます。
    """
    response = RedirectResponse(url, status_code=status_code)
    if flash:
        response.set_cookie(
            FLASH_COOKIE,
            flash,
            max_age=60,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/",
        )
    return response

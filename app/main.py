"""アプリの入口。

  ローカル起動: uvicorn app.main:app --reload
"""
from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import BASE_DIR, settings
from app.deps import get_current_user
from app.errors import AppError, LoginRequired
from app.routers import admin, auth, mypage, pages, threads
from app.templating import render
from app.utils import safe_next_path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("kawara")

app = FastAPI(
    title=settings.site_name,
    docs_url=None,  # 自動APIドキュメントは公開しない
    redoc_url=None,
    openapi_url=None,
    # 全リクエストでログイン状態を1回だけ解決する（結果はリクエスト内で使い回される）
    dependencies=[Depends(get_current_user)],
)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")

app.include_router(pages.router)
app.include_router(auth.router)
app.include_router(threads.router)
app.include_router(mypage.router)
app.include_router(admin.router)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """基本的なセキュリティヘッダーを全応答に付ける。"""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # 外部スクリプトを一切読み込まない構成なので CSP を強めにできる
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self'; "
        "script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
    )
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(LoginRequired)
async def handle_login_required(request: Request, exc: LoginRequired):
    from app.templating import redirect

    next_path = safe_next_path(exc.next_path)
    return redirect(f"/login?next={next_path}")


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    return render(
        request,
        "error.html",
        {"status_code": exc.status_code, "title": exc.title, "message": exc.message},
        status_code=exc.status_code,
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(request: Request, exc: StarletteHTTPException):
    titles = {
        404: ("ページが見つかりません", "URL が間違っているか、削除された可能性があります。"),
        405: ("この操作は行えません", "不正な方法でページが呼び出されました。"),
        413: ("送信データが大きすぎます", "入力内容を短くしてお試しください。"),
    }
    title, message = titles.get(
        exc.status_code, ("エラーが発生しました", "時間をおいて再度お試しください。")
    )
    return render(
        request,
        "error.html",
        {"status_code": exc.status_code, "title": title, "message": message},
        status_code=exc.status_code,
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError):
    # 詳細（内部構造）は利用者に見せない
    return render(
        request,
        "error.html",
        {
            "status_code": 400,
            "title": "入力内容を確認してください",
            "message": "送信された内容に不足または誤りがあります。",
        },
        status_code=400,
    )


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):
    # ログにはスタックトレースを残すが、画面には内部情報を出さない
    logger.exception("未処理の例外: %s %s", request.method, request.url.path)
    return render(
        request,
        "error.html",
        {
            "status_code": 500,
            "title": "サーバーエラーが発生しました",
            "message": "問題が解決しない場合は、お問い合わせページからご連絡ください。",
        },
        status_code=500,
    )


@app.get("/healthz", include_in_schema=False)
async def healthz() -> PlainTextResponse:
    """稼働確認用。Render のヘルスチェックや外部の監視に使えます。"""
    return PlainTextResponse("ok")


@app.get("/robots.txt", include_in_schema=False)
async def robots() -> PlainTextResponse:
    return PlainTextResponse(
        "User-agent: *\nDisallow: /admin\nDisallow: /mypage\nDisallow: /login\n"
        "Disallow: /register\nAllow: /\n",
        media_type="text/plain",
    )

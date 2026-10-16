"""パスワード・セッション・CSRF を扱う層。

ここが認証の心臓部です。独自の暗号は一切書かず、実績のあるライブラリを使います。
- パスワード  : argon2-cffi（Argon2id。パスワードハッシュのコンテスト優勝方式）
- セッション  : itsdangerous の署名付きCookie（改ざんすると検証に失敗する）
- CSRF       : 署名付きトークンの二重送信（Cookie と フォームの値を照合）
"""
from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import settings

SESSION_COOKIE = "nextech_session"
CSRF_COOKIE = "nextech_csrf"
CSRF_FIELD = "csrf_token"

# Argon2id のパラメータ。無料枠の小さいサーバーでも現実的な値にしている。
_hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1, hash_len=32, salt_len=16)

_session_serializer = URLSafeTimedSerializer(settings.secret_key, salt="nextech.session.v1")
_csrf_serializer = URLSafeTimedSerializer(settings.secret_key, salt="nextech.csrf.v1")


# ------------------------------------------------------------------
# パスワード
# ------------------------------------------------------------------
def hash_password(raw_password: str) -> str:
    """平文パスワードをハッシュ化する。保存するのはこの戻り値だけ。"""
    return _hasher.hash(raw_password)


def verify_password(stored_hash: str, raw_password: str) -> bool:
    """パスワードが一致するか検証する。例外は握りつぶして False を返す。"""
    try:
        _hasher.verify(stored_hash, raw_password)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(stored_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(stored_hash)
    except InvalidHashError:
        return True


# ------------------------------------------------------------------
# セッション Cookie
# ------------------------------------------------------------------
def issue_session(response: Response, user_id: int, session_version: int) -> None:
    """ログイン成功時に署名付きCookieを発行する。"""
    token = _session_serializer.dumps({"uid": user_id, "sv": session_version})
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_max_age,
        httponly=True,  # JavaScript から読めない＝XSSで盗まれにくい
        secure=settings.cookie_secure,  # 本番は HTTPS のみ
        samesite="lax",  # 他サイトからのPOSTにCookieを付けない＝CSRF対策の土台
        path="/",
    )


def read_session(request: Request) -> dict | None:
    """Cookie を検証して中身を返す。署名が不正／期限切れなら None。"""
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    try:
        data = _session_serializer.loads(raw, max_age=settings.session_max_age)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict) or "uid" not in data:
        return None
    return data


def clear_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


# ------------------------------------------------------------------
# CSRF トークン
# ------------------------------------------------------------------
def get_or_create_csrf_token(request: Request) -> str:
    """このリクエストで使う CSRF トークンを返す（無ければ新規発行）。"""
    existing = request.cookies.get(CSRF_COOKIE)
    if existing:
        try:
            _csrf_serializer.loads(existing, max_age=settings.session_max_age)
            return existing
        except (BadSignature, SignatureExpired):
            pass
    # リクエスト内で使い回せるよう state に載せておく
    cached = getattr(request.state, "new_csrf_token", None)
    if cached:
        return cached
    token = _csrf_serializer.dumps(secrets.token_urlsafe(24))
    request.state.new_csrf_token = token
    return token


def attach_csrf_cookie(request: Request, response: Response) -> None:
    token = getattr(request.state, "new_csrf_token", None)
    if token:
        response.set_cookie(
            CSRF_COOKIE,
            token,
            max_age=settings.session_max_age,
            httponly=False,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/",
        )


def csrf_token_is_valid(request: Request, submitted: str | None) -> bool:
    """フォームから送られた値と Cookie の値を比較する（二重送信方式）。"""
    cookie_value = request.cookies.get(CSRF_COOKIE)
    if not cookie_value or not submitted:
        return False
    # まず署名を検証（自分の鍵で発行したものか）
    try:
        _csrf_serializer.loads(cookie_value, max_age=settings.session_max_age)
    except (BadSignature, SignatureExpired):
        return False
    # 次に Cookie と フォームの一致を定数時間で比較
    return hmac.compare_digest(cookie_value, submitted)


# ------------------------------------------------------------------
# その他
# ------------------------------------------------------------------
def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_url_token() -> tuple[str, str]:
    """(メールに載せる生トークン, DBに保存するハッシュ) を返す。"""
    raw = secrets.token_urlsafe(32)
    return raw, sha256_hex(raw)


def client_ip(request: Request) -> str:
    """接続元IP。プロキシ配下では X-Forwarded-For の先頭を使う。"""
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return request.client.host
    return "unknown"

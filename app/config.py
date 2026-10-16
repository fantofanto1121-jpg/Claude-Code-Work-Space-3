"""アプリ全体の設定。

環境変数（.env ファイル）から値を読み込みます。
ソースコードに秘密情報を直接書かないための層です。
"""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# プロジェクトのルートディレクトリ（このファイルの2つ上）
BASE_DIR = Path(__file__).resolve().parent.parent

# .env があれば読み込む。本番（Render など）では OS の環境変数が使われる。
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # --- 実行環境 ---
    app_env: str = os.getenv("APP_ENV", "development").strip().lower()
    site_name: str = os.getenv("SITE_NAME", "NEXTECH").strip() or "NEXTECH"
    base_url: str = os.getenv("BASE_URL", "http://127.0.0.1:8000").rstrip("/")

    # --- セキュリティ ---
    secret_key: str = os.getenv("SECRET_KEY", "").strip()
    trust_proxy_headers: bool = _bool("TRUST_PROXY_HEADERS", False)
    # 自動テストのときだけ false にする。本番では必ず true のままにしてください。
    rate_limit_enabled: bool = _bool("RATE_LIMIT_ENABLED", True)

    # --- データベース ---
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./bbs.db").strip()

    # --- 管理者 ---
    admin_emails: tuple[str, ...] = field(default_factory=lambda: tuple(_csv("ADMIN_EMAILS")))

    # --- メール ---
    resend_api_key: str = os.getenv("RESEND_API_KEY", "").strip()
    mail_from: str = os.getenv("MAIL_FROM", "noreply@example.com").strip()
    require_email_verification: bool = _bool("REQUIRE_EMAIL_VERIFICATION", False)

    # --- 投稿の制限値（1か所で管理して画面とサーバー検証で共有する）---
    thread_title_min: int = 2
    thread_title_max: int = 80
    post_body_min: int = 1
    post_body_max: int = 4000
    display_name_min: int = 1
    display_name_max: int = 24
    password_min: int = 10
    password_max: int = 128

    # --- 一覧の表示件数 ---
    threads_per_page: int = 20
    posts_per_page: int = 50

    # --- セッション有効期間（秒）: 30日 ---
    session_max_age: int = 60 * 60 * 24 * 30

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgres")

    @property
    def cookie_secure(self) -> bool:
        """本番（HTTPS）では Cookie に Secure 属性を付ける。"""
        return self.is_production


settings = Settings()

# SECRET_KEY が未設定のときの扱い。
# 本番では起動を止める（鍵が毎回変わるとセッションが壊れ、署名も意味を失うため）。
if not settings.secret_key:
    if settings.is_production:
        raise RuntimeError(
            "SECRET_KEY が設定されていません。本番環境では必須です。\n"
            'python -c "import secrets; print(secrets.token_urlsafe(48))" で生成してください。'
        )
    # 開発時のみ、その場限りの鍵で動かす（再起動するとログアウトされます）。
    object.__setattr__(settings, "secret_key", secrets.token_urlsafe(48))

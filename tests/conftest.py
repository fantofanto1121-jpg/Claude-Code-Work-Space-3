"""テスト共通の準備。

ポイント: app を import する「前」に環境変数を設定します。
app.config は import 時に環境変数を読むためです。
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

TEST_DB = Path(tempfile.gettempdir()) / "kawara_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-do-not-use-in-production"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["APP_ENV"] = "development"
os.environ["RATE_LIMIT_ENABLED"] = "false"  # 個別のテストで一時的に有効化する
os.environ["REQUIRE_EMAIL_VERIFICATION"] = "false"
os.environ["ADMIN_EMAILS"] = "boss@example.com"
os.environ["SITE_NAME"] = "カワラ版"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Category  # noqa: E402

DEFAULT_CATEGORY = "free"


@pytest.fixture(scope="session", autouse=True)
def _setup_database():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if not db.scalar(select(Category).where(Category.slug == DEFAULT_CATEGORY)):
            db.add(Category(slug=DEFAULT_CATEGORY, name="雑談", description="テスト用", sort_order=10))
            db.add(Category(slug="tech", name="技術", description="テスト用", sort_order=20))
            db.commit()
    yield
    engine.dispose()
    if TEST_DB.exists():
        TEST_DB.unlink()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


# ------------------------------------------------------------------
# 補助関数
# ------------------------------------------------------------------
_counter = {"n": 0}


def unique_email(prefix: str = "user") -> str:
    _counter["n"] += 1
    return f"{prefix}{_counter['n']}@example.com"


def csrf(client: TestClient) -> str:
    """フォーム送信に必要な CSRF トークンを取得する。"""
    client.get("/")
    return client.cookies.get("kawara_csrf", "")


def register(client: TestClient, email: str | None = None, name: str = "テスト太郎",
             password: str = "testpassword123") -> str:
    email = email or unique_email()
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": email,
            "display_name": name,
            "password": password,
            "password_confirm": password,
            "agree": "yes",
        },
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text[:500]
    return email


def login(client: TestClient, email: str, password: str = "testpassword123") -> None:
    response = client.post(
        "/login",
        data={"csrf_token": csrf(client), "email": email, "password": password, "next": "/"},
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text[:500]


def logout(client: TestClient) -> None:
    client.post("/logout", data={"csrf_token": csrf(client)}, follow_redirects=False)


def create_thread(client: TestClient, title: str = "テストスレッド", body: str = "本文です",
                  category: str = DEFAULT_CATEGORY) -> int:
    response = client.post(
        "/threads",
        data={"csrf_token": csrf(client), "title": title, "body": body, "category": category},
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text[:800]
    return int(response.headers["location"].split("/t/")[1].split("?")[0])


def reply(client: TestClient, thread_id: int, body: str, reply_to: str = "") -> int:
    response = client.post(
        f"/t/{thread_id}/posts",
        data={"csrf_token": csrf(client), "body": body, "reply_to_number": reply_to},
        follow_redirects=False,
    )
    return response.status_code


# テスト出力を読みやすくするため、外部ライブラリのログを抑える
import logging  # noqa: E402

logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("kawara.mail").setLevel(logging.ERROR)


ADMIN_EMAIL = "boss@example.com"


def admin_login(client: TestClient, name: str = "運営スタッフ") -> str:
    """管理者としてログインする。

    テスト用DBはセッション全体で共有されるため、
    最初のテストでは登録し、2回目以降はログインするだけにする。
    """
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": ADMIN_EMAIL,
            "display_name": name,
            "password": "testpassword123",
            "password_confirm": "testpassword123",
            "agree": "yes",
        },
        follow_redirects=False,
    )
    if response.status_code == 409:  # すでに登録済み
        login(client, ADMIN_EMAIL)
    else:
        assert response.status_code == 303, response.text[:400]
    return ADMIN_EMAIL

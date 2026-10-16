"""セキュリティのテスト（XSS・CSRF・SQLインジェクション・リダイレクト）。"""
import pytest
from sqlalchemy import select

from app.models import Post, Thread
from app.utils import render_body, safe_next_path
from tests.conftest import create_thread, csrf, login, logout, register, reply


# ------------------------------------------------------------------
# XSS
# ------------------------------------------------------------------
XSS_PAYLOADS = [
    '<script>alert("xss")</script>',
    '<img src=x onerror="alert(1)">',
    '<svg/onload=alert(1)>',
    '"><script>alert(document.cookie)</script>',
    "<iframe src='javascript:alert(1)'></iframe>",
    "<a href=\"javascript:alert(1)\">click</a>",
]


@pytest.mark.parametrize("payload", XSS_PAYLOADS)
def test_script_in_post_body_is_escaped(client, payload):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, title="XSS検証スレッド", body=f"本文: {payload}")

    page = client.get(f"/t/{thread_id}")
    assert page.status_code == 200
    # 入力した文字列が、HTMLとして解釈される形のままでは出力されていないこと
    assert payload not in page.text
    # 実行されうるタグが本文領域に現れていないこと
    body_html = page.text.split('class="post__body"')[1].split("</div>")[0]
    # 「<タグ名」の形で出ていなければ、ブラウザはタグとして解釈しない。
    # 属性名そのもの（onerror= など）は、エスケープ済みならただの文字列。
    for dangerous in ["<script", "<iframe", "<svg", "<img", "<a href"]:
        assert dangerous not in body_html, dangerous
    # ただの文字としてエスケープ表示されていること
    assert "&lt;" in body_html


def test_script_in_thread_title_is_escaped(client):
    email = register(client)
    login(client, email)
    create_thread(client, title='<script>alert(1)</script>危険', body="本文")
    page = client.get("/c/free")
    assert "<script>alert(1)</script>" not in page.text
    assert "&lt;script&gt;" in page.text


def test_script_in_display_name_is_escaped(client):
    email = register(client, name="<script>evil</script>")
    login(client, email)
    thread_id = create_thread(client, body="表示名の確認")
    page = client.get(f"/t/{thread_id}")
    assert "<script>evil</script>" not in page.text


def test_render_body_unit():
    out = str(render_body('<b>太字</b>', thread_id=1))
    assert "&lt;b&gt;" in out
    assert "<b>" not in out

    anchors = str(render_body(">>5 を参照", thread_id=7))
    assert 'href="/t/7#r5"' in anchors

    link = str(render_body("https://example.com/a?b=1&c=2", thread_id=1))
    assert 'rel="nofollow noopener noreferrer"' in link
    assert "&amp;" in link

    # javascript: スキームはリンク化しない
    js = str(render_body("javascript:alert(1)", thread_id=1))
    assert "<a href" not in js


# ------------------------------------------------------------------
# CSRF
# ------------------------------------------------------------------
def test_post_without_csrf_token_is_rejected(client):
    email = register(client)
    login(client, email)
    response = client.post(
        "/threads", data={"title": "CSRFなし", "body": "本文", "category": "free"}
    )
    assert response.status_code == 400
    assert "送信を受け付けられませんでした" in response.text


def test_post_with_wrong_csrf_token_is_rejected(client):
    email = register(client)
    login(client, email)
    response = client.post(
        "/threads",
        data={"csrf_token": "forged-token", "title": "偽造", "body": "本文", "category": "free"},
    )
    assert response.status_code == 400


def test_reply_without_csrf_token_is_rejected(client, db):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="CSRF確認")
    response = client.post(
        f"/t/{thread_id}/posts", data={"body": "トークン無しの返信", "reply_to_number": ""}
    )
    assert response.status_code == 400
    assert db.get(Thread, thread_id).post_count == 1


def test_login_without_csrf_token_is_rejected(client):
    email = register(client)
    logout(client)
    response = client.post("/login", data={"email": email, "password": "testpassword123"})
    assert response.status_code == 400


def test_session_cookie_is_httponly(client):
    register(client)
    # TestClient のクッキージャーからは属性を読めないので、ログイン応答のヘッダーを直接確認する
    logout(client)
    email = register(client)
    logout(client)
    response = client.post(
        "/login",
        data={"csrf_token": csrf(client), "email": email, "password": "testpassword123", "next": "/"},
        follow_redirects=False,
    )
    raw = response.headers.get("set-cookie", "")
    assert "kawara_session" in raw
    assert "HttpOnly" in raw
    assert "SameSite=lax" in raw or "samesite=lax" in raw.lower()


# ------------------------------------------------------------------
# SQL インジェクション
# ------------------------------------------------------------------
@pytest.mark.parametrize(
    "payload",
    [
        "' OR '1'='1",
        "'; DROP TABLE posts; --",
        "1' UNION SELECT email FROM users --",
        "%' OR 1=1 --",
    ],
)
def test_sql_injection_in_search_is_harmless(client, db, payload):
    email = register(client)
    login(client, email)
    create_thread(client, title="インジェクション検証", body="無事であること")

    response = client.get("/search", params={"q": payload})
    assert response.status_code == 200
    # テーブルが消えていない＝クエリが文字列として扱われた
    assert db.scalar(select(Thread.id).limit(1)) is not None
    assert db.scalar(select(Post.id).limit(1)) is not None


def test_sql_injection_in_login_does_not_authenticate(client):
    logout(client)
    response = client.post(
        "/login",
        data={
            "csrf_token": csrf(client),
            "email": "' OR '1'='1",
            "password": "' OR '1'='1",
            "next": "/",
        },
    )
    assert response.status_code in (400, 401)
    assert client.get("/mypage", follow_redirects=False).status_code == 303


def test_like_wildcards_are_escaped(client):
    """検索の % や _ がワイルドカードとして効かないこと。"""
    email = register(client)
    login(client, email)
    create_thread(client, title="ワイルドカード検証スレッド", body="中身")
    response = client.get("/search", params={"q": "%%%"})
    assert "ワイルドカード検証スレッド" not in response.text


# ------------------------------------------------------------------
# オープンリダイレクト
# ------------------------------------------------------------------
def test_safe_next_path_unit():
    assert safe_next_path("/mypage") == "/mypage"
    assert safe_next_path("https://evil.example.com") == "/"
    assert safe_next_path("//evil.example.com") == "/"
    assert safe_next_path("/\\evil.example.com") == "/"
    assert safe_next_path(None) == "/"


def test_login_cannot_redirect_to_external_site(client):
    email = register(client)
    logout(client)
    response = client.post(
        "/login",
        data={
            "csrf_token": csrf(client),
            "email": email,
            "password": "testpassword123",
            "next": "https://evil.example.com/steal",
        },
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/"


# ------------------------------------------------------------------
# セキュリティヘッダー
# ------------------------------------------------------------------
def test_security_headers_present(client):
    response = client.get("/")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "Content-Security-Policy" in response.headers
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]


def test_api_docs_are_not_exposed(client):
    for path in ["/docs", "/redoc", "/openapi.json"]:
        assert client.get(path).status_code == 404, path


# ------------------------------------------------------------------
# レート制限
# ------------------------------------------------------------------
def test_rate_limit_blocks_rapid_posting(client, monkeypatch):
    import app.ratelimit as ratelimit

    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="レート制限の確認")

    monkeypatch.setattr(ratelimit, "ENABLED", True)
    assert reply(client, thread_id, "1回目の投稿です") == 303
    assert reply(client, thread_id, "2回目はすぐなので弾かれるはず") == 429

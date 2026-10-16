"""会員登録・ログイン周りのテスト（正常系と入力エラー）。"""
from tests.conftest import csrf, login, logout, register, unique_email


def test_register_and_session_persists(client):
    register(client, name="会員A")
    page = client.get("/mypage")
    assert page.status_code == 200
    assert "会員A" in page.text


def test_register_rejects_duplicate_email(client):
    email = register(client)
    logout(client)
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": email,
            "display_name": "別の人",
            "password": "anotherpass123",
            "password_confirm": "anotherpass123",
            "agree": "yes",
        },
    )
    assert response.status_code == 409
    assert "すでに登録されています" in response.text


def test_register_rejects_short_password(client):
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": unique_email(),
            "display_name": "短い",
            "password": "abc1",
            "password_confirm": "abc1",
            "agree": "yes",
        },
    )
    assert response.status_code == 400
    assert "10文字以上" in response.text


def test_register_rejects_letters_only_password(client):
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": unique_email(),
            "display_name": "単純",
            "password": "passwordpassword",
            "password_confirm": "passwordpassword",
            "agree": "yes",
        },
    )
    assert response.status_code == 400
    assert "英字と数字" in response.text


def test_register_rejects_password_mismatch(client):
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": unique_email(),
            "display_name": "不一致",
            "password": "testpassword123",
            "password_confirm": "testpassword999",
            "agree": "yes",
        },
    )
    assert response.status_code == 400
    assert "一致しません" in response.text


def test_register_requires_agreement(client):
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": unique_email(),
            "display_name": "未同意",
            "password": "testpassword123",
            "password_confirm": "testpassword123",
            "agree": "",
        },
    )
    assert response.status_code == 400
    assert "同意が必要" in response.text


def test_register_rejects_invalid_email(client):
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": "not-an-email",
            "display_name": "形式違反",
            "password": "testpassword123",
            "password_confirm": "testpassword123",
            "agree": "yes",
        },
    )
    assert response.status_code == 400
    assert "形式が正しくありません" in response.text


def test_login_with_wrong_password_fails(client):
    email = register(client)
    logout(client)
    response = client.post(
        "/login",
        data={"csrf_token": csrf(client), "email": email, "password": "wrongpassword123", "next": "/"},
    )
    assert response.status_code == 401
    assert "メールアドレスまたはパスワードが正しくありません" in response.text


def test_login_for_unknown_account_gives_same_message(client):
    response = client.post(
        "/login",
        data={
            "csrf_token": csrf(client),
            "email": "nobody-here@example.com",
            "password": "testpassword123",
            "next": "/",
        },
    )
    assert response.status_code == 401
    assert "メールアドレスまたはパスワードが正しくありません" in response.text


def test_logout_clears_session(client):
    email = register(client)
    logout(client)
    assert client.get("/mypage", follow_redirects=False).status_code == 303
    login(client, email)
    assert client.get("/mypage").status_code == 200


def test_password_change_invalidates_other_sessions(client):
    """パスワード変更で session_version が上がり、古いCookieが無効になること。"""
    email = register(client)
    old_cookie = client.cookies.get("kawara_session")

    response = client.post(
        "/mypage/password",
        data={
            "csrf_token": csrf(client),
            "current_password": "testpassword123",
            "password": "brandnewpass456",
            "password_confirm": "brandnewpass456",
        },
        follow_redirects=False,
    )
    assert response.status_code == 303

    client.cookies.clear()
    client.cookies.set("kawara_session", old_cookie)
    assert client.get("/mypage", follow_redirects=False).status_code == 303

    client.cookies.clear()
    login(client, email, "brandnewpass456")
    assert client.get("/mypage").status_code == 200


def test_password_reset_does_not_leak_account_existence(client):
    response = client.post(
        "/password/forgot",
        data={"csrf_token": csrf(client), "email": "ghost@example.com"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/login"


def test_account_deletion_blocks_login(client):
    email = register(client, name="退会予定")
    response = client.post(
        "/mypage/delete",
        data={"csrf_token": csrf(client), "password": "testpassword123", "confirm": "削除します"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    client.cookies.clear()
    fail = client.post(
        "/login",
        data={"csrf_token": csrf(client), "email": email, "password": "testpassword123", "next": "/"},
    )
    assert fail.status_code == 401


def test_account_deletion_requires_confirmation_text(client):
    register(client)
    response = client.post(
        "/mypage/delete",
        data={"csrf_token": csrf(client), "password": "testpassword123", "confirm": "はい"},
    )
    assert response.status_code == 400
    assert "削除します" in response.text

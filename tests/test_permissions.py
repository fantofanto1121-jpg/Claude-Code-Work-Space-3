"""権限のテスト。『他人の投稿を勝手に操作できないこと』を確認します。"""
from sqlalchemy import select

from app.models import Post, Thread, User
from tests.conftest import admin_login, create_thread, csrf, login, logout, register, unique_email


# ------------------------------------------------------------------
# 未ログイン時のアクセス制御
# ------------------------------------------------------------------
def test_anonymous_cannot_open_thread_form(client):
    response = client.get("/threads/new", follow_redirects=False)
    assert response.status_code == 303
    assert "/login" in response.headers["location"]


def test_anonymous_cannot_create_thread(client):
    response = client.post(
        "/threads",
        data={"csrf_token": csrf(client), "title": "不正作成", "body": "本文", "category": "free"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert "/login" in response.headers["location"]
    # スレッドが実際に作られていないことをDBで確認する
    assert client.get("/search", params={"q": "不正作成"}).text.count(
        "一致するスレッドが見つかりませんでした"
    ) == 1


def test_anonymous_cannot_reply(client):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="本文")
    logout(client)

    response = client.post(
        f"/t/{thread_id}/posts",
        data={"csrf_token": csrf(client), "body": "未ログインの返信", "reply_to_number": ""},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert "/login" in response.headers["location"]
    assert "未ログインの返信" not in client.get(f"/t/{thread_id}").text


def test_anonymous_cannot_open_mypage_or_admin(client):
    for path in ["/mypage", "/mypage/settings", "/mypage/posts", "/admin", "/admin/reports"]:
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 303, path
        assert "/login" in response.headers["location"], path


# ------------------------------------------------------------------
# 他人の投稿の操作
# ------------------------------------------------------------------
def test_user_cannot_delete_another_users_post(client, db):
    owner_email = register(client, name="投稿者")
    login(client, owner_email)
    thread_id = create_thread(client, body="他人には消させない本文")
    post = db.scalar(select(Post).where(Post.thread_id == thread_id, Post.post_number == 1))
    logout(client)

    attacker_email = register(client, name="第三者")
    login(client, attacker_email)
    response = client.post(f"/posts/{post.id}/delete", data={"csrf_token": csrf(client)})

    assert response.status_code == 403
    assert "自分の投稿以外は削除できません" in response.text

    db.expire_all()
    assert db.get(Post, post.id).is_deleted is False
    assert "他人には消させない本文" in client.get(f"/t/{thread_id}").text


def test_normal_user_cannot_reach_admin_pages(client):
    email = register(client, name="一般会員")
    login(client, email)
    for path in ["/admin", "/admin/reports", "/admin/users", "/admin/threads", "/admin/logs"]:
        response = client.get(path)
        assert response.status_code == 403, path
        assert "権限がありません" in response.text


def test_normal_user_cannot_perform_admin_actions(client, db):
    email = register(client, name="権限なし")
    login(client, email)
    thread_id = create_thread(client, body="ロックされないはず")

    response = client.post(
        f"/admin/threads/{thread_id}",
        data={"csrf_token": csrf(client), "action": "lock", "note": ""},
    )
    assert response.status_code == 403
    db.expire_all()
    assert db.get(Thread, thread_id).is_locked is False


def test_role_cannot_be_elevated_from_the_request(client, db):
    """フォームに role=admin を混ぜても管理者にはならないこと。"""
    email = unique_email("sneaky")
    client.post(
        "/register",
        data={
            "csrf_token": csrf(client),
            "email": email,
            "display_name": "昇格希望",
            "password": "testpassword123",
            "password_confirm": "testpassword123",
            "agree": "yes",
            "role": "admin",
            "is_admin": "true",
        },
        follow_redirects=False,
    )
    user = db.scalar(select(User).where(User.email == email))
    assert user.role == "user"
    assert client.get("/admin").status_code == 403


# ------------------------------------------------------------------
# 管理者
# ------------------------------------------------------------------
def test_admin_email_gets_admin_role_and_can_moderate(client, db):
    admin_login(client)
    user = db.scalar(select(User).where(User.email == "boss@example.com"))
    assert user.role == "admin"

    dashboard = client.get("/admin")
    assert dashboard.status_code == 200
    assert "管理画面" in dashboard.text

    thread_id = create_thread(client, body="管理対象スレッド")
    response = client.post(
        f"/admin/threads/{thread_id}",
        data={"csrf_token": csrf(client), "action": "lock", "note": "テストロック"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    db.expire_all()
    assert db.get(Thread, thread_id).is_locked is True


def test_locked_thread_rejects_replies(client, db):
    admin_login(client)
    thread_id = create_thread(client, body="締め切るスレッド")
    client.post(
        f"/admin/threads/{thread_id}",
        data={"csrf_token": csrf(client), "action": "lock", "note": ""},
        follow_redirects=False,
    )
    logout(client)

    email = register(client)
    login(client, email)
    response = client.post(
        f"/t/{thread_id}/posts",
        data={"csrf_token": csrf(client), "body": "ロック中の返信", "reply_to_number": ""},
    )
    assert response.status_code == 403
    assert "返信が締め切られています" in response.text


def test_banned_user_cannot_post(client, db):
    victim_email = register(client, name="制限される人")
    victim = db.scalar(select(User).where(User.email == victim_email))
    victim_id = victim.id
    logout(client)

    admin_login(client)
    response = client.post(
        f"/admin/users/{victim_id}",
        data={"csrf_token": csrf(client), "action": "ban", "days": "7", "note": "テスト制限"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    logout(client)

    login(client, victim_email)
    thread_response = client.post(
        "/threads",
        data={"csrf_token": csrf(client), "title": "制限中の投稿", "body": "本文", "category": "free"},
    )
    assert thread_response.status_code == 403
    assert "投稿を制限されています" in thread_response.text


def test_admin_cannot_ban_self(client, db):
    admin_login(client)
    me = db.scalar(select(User).where(User.email == "boss@example.com"))
    response = client.post(
        f"/admin/users/{me.id}",
        data={"csrf_token": csrf(client), "action": "ban", "days": "7", "note": ""},
    )
    assert response.status_code == 403

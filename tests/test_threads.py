"""スレッド作成・返信・削除のテスト。"""
from sqlalchemy import select

from app.models import Post, Thread
from tests.conftest import create_thread, csrf, login, register, reply


def test_create_thread_and_first_post_is_number_one(client, db):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, title="最初のスレッド", body="1番目の本文")

    thread = db.get(Thread, thread_id)
    assert thread.title == "最初のスレッド"
    assert thread.post_count == 1

    first = db.scalar(select(Post).where(Post.thread_id == thread_id, Post.post_number == 1))
    assert first.body == "1番目の本文"


def test_posts_are_numbered_sequentially(client, db):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="本文0")
    for i in range(1, 5):
        assert reply(client, thread_id, f"返信その{i}") == 303

    numbers = db.scalars(
        select(Post.post_number).where(Post.thread_id == thread_id).order_by(Post.post_number)
    ).all()
    assert list(numbers) == [1, 2, 3, 4, 5]
    assert db.get(Thread, thread_id).post_count == 5


def test_data_persists_across_new_connections(client, db):
    """ブラウザを閉じても消えない＝DBに保存されていることの確認。"""
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, title="永続化の確認", body="保存されるはず")

    client.cookies.clear()  # 別のブラウザから見たのと同じ状態
    page = client.get(f"/t/{thread_id}")
    assert page.status_code == 200
    assert "保存されるはず" in page.text


def test_newlines_are_preserved(client):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="1行目\n2行目\n3行目")
    page = client.get(f"/t/{thread_id}")
    assert "1行目<br>2行目<br>3行目" in page.text


def test_reply_anchor_becomes_link(client):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="アンカー元")
    reply(client, thread_id, ">>1 に返信します", reply_to="1")
    page = client.get(f"/t/{thread_id}")
    assert f'href="/t/{thread_id}#r1"' in page.text
    assert "&gt;&gt;1 への返信" in page.text


def test_empty_body_is_rejected(client):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="本文あり")
    response = client.post(
        f"/t/{thread_id}/posts",
        data={"csrf_token": csrf(client), "body": "   \n  ", "reply_to_number": ""},
    )
    assert response.status_code == 400
    assert "本文を入力してください" in response.text


def test_title_too_long_is_rejected(client):
    email = register(client)
    login(client, email)
    response = client.post(
        "/threads",
        data={
            "csrf_token": csrf(client),
            "title": "あ" * 200,
            "body": "本文",
            "category": "free",
        },
    )
    assert response.status_code == 400
    assert "80文字以内" in response.text


def test_body_too_long_is_rejected(client):
    email = register(client)
    login(client, email)
    response = client.post(
        "/threads",
        data={
            "csrf_token": csrf(client),
            "title": "長すぎる本文",
            "body": "あ" * 5000,
            "category": "free",
        },
    )
    assert response.status_code == 400
    assert "4000文字以内" in response.text


def test_missing_category_is_rejected(client):
    email = register(client)
    login(client, email)
    response = client.post(
        "/threads",
        data={"csrf_token": csrf(client), "title": "カテゴリ無し", "body": "本文", "category": ""},
    )
    assert response.status_code == 400
    assert "カテゴリーを選んでください" in response.text


def test_author_can_delete_own_post(client, db):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="消す予定の本文")
    reply(client, thread_id, "あとで消す返信")

    post = db.scalar(select(Post).where(Post.thread_id == thread_id, Post.post_number == 2))
    response = client.post(
        f"/posts/{post.id}/delete", data={"csrf_token": csrf(client)}, follow_redirects=False
    )
    assert response.status_code == 303

    db.expire_all()
    refreshed = db.get(Post, post.id)
    assert refreshed.is_deleted is True
    assert refreshed.deleted_by == "author"

    page = client.get(f"/t/{thread_id}")
    assert "あとで消す返信" not in page.text
    assert "投稿者本人により削除されました" in page.text
    # 番号は欠番にせず残す
    assert ">2<" in page.text or "r2" in page.text


def test_duplicate_consecutive_post_is_blocked(client, monkeypatch):

    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="重複チェック元")
    assert reply(client, thread_id, "まったく同じ文章です") == 303
    assert reply(client, thread_id, "まったく同じ文章です") == 429


def test_reply_to_nonexistent_number_is_ignored(client, db):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="本文")
    reply(client, thread_id, "存在しない番号への返信", reply_to="999")
    post = db.scalar(select(Post).where(Post.thread_id == thread_id, Post.post_number == 2))
    assert post.reply_to_number is None


def test_thread_not_found(client):
    assert client.get("/t/999999").status_code == 404

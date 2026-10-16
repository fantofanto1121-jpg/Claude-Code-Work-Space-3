"""投稿番号の採番が壊れないことのテスト。

掲示板で一番こわいのは「同時に2人が投稿して、同じ番号が2つできる」ことです。
対策は2段構え:
  1. UNIQUE 制約 (thread_id, post_number) …… DBが重複を物理的に拒否する
  2. 衝突したら採番からやり直す（リトライ）…… 拒否されても投稿は成功させる
このファイルでは、その両方が効いていることを確認します。
"""
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app import services
from app.models import Post, Thread, User
from tests.conftest import create_thread, login, register


def _setup(client, db):
    email = register(client)
    login(client, email)
    thread_id = create_thread(client, body="採番テストの本文")
    return db.get(Thread, thread_id), db.scalar(select(User).where(User.email == email))


def test_duplicate_post_number_is_rejected_by_the_database(client, db):
    """UNIQUE 制約が本当に効いているか（アプリを通さず直接確認）。"""
    thread, user = _setup(client, db)

    db.add(
        Post(thread_id=thread.id, user_id=user.id, post_number=1, body="番号1の重複", body_hash="x")
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_add_post_retries_after_a_numbering_collision(client, db, monkeypatch):
    """採番が古い値を返しても、リトライで正しい番号に落ち着くこと。

    実際の同時投稿では、2人が同じ「次の番号」を計算してしまう瞬間があります。
    その状況を、1回目だけ古い番号を返すようにして再現します。
    """
    thread, user = _setup(client, db)
    services.add_post(db, thread, user, "2番目の投稿")
    db.commit()

    real_max = services._max_post_number
    calls = {"n": 0}

    def stale_then_real(session, thread_id):
        calls["n"] += 1
        if calls["n"] == 1:
            return 1  # 他の人がすでに2番を取った直後、という状況
        return real_max(session, thread_id)

    monkeypatch.setattr(services, "_max_post_number", stale_then_real)

    post = services.add_post(db, thread, user, "3番目になるはずの投稿")
    db.commit()

    assert calls["n"] >= 2, "衝突後にリトライされていない"
    assert post.post_number == 3

    numbers = db.scalars(
        select(Post.post_number).where(Post.thread_id == thread.id).order_by(Post.post_number)
    ).all()
    assert list(numbers) == [1, 2, 3]


def test_no_duplicate_numbers_after_many_posts(client, db):
    thread, user = _setup(client, db)
    for i in range(2, 22):
        services.add_post(db, thread, user, f"連続投稿 {i}")
    db.commit()

    total = db.scalar(
        select(func.count()).select_from(Post).where(Post.thread_id == thread.id)
    )
    distinct = db.scalar(
        select(func.count(func.distinct(Post.post_number))).where(Post.thread_id == thread.id)
    )
    assert total == 21
    assert distinct == 21, "番号が重複している"
    db.expire_all()
    assert db.get(Thread, thread.id).post_count == 21


def test_thread_post_count_and_last_posted_at_are_updated(client, db):
    thread, user = _setup(client, db)
    before = thread.last_posted_at
    services.add_post(db, thread, user, "更新時刻の確認")
    db.commit()
    db.expire_all()

    refreshed = db.get(Thread, thread.id)
    assert refreshed.post_count == 2
    assert refreshed.last_posted_at >= before

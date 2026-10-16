"""通報機能と管理対応のテスト。"""
from sqlalchemy import select

from app.models import Post, Report
from tests.conftest import admin_login, create_thread, csrf, login, logout, register


def _make_post_by_other_user(client, db):
    author_email = register(client, name="通報される人")
    login(client, author_email)
    thread_id = create_thread(client, body="通報対象になる本文")
    post = db.scalar(select(Post).where(Post.thread_id == thread_id, Post.post_number == 1))
    logout(client)
    return thread_id, post.id


def test_report_requires_login(client, db):
    _, post_id = _make_post_by_other_user(client, db)
    response = client.get(f"/posts/{post_id}/report", follow_redirects=False)
    assert response.status_code == 303
    assert "/login" in response.headers["location"]


def test_report_is_saved(client, db):
    thread_id, post_id = _make_post_by_other_user(client, db)
    reporter_email = register(client, name="通報する人")
    login(client, reporter_email)

    form = client.get(f"/posts/{post_id}/report")
    assert form.status_code == 200
    assert "通報の理由" in form.text

    response = client.post(
        f"/posts/{post_id}/report",
        data={"csrf_token": csrf(client), "reason": "spam", "detail": "宣伝です"},
        follow_redirects=False,
    )
    assert response.status_code == 303

    report = db.scalar(select(Report).where(Report.post_id == post_id))
    assert report is not None
    assert report.reason == "spam"
    assert report.status == "open"


def test_report_other_reason_requires_detail(client, db):
    _, post_id = _make_post_by_other_user(client, db)
    login(client, register(client, name="詳細なし"))
    response = client.post(
        f"/posts/{post_id}/report",
        data={"csrf_token": csrf(client), "reason": "other", "detail": "短い"},
    )
    assert response.status_code == 400
    assert "5文字以上" in response.text


def test_duplicate_report_is_handled(client, db):
    _, post_id = _make_post_by_other_user(client, db)
    login(client, register(client, name="二重通報"))
    data = {"csrf_token": csrf(client), "reason": "abuse", "detail": ""}
    assert client.post(f"/posts/{post_id}/report", data=data, follow_redirects=False).status_code == 303
    second = client.post(
        f"/posts/{post_id}/report",
        data={"csrf_token": csrf(client), "reason": "abuse", "detail": ""},
        follow_redirects=False,
    )
    assert second.status_code == 303
    count = len(db.scalars(select(Report).where(Report.post_id == post_id)).all())
    assert count == 1


def test_admin_can_hide_reported_post_and_action_is_logged(client, db):
    from app.models import ModerationAction

    thread_id, post_id = _make_post_by_other_user(client, db)
    login(client, register(client, name="通報者B"))
    client.post(
        f"/posts/{post_id}/report",
        data={"csrf_token": csrf(client), "reason": "abuse", "detail": "攻撃的"},
        follow_redirects=False,
    )
    report = db.scalar(select(Report).where(Report.post_id == post_id))
    logout(client)

    admin_login(client)
    page = client.get("/admin/reports")
    assert page.status_code == 200
    assert "通報対象になる本文" in page.text

    response = client.post(
        f"/admin/reports/{report.id}",
        data={"csrf_token": csrf(client), "action": "hide", "note": "ガイドライン違反"},
        follow_redirects=False,
    )
    assert response.status_code == 303

    db.expire_all()
    assert db.get(Post, post_id).is_deleted is True
    assert db.get(Report, report.id).status == "resolved"

    logged = db.scalars(
        select(ModerationAction).where(
            ModerationAction.target_type == "post", ModerationAction.target_id == post_id
        )
    ).all()
    assert any(a.action == "hide_post" for a in logged)
    assert "通報対象になる本文" not in client.get(f"/t/{thread_id}").text

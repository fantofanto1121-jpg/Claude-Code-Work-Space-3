"""管理画面。

ここに入れるのは role = 'admin' のユーザーだけです。
role はデータベースの値であり、ADMIN_EMAILS（サーバー側の環境変数）に
載っているアドレスでログインしたときにだけ付与されます。
リクエストに含まれる値で管理者判定することはありません。
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Form, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app import services
from app.config import settings
from app.db import get_db
from app.deps import require_admin, verify_csrf
from app.errors import NotFound
from app.models import ModerationAction, Post, Report, Thread, User, utcnow
from app.templating import redirect, render
from app.utils import page_range

router = APIRouter(prefix="/admin")


@router.get("")
def dashboard(
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    def count(model, *conditions):
        stmt = select(func.count()).select_from(model)
        if conditions:
            stmt = stmt.where(*conditions)
        return db.scalar(stmt) or 0

    recent_actions = db.scalars(
        select(ModerationAction).order_by(ModerationAction.created_at.desc()).limit(10)
    ).all()

    return render(
        request,
        "admin/dashboard.html",
        {
            "stats": {
                "users": count(User, User.is_deleted.is_(False)),
                "threads": count(Thread, Thread.is_deleted.is_(False)),
                "posts": count(Post, Post.is_deleted.is_(False)),
                "open_reports": count(Report, Report.status == "open"),
                "banned": count(User, User.is_banned.is_(True)),
            },
            "recent_actions": list(recent_actions),
        },
    )


# ------------------------------------------------------------------
# 通報の確認
# ------------------------------------------------------------------
@router.get("/reports")
def reports(
    request: Request,
    status: str = Query("open"),
    page: int = Query(1, ge=1, le=10_000),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    status = status if status in {"open", "resolved", "rejected", "all"} else "open"
    stmt = (
        select(Report)
        .options(joinedload(Report.post).joinedload(Post.thread))
        .order_by(Report.created_at.desc())
    )
    if status != "all":
        stmt = stmt.where(Report.status == status)

    rows, total, total_pages = services.paginate(db, stmt, page, 20)
    return render(
        request,
        "admin/reports.html",
        {
            "reports": rows,
            "status": status,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
        },
    )


@router.post("/reports/{report_id}")
def handle_report(
    request: Request,
    report_id: int,
    action: str = Form(""),
    note: str = Form(""),
    _: None = Depends(verify_csrf),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    report = db.get(Report, report_id)
    if report is None:
        raise NotFound("その通報は存在しません。")

    post = db.get(Post, report.post_id)

    if action == "hide" and post is not None and not post.is_deleted:
        services.soft_delete_post(db, post, by="admin")
        services.log_moderation(db, admin, "hide_post", "post", post.id, note)
        report.status = "resolved"
    elif action == "reject":
        report.status = "rejected"
        services.log_moderation(db, admin, "reject_report", "report", report.id, note)
    else:
        report.status = "resolved"
        services.log_moderation(db, admin, "resolve_report", "report", report.id, note)

    report.handled_at = utcnow()
    report.handled_by = admin.id
    db.commit()
    return redirect("/admin/reports", flash="admin_done")


# ------------------------------------------------------------------
# 投稿・スレッドの操作
# ------------------------------------------------------------------
@router.post("/posts/{post_id}/toggle")
def toggle_post(
    request: Request,
    post_id: int,
    note: str = Form(""),
    _: None = Depends(verify_csrf),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    post = db.get(Post, post_id)
    if post is None:
        raise NotFound("その投稿は存在しません。")

    if post.is_deleted:
        post.is_deleted = False
        post.deleted_at = None
        post.deleted_by = None
        services.log_moderation(db, admin, "restore_post", "post", post.id, note)
    else:
        services.soft_delete_post(db, post, by="admin")
        services.log_moderation(db, admin, "hide_post", "post", post.id, note)
    db.commit()
    return redirect(f"/t/{post.thread_id}", flash="admin_done")


@router.get("/threads")
def admin_threads(
    request: Request,
    page: int = Query(1, ge=1, le=10_000),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Thread)
        .options(joinedload(Thread.category), joinedload(Thread.author))
        .order_by(Thread.last_posted_at.desc())
    )
    rows, total, total_pages = services.paginate(db, stmt, page, settings.threads_per_page)
    return render(
        request,
        "admin/threads.html",
        {
            "threads": rows,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
        },
    )


@router.post("/threads/{thread_id}")
def update_thread(
    request: Request,
    thread_id: int,
    action: str = Form(""),
    note: str = Form(""),
    _: None = Depends(verify_csrf),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    thread = db.get(Thread, thread_id)
    if thread is None:
        raise NotFound("そのスレッドは存在しません。")

    if action == "lock":
        thread.is_locked = True
        services.log_moderation(db, admin, "lock_thread", "thread", thread.id, note)
    elif action == "unlock":
        thread.is_locked = False
        services.log_moderation(db, admin, "unlock_thread", "thread", thread.id, note)
    elif action == "delete":
        thread.is_deleted = True
        services.log_moderation(db, admin, "delete_thread", "thread", thread.id, note)
    elif action == "restore":
        thread.is_deleted = False
        services.log_moderation(db, admin, "restore_thread", "thread", thread.id, note)
    db.commit()
    return redirect("/admin/threads", flash="admin_done")


# ------------------------------------------------------------------
# 利用者の制限
# ------------------------------------------------------------------
@router.get("/users")
def admin_users(
    request: Request,
    q: str = Query("", max_length=80),
    page: int = Query(1, ge=1, le=10_000),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(User).order_by(User.created_at.desc())
    keyword = q.strip()
    if keyword:
        pattern = f"%{keyword}%"
        stmt = stmt.where(User.display_name.ilike(pattern))

    rows, total, total_pages = services.paginate(db, stmt, page, 30)
    return render(
        request,
        "admin/users.html",
        {
            "users": rows,
            "q": keyword,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
        },
    )


@router.post("/users/{user_id}")
def update_user(
    request: Request,
    user_id: int,
    action: str = Form(""),
    days: str = Form("7"),
    note: str = Form(""),
    _: None = Depends(verify_csrf),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None:
        raise NotFound("そのユーザーは存在しません。")
    if target.id == admin.id:
        from app.errors import Forbidden

        raise Forbidden("自分自身にこの操作は行えません。")
    if target.is_admin and action == "ban":
        from app.errors import Forbidden

        raise Forbidden("管理者を制限することはできません。")

    if action == "ban":
        try:
            day_count = max(0, min(3650, int(days)))
        except ValueError:
            day_count = 7
        target.is_banned = True
        target.banned_until = (utcnow() + timedelta(days=day_count)) if day_count else None
        target.ban_reason = (note or "")[:200]
        target.session_version += 1  # 強制ログアウト
        services.log_moderation(
            db, admin, "ban_user", "user", target.id, f"{day_count}日 / {note}"
        )
    elif action == "unban":
        target.is_banned = False
        target.banned_until = None
        target.ban_reason = None
        services.log_moderation(db, admin, "unban_user", "user", target.id, note)

    db.commit()
    return redirect("/admin/users", flash="admin_done")


# ------------------------------------------------------------------
# 操作履歴
# ------------------------------------------------------------------
@router.get("/logs")
def logs(
    request: Request,
    page: int = Query(1, ge=1, le=10_000),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(ModerationAction).order_by(ModerationAction.created_at.desc())
    rows, total, total_pages = services.paginate(db, stmt, page, 50)

    admin_ids = {row.admin_user_id for row in rows if row.admin_user_id}
    names: dict[int, str] = {}
    if admin_ids:
        for uid, name in db.execute(
            select(User.id, User.display_name).where(User.id.in_(admin_ids))
        ).all():
            names[uid] = name

    return render(
        request,
        "admin/logs.html",
        {
            "actions": rows,
            "admin_names": names,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
        },
    )

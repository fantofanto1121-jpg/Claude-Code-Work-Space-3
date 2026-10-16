"""スレッドと投稿。掲示板の中核部分。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app import ratelimit, services
from app.config import settings
from app.db import get_db
from app.deps import require_poster, require_user, verify_csrf
from app.errors import AppError, Forbidden, NotFound
from app.models import Post, REPORT_REASONS, Report, Thread, User
from app.services import ValidationError
from app.templating import redirect, render
from app.utils import page_range

router = APIRouter()


def _get_thread(db: Session, thread_id: int, *, allow_deleted: bool = False) -> Thread:
    thread = db.scalar(
        select(Thread)
        .where(Thread.id == thread_id)
        .options(joinedload(Thread.category), joinedload(Thread.author))
    )
    if thread is None or (thread.is_deleted and not allow_deleted):
        raise NotFound("そのスレッドは存在しないか、削除されています。")
    return thread


# ------------------------------------------------------------------
# スレッド作成
# ------------------------------------------------------------------
@router.get("/threads/new")
def new_thread_form(
    request: Request,
    category: str = Query(""),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    categories = services.get_categories(db)
    return render(
        request,
        "thread_new.html",
        {
            "categories": categories,
            "selected_slug": category,
            "form": {"title": "", "body": "", "category": category},
            "errors": {},
        },
    )


@router.post("/threads")
def create_thread(
    request: Request,
    title: str = Form(""),
    body: str = Form(""),
    category: str = Form(""),
    _: None = Depends(verify_csrf),
    user: User = Depends(require_poster),
    db: Session = Depends(get_db),
):
    categories = services.get_categories(db)
    errors: dict[str, str] = {}
    form = {"title": title, "body": body, "category": category}

    def fail(status: int = 400):
        return render(
            request,
            "thread_new.html",
            {
                "categories": categories,
                "selected_slug": category,
                "form": form,
                "errors": errors,
            },
            status_code=status,
        )

    target = next((c for c in categories if c.slug == category), None)
    if target is None:
        errors["category"] = "カテゴリーを選んでください。"

    try:
        clean_title = services.validate_title(title)
    except ValidationError as exc:
        errors[exc.field] = exc.message
        clean_title = ""
    try:
        clean_body = services.validate_body(body)
    except ValidationError as exc:
        errors[exc.field] = exc.message
        clean_body = ""

    if errors:
        return fail()

    if not ratelimit.check(db, "thread_create", str(user.id)):
        errors["title"] = "短時間に多くのスレッドを作成しています。1時間ほどお待ちください。"
        db.rollback()
        return fail(429)
    if not ratelimit.check(db, "post_interval", str(user.id)):
        errors["body"] = "投稿の間隔が短すぎます。15秒ほどお待ちください。"
        db.rollback()
        return fail(429)

    assert target is not None
    thread, _post = services.create_thread(db, target, user, clean_title, clean_body)
    db.commit()
    return redirect(f"/t/{thread.id}", flash="thread_created")


# ------------------------------------------------------------------
# スレッド詳細
# ------------------------------------------------------------------
@router.get("/t/{thread_id}")
def thread_detail(
    request: Request,
    thread_id: int,
    page: int = Query(1, ge=1, le=10_000),
    reply: int | None = Query(None, ge=1, le=999_999),
    db: Session = Depends(get_db),
):
    thread = _get_thread(db, thread_id)

    stmt = (
        select(Post)
        .where(Post.thread_id == thread.id)
        .options(joinedload(Post.author))
        .order_by(Post.post_number)
    )
    posts, total, total_pages = services.paginate(db, stmt, page, settings.posts_per_page)

    return render(
        request,
        "thread_detail.html",
        {
            "thread": thread,
            "posts": posts,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
            "reply_to": reply,
            "form": {"body": "", "reply_to_number": reply or ""},
            "errors": {},
        },
    )


# ------------------------------------------------------------------
# 返信
# ------------------------------------------------------------------
@router.post("/t/{thread_id}/posts")
def create_post(
    request: Request,
    thread_id: int,
    body: str = Form(""),
    reply_to_number: str = Form(""),
    _: None = Depends(verify_csrf),
    user: User = Depends(require_poster),
    db: Session = Depends(get_db),
):
    thread = _get_thread(db, thread_id)
    if thread.is_locked:
        raise Forbidden("このスレッドは返信が締め切られています。")

    errors: dict[str, str] = {}
    try:
        clean_body = services.validate_body(body)
    except ValidationError as exc:
        errors[exc.field] = exc.message
        clean_body = ""

    def fail(status: int = 400):
        last_page = max(1, (thread.post_count + settings.posts_per_page - 1) // settings.posts_per_page)
        stmt = (
            select(Post)
            .where(Post.thread_id == thread.id)
            .options(joinedload(Post.author))
            .order_by(Post.post_number)
        )
        posts, total, total_pages = services.paginate(
            db, stmt, last_page, settings.posts_per_page
        )
        return render(
            request,
            "thread_detail.html",
            {
                "thread": thread,
                "posts": posts,
                "total": total,
                "page": min(last_page, total_pages),
                "total_pages": total_pages,
                "pages": page_range(min(last_page, total_pages), total_pages),
                "reply_to": services.parse_reply_to(reply_to_number),
                "form": {"body": body, "reply_to_number": reply_to_number},
                "errors": errors,
            },
            status_code=status,
        )

    if errors:
        return fail()

    if not ratelimit.check(db, "post_interval", str(user.id)):
        db.rollback()
        errors["body"] = "投稿の間隔が短すぎます。15秒ほど待ってからお試しください。"
        return fail(429)
    if not ratelimit.check(db, "post_create", str(user.id)):
        db.rollback()
        errors["body"] = "短時間の投稿が多すぎます。しばらくお待ちください。"
        return fail(429)
    if services.is_duplicate_post(db, user, clean_body):
        db.rollback()
        errors["body"] = "直前と同じ内容は連続して投稿できません。"
        return fail(429)

    post = services.add_post(
        db, thread, user, clean_body, services.parse_reply_to(reply_to_number)
    )
    db.commit()

    page = max(1, (post.post_number + settings.posts_per_page - 1) // settings.posts_per_page)
    return redirect(f"/t/{thread.id}?page={page}#r{post.post_number}", flash="post_created")


# ------------------------------------------------------------------
# 投稿の削除（本人のみ）
# ------------------------------------------------------------------
@router.post("/posts/{post_id}/delete")
def delete_post(
    request: Request,
    post_id: int,
    _: None = Depends(verify_csrf),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    post = db.get(Post, post_id)
    if post is None or post.is_deleted:
        raise NotFound("その投稿は存在しないか、すでに削除されています。")

    # ここが権限チェック。本人か管理者以外は絶対に通さない。
    if post.user_id != user.id and not user.is_admin:
        raise Forbidden("自分の投稿以外は削除できません。")

    by = "author" if post.user_id == user.id else "admin"
    services.soft_delete_post(db, post, by=by)
    if by == "admin":
        services.log_moderation(db, user, "delete_post", "post", post.id, "管理者による削除")
    db.commit()

    page = max(1, (post.post_number + settings.posts_per_page - 1) // settings.posts_per_page)
    return redirect(f"/t/{post.thread_id}?page={page}", flash="post_deleted")


# ------------------------------------------------------------------
# 通報
# ------------------------------------------------------------------
@router.get("/posts/{post_id}/report")
def report_form(
    request: Request,
    post_id: int,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    post = db.scalar(select(Post).where(Post.id == post_id).options(joinedload(Post.thread)))
    if post is None:
        raise NotFound("その投稿は存在しません。")
    return render(
        request,
        "report.html",
        {"post": post, "thread": post.thread, "errors": {}, "form": {}},
    )


@router.post("/posts/{post_id}/report")
def submit_report(
    request: Request,
    post_id: int,
    reason: str = Form(""),
    detail: str = Form(""),
    _: None = Depends(verify_csrf),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    post = db.scalar(select(Post).where(Post.id == post_id).options(joinedload(Post.thread)))
    if post is None:
        raise NotFound("その投稿は存在しません。")

    errors: dict[str, str] = {}
    if reason not in REPORT_REASONS:
        errors["reason"] = "通報の理由を選んでください。"
    detail = (detail or "").strip()[:500]
    if reason == "other" and len(detail) < 5:
        errors["detail"] = "「その他」を選んだ場合は、内容を5文字以上で説明してください。"

    if errors:
        return render(
            request,
            "report.html",
            {
                "post": post,
                "thread": post.thread,
                "errors": errors,
                "form": {"reason": reason, "detail": detail},
            },
            status_code=400,
        )

    if not ratelimit.check(db, "report_create", str(user.id)):
        db.rollback()
        raise AppError(
            429, "通報が多すぎます", "短時間に多くの通報が行われました。時間をおいてお試しください。"
        )

    db.add(Report(post_id=post.id, reporter_user_id=user.id, reason=reason, detail=detail))
    try:
        db.commit()
    except IntegrityError:  # 同じ投稿を二重通報
        db.rollback()
        return redirect(f"/t/{post.thread_id}#r{post.post_number}", flash="already_reported")

    return redirect(f"/t/{post.thread_id}#r{post.post_number}", flash="reported")

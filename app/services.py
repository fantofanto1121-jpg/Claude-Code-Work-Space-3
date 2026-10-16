"""ビジネスロジック層。

画面（ルーター）から DB 操作を切り離しておくと、テストが書きやすくなります。
入力検証もここに集約し、「サーバー側で必ず検証する」を徹底します。
"""
from __future__ import annotations

import re
from datetime import timedelta

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.errors import AppError
from app.models import (
    Category,
    ModerationAction,
    Post,
    Thread,
    User,
    utcnow,
)
from app.security import sha256_hex
from app.utils import normalize_single_line, normalize_text

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")
# 表示名に使えない文字（制御文字・特殊空白）を弾く
# タイトル・表示名用。1行入力なので、改行を含むすべての制御文字と不可視文字を除去する。
CONTROL_RE = re.compile("[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\ufeff]")
# 本文用。改行(\n)とタブ(\t)は残し、それ以外の制御文字・不可視文字だけを除去する。
# \u0000-\u001f をまとめて消すと改行まで消えてしまうため、範囲を2つに分けている。
BODY_CONTROL_RE = re.compile("[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\ufeff]")


class ValidationError(Exception):
    """入力エラー。画面にそのまま表示できる日本語メッセージを持つ。"""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(message)


# ==================================================================
# 入力検証
# ==================================================================
def validate_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if not email:
        raise ValidationError("email", "メールアドレスを入力してください。")
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise ValidationError("email", "メールアドレスの形式が正しくありません。")
    return email


def validate_password(raw: str, confirm: str | None = None) -> str:
    password = raw or ""
    if len(password) < settings.password_min:
        raise ValidationError(
            "password", f"パスワードは{settings.password_min}文字以上にしてください。"
        )
    if len(password) > settings.password_max:
        raise ValidationError(
            "password", f"パスワードは{settings.password_max}文字以内にしてください。"
        )
    if password.strip() == "":
        raise ValidationError("password", "パスワードに空白だけは使えません。")
    # 単純すぎるパスワードを弾く（英字だけ・数字だけを禁止）
    if password.isdigit() or password.isalpha():
        raise ValidationError(
            "password", "パスワードは英字と数字を組み合わせてください。"
        )
    if confirm is not None and password != confirm:
        raise ValidationError("password_confirm", "確認用パスワードが一致しません。")
    return password


def validate_display_name(raw: str) -> str:
    name = normalize_single_line(raw)
    name = CONTROL_RE.sub("", name)
    if len(name) < settings.display_name_min:
        raise ValidationError("display_name", "表示名を入力してください。")
    if len(name) > settings.display_name_max:
        raise ValidationError(
            "display_name", f"表示名は{settings.display_name_max}文字以内にしてください。"
        )
    if name.lower() in {"管理人", "運営", "admin", "administrator", "管理者", "システム"}:
        raise ValidationError("display_name", "その表示名は使用できません。")
    return name


def validate_title(raw: str) -> str:
    title = normalize_single_line(raw)
    title = CONTROL_RE.sub("", title)
    if len(title) < settings.thread_title_min:
        raise ValidationError(
            "title", f"タイトルは{settings.thread_title_min}文字以上で入力してください。"
        )
    if len(title) > settings.thread_title_max:
        raise ValidationError(
            "title", f"タイトルは{settings.thread_title_max}文字以内にしてください。"
        )
    return title


def validate_body(raw: str) -> str:
    body = normalize_text(raw)
    body = BODY_CONTROL_RE.sub("", body)
    if len(body) < settings.post_body_min:
        raise ValidationError("body", "本文を入力してください。")
    if len(body) > settings.post_body_max:
        raise ValidationError(
            "body", f"本文は{settings.post_body_max}文字以内にしてください。"
        )
    # 改行だらけの荒らし対策
    if body.count("\n") > 60:
        raise ValidationError("body", "改行が多すぎます（60行以内にしてください）。")
    return body


def parse_reply_to(raw: str | None) -> int | None:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        value = int(str(raw).strip())
    except ValueError:
        return None
    return value if 1 <= value <= 999999 else None


# ==================================================================
# スレッド・投稿
# ==================================================================
def _max_post_number(db: Session, thread_id: int) -> int:
    return (
        db.scalar(select(func.max(Post.post_number)).where(Post.thread_id == thread_id)) or 0
    )


def add_post(
    db: Session,
    thread: Thread,
    user: User,
    body: str,
    reply_to_number: int | None = None,
) -> Post:
    """スレッドに投稿を追加する。

    同時に2人が投稿しても番号が重複しないようにしています。
      - PostgreSQL : スレッド行を SELECT ... FOR UPDATE でロックしてから採番
      - どちらでも  : (thread_id, post_number) の UNIQUE 制約 + 衝突時リトライ
    """
    if reply_to_number is not None:
        exists = db.scalar(
            select(func.count())
            .select_from(Post)
            .where(Post.thread_id == thread.id, Post.post_number == reply_to_number)
        )
        if not exists:
            reply_to_number = None

    body_hash = sha256_hex(body)
    last_error: Exception | None = None

    for _ in range(4):
        savepoint = db.begin_nested()
        try:
            if settings.is_postgres:
                db.execute(select(Thread.id).where(Thread.id == thread.id).with_for_update())
            number = _max_post_number(db, thread.id) + 1
            post = Post(
                thread_id=thread.id,
                user_id=user.id,
                post_number=number,
                body=body,
                reply_to_number=reply_to_number,
                body_hash=body_hash,
            )
            db.add(post)
            db.flush()
            savepoint.commit()
            thread.post_count = number
            thread.last_posted_at = post.created_at
            db.flush()
            return post
        except IntegrityError as exc:  # 番号が衝突した → もう一度採番し直す
            savepoint.rollback()
            last_error = exc

    raise AppError(
        503,
        "投稿が混み合っています",
        "同時に多くの投稿がありました。少し待ってからもう一度お試しください。",
    ) from last_error


def is_duplicate_post(db: Session, user: User, body: str, within_minutes: int = 10) -> bool:
    """直近に同じ本文を投稿していないか（コピペ連投の抑制）。"""
    since = utcnow() - timedelta(minutes=within_minutes)
    found = db.scalar(
        select(func.count())
        .select_from(Post)
        .where(
            Post.user_id == user.id,
            Post.body_hash == sha256_hex(body),
            Post.created_at >= since,
            Post.is_deleted.is_(False),
        )
    )
    return bool(found)


def create_thread(
    db: Session, category: Category, user: User, title: str, body: str
) -> tuple[Thread, Post]:
    thread = Thread(
        category_id=category.id,
        user_id=user.id,
        title=title,
        post_count=0,
        last_posted_at=utcnow(),
    )
    db.add(thread)
    db.flush()
    post = add_post(db, thread, user, body)
    return thread, post


def soft_delete_post(db: Session, post: Post, by: str) -> None:
    """投稿を論理削除する。番号は残し、本文だけ見えなくする。"""
    post.is_deleted = True
    post.deleted_at = utcnow()
    post.deleted_by = by
    # スレッド本文(1番)が消されたらスレッド自体も非表示にする
    if post.is_op:
        thread = db.get(Thread, post.thread_id)
        if thread is not None:
            thread.is_deleted = True
    db.flush()


def log_moderation(
    db: Session,
    admin: User | None,
    action: str,
    target_type: str,
    target_id: int,
    reason: str = "",
) -> None:
    db.add(
        ModerationAction(
            admin_user_id=admin.id if admin else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            reason=(reason or "")[:300],
        )
    )
    db.flush()


# ==================================================================
# 一覧・検索クエリ
# ==================================================================
SORT_OPTIONS: dict[str, str] = {
    "updated": "更新が新しい順",
    "new": "作成が新しい順",
    "popular": "レスが多い順",
}


def visible_threads() -> Select:
    return (
        select(Thread)
        .where(Thread.is_deleted.is_(False))
        .options(joinedload(Thread.category), joinedload(Thread.author))
    )


def apply_sort(stmt: Select, sort: str) -> Select:
    if sort == "new":
        return stmt.order_by(Thread.created_at.desc(), Thread.id.desc())
    if sort == "popular":
        return stmt.order_by(Thread.post_count.desc(), Thread.last_posted_at.desc())
    return stmt.order_by(Thread.last_posted_at.desc(), Thread.id.desc())


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_threads_stmt(keyword: str, category_id: int | None = None) -> Select:
    """タイトルと本文の部分一致で探す。

    日本語は単語の区切りが無いため、ここでは確実に動く部分一致（ILIKE）を使っています。
    件数が増えて遅くなったら PostgreSQL の pg_trgm インデックスを追加してください
    （migrations/002_search_index.sql に用意してあります）。
    """
    pattern = f"%{_escape_like(keyword)}%"
    body_match = (
        select(Post.thread_id)
        .where(Post.body.ilike(pattern, escape="\\"), Post.is_deleted.is_(False))
        .distinct()
    )
    stmt = visible_threads().where(
        or_(Thread.title.ilike(pattern, escape="\\"), Thread.id.in_(body_match))
    )
    if category_id:
        stmt = stmt.where(Thread.category_id == category_id)
    return stmt


def paginate(db: Session, stmt: Select, page: int, per_page: int) -> tuple[list, int, int]:
    """(その頁の行, 総件数, 総ページ数) を返す。"""
    page = max(1, page)
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.scalar(count_stmt) or 0
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = min(page, total_pages)
    rows = db.scalars(stmt.limit(per_page).offset((page - 1) * per_page)).unique().all()
    return list(rows), total, total_pages


def get_categories(db: Session) -> list[Category]:
    return list(
        db.scalars(
            select(Category)
            .where(Category.is_active.is_(True))
            .order_by(Category.sort_order, Category.id)
        ).all()
    )


def category_thread_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(Thread.category_id, func.count(Thread.id))
        .where(Thread.is_deleted.is_(False))
        .group_by(Thread.category_id)
    ).all()
    return {row[0]: row[1] for row in rows}

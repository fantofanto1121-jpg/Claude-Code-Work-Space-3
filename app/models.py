"""データベースのテーブル定義（ORM モデル）。

1クラス = 1テーブルです。
論理削除（is_deleted）を使い、投稿は物理削除せず「削除済み」として残します。
返信番号の整合性が壊れないようにするためです。
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    """常に UTC（協定世界時）で保存する。表示するときに日本時間へ変換します。"""
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# ------------------------------------------------------------------
# ユーザー
# ------------------------------------------------------------------
class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # メールアドレスは小文字に正規化して保存し、公開画面には絶対に出さない。
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    # パスワードは Argon2id のハッシュのみ。平文は保存しない。
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # 公開される表示名。内部ID(id)とは完全に分離している。
    display_name: Mapped[str] = mapped_column(String(32), nullable=False)

    role: Mapped[str] = mapped_column(String(16), default="user", nullable=False)  # user / admin
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 利用制限（BAN）。banned_until が未来の間は投稿できない。NULL かつ is_banned なら無期限。
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # 退会（論理削除）
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # この数字を +1 すると、発行済みの全セッションCookieが無効になる。
    # パスワード変更・退会・強制ログアウトで使う。
    session_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    threads: Mapped[list["Thread"]] = relationship(back_populates="author")
    posts: Mapped[list["Post"]] = relationship(back_populates="author")

    __table_args__ = (
        CheckConstraint("role IN ('user','admin')", name="ck_users_role"),
        Index("ix_users_email", "email"),
    )

    @property
    def is_admin(self) -> bool:
        return self.role == "admin" and not self.is_deleted

    @property
    def public_name(self) -> str:
        """公開画面に出す名前。退会済みなら実名を出さない。"""
        if self.is_deleted:
            return "退会したユーザー"
        return self.display_name

    def ban_is_active(self, now: datetime | None = None) -> bool:
        if not self.is_banned:
            return False
        if self.banned_until is None:
            return True  # 無期限
        now = now or utcnow()
        until = self.banned_until
        if until.tzinfo is None:  # SQLite 対策
            until = until.replace(tzinfo=timezone.utc)
        return until > now


# ------------------------------------------------------------------
# カテゴリー
# ------------------------------------------------------------------
class Category(Base, TimestampMixin):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)  # URL用の英字名
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    threads: Mapped[list["Thread"]] = relationship(back_populates="category")


# ------------------------------------------------------------------
# スレッド
# ------------------------------------------------------------------
class Thread(Base, TimestampMixin):
    __tablename__ = "threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)

    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 一覧の並べ替えを速くするために、集計値をスレッド行に持たせる（非正規化）。
    post_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    category: Mapped["Category"] = relationship(back_populates="threads")
    author: Mapped["User"] = relationship(back_populates="threads")
    posts: Mapped[list["Post"]] = relationship(
        back_populates="thread", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_threads_cat_lastposted", "category_id", "is_deleted", "last_posted_at"),
        Index("ix_threads_lastposted", "is_deleted", "last_posted_at"),
        Index("ix_threads_created", "is_deleted", "created_at"),
        Index("ix_threads_popular", "is_deleted", "post_count"),
        Index("ix_threads_user", "user_id"),
    )


# ------------------------------------------------------------------
# 投稿（スレッド本文も返信も、すべてここに入る）
# ------------------------------------------------------------------
class Post(Base, TimestampMixin):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    # スレッド内の連番。1 が本文、2 以降が返信。
    post_number: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # レスアンカー（>>3 のような返信先）。同じスレッド内の post_number を入れる。
    reply_to_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 'author'（本人削除）か 'admin'（管理者による非表示）
    deleted_by: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # 連投・スパム検知用に本文のハッシュを保持（本文そのものの比較より速い）
    body_hash: Mapped[str] = mapped_column(String(64), default="", nullable=False)

    thread: Mapped["Thread"] = relationship(back_populates="posts")
    author: Mapped["User"] = relationship(back_populates="posts")

    __table_args__ = (
        # 同じスレッドに同じ番号が2つできないことをDBレベルで保証する。
        UniqueConstraint("thread_id", "post_number", name="uq_posts_thread_number"),
        Index("ix_posts_thread_number", "thread_id", "post_number"),
        Index("ix_posts_user_created", "user_id", "created_at"),
        Index("ix_posts_created", "created_at"),
    )

    @property
    def is_op(self) -> bool:
        """スレッドの1番目（本文）かどうか。"""
        return self.post_number == 1


# ------------------------------------------------------------------
# 通報
# ------------------------------------------------------------------
class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    reporter_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[str] = mapped_column(String(500), default="", nullable=False)

    # open / resolved / rejected
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    handled_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    post: Mapped["Post"] = relationship(foreign_keys=[post_id])

    __table_args__ = (
        # 同じ人が同じ投稿を何度も通報できないようにする。
        UniqueConstraint("post_id", "reporter_user_id", name="uq_reports_post_reporter"),
        CheckConstraint("status IN ('open','resolved','rejected')", name="ck_reports_status"),
        Index("ix_reports_status_created", "status", "created_at"),
    )


REPORT_REASONS: dict[str, str] = {
    "spam": "スパム・宣伝",
    "abuse": "誹謗中傷・攻撃的な表現",
    "privacy": "個人情報の掲載",
    "illegal": "違法・権利侵害の疑い",
    "adult": "アダルト・暴力的な内容",
    "other": "その他",
}


# ------------------------------------------------------------------
# 管理操作の履歴（誰がいつ何をしたかを必ず残す）
# ------------------------------------------------------------------
class ModerationAction(Base):
    __tablename__ = "moderation_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)  # post / thread / user
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    __table_args__ = (Index("ix_modactions_created", "created_at"),)


# ------------------------------------------------------------------
# パスワード再設定・メール確認のトークン
# ------------------------------------------------------------------
class EmailToken(Base):
    __tablename__ = "email_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # トークンそのものは保存しない。SHA-256 ハッシュだけを保存する。
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)  # password_reset / verify_email
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    __table_args__ = (Index("ix_email_tokens_user", "user_id", "purpose"),)


# ------------------------------------------------------------------
# レート制限（連投・総当たりログインの抑制）
# ------------------------------------------------------------------
class RateLimitHit(Base):
    __tablename__ = "rate_limit_hits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bucket: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    __table_args__ = (Index("ix_ratelimit_bucket_created", "bucket", "created_at"),)

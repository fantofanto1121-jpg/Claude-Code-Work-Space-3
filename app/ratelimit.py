"""レート制限（連投・総当たり攻撃の抑制）。

仕組みはとても単純です。
「bucket（制限の単位）」ごとに実行した時刻をDBに記録し、
一定時間内の件数が上限を超えていたら拒否します。

DBに記録するのは、無料枠のサーバーが再起動したり複数起動しても
制限が引き継がれるようにするためです。
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import RateLimitHit, utcnow

# 自動テストでのみ False にする（tests/conftest.py 参照）。
ENABLED: bool = settings.rate_limit_enabled

# 制限の定義: 名前 -> (上限回数, 対象期間[秒])
LIMITS: dict[str, tuple[int, int]] = {
    "login_ip": (20, 15 * 60),  # 同一IPから15分に20回まで
    "login_email": (8, 15 * 60),  # 同一アカウントに15分に8回まで
    "register_ip": (5, 60 * 60),  # 同一IPから1時間に5アカウントまで
    "password_reset": (5, 60 * 60),
    "thread_create": (5, 60 * 60),  # 1時間に5スレッドまで
    "post_create": (15, 10 * 60),  # 10分に15投稿まで
    "post_interval": (1, 15),  # 15秒に1投稿まで（連投抑制）
    "report_create": (10, 60 * 60),
    "search": (60, 60),
}


def _window_start(seconds: int):
    return utcnow() - timedelta(seconds=seconds)


def check(db: Session, rule: str, identifier: str) -> bool:
    """超過していなければ記録して True。超過していたら記録せず False。"""
    if not ENABLED:
        return True
    limit, window = LIMITS[rule]
    bucket = f"{rule}:{identifier}"[:120]
    since = _window_start(window)

    count = db.scalar(
        select(func.count())
        .select_from(RateLimitHit)
        .where(RateLimitHit.bucket == bucket, RateLimitHit.created_at >= since)
    )
    if (count or 0) >= limit:
        return False

    db.add(RateLimitHit(bucket=bucket, created_at=utcnow()))
    db.flush()
    return True


def retry_after_seconds(rule: str) -> int:
    return LIMITS[rule][1]


def reset(db: Session, rule: str, identifier: str) -> None:
    """ログイン成功時など、カウントを消したいときに使う。"""
    bucket = f"{rule}:{identifier}"[:120]
    db.execute(delete(RateLimitHit).where(RateLimitHit.bucket == bucket))


def prune(db: Session, older_than_seconds: int = 24 * 60 * 60) -> int:
    """古い記録を掃除する（テーブルが無限に太るのを防ぐ）。"""
    result = db.execute(
        delete(RateLimitHit).where(RateLimitHit.created_at < _window_start(older_than_seconds))
    )
    return result.rowcount or 0

"""データベース接続。

SQLAlchemy の「エンジン」と「セッション」を用意します。
- エンジン : データベースへの接続プール（アプリ全体で1つ）
- セッション: 1リクエストにつき1つ作って、終わったら閉じる作業単位
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """全モデルの親クラス。"""


def _build_engine():
    url = settings.database_url
    if url.startswith("sqlite"):
        # SQLite はローカル開発用。FastAPI は複数スレッドから触るので下の指定が要る。
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )
    # PostgreSQL（本番）。Neon などはアイドル後に接続が切れるので pre_ping と recycle を付ける。
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=5,
    )


engine = _build_engine()

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - 接続時フック
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")  # 外部キー制約を有効にする
        cursor.execute("PRAGMA journal_mode=WAL")  # 同時読み書きに強くする
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI の依存性注入用。リクエストごとにセッションを渡して必ず閉じる。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""データベースの初期化処理。

アプリ起動時（app/main.py）と、手動実行（scripts/init_db.py）の
両方から呼ばれます。処理を1か所にまとめて、食い違いが起きないようにしています。

何度実行しても安全です（既存のデータは消えません）。
"""
from __future__ import annotations

import logging
import time

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.db import Base, SessionLocal, engine
from app.models import Category

logger = logging.getLogger("nextech.bootstrap")

# 最初から用意しておくカテゴリー
# ここを編集して再実行すると、足りないものだけが追加されます。
DEFAULT_CATEGORIES: list[tuple[str, str, str, int]] = [
    ("news", "ニュース", "時事・社会の話題について話すカテゴリーです。", 10),
    ("tech", "技術・プログラミング", "開発、ガジェット、学習方法などの技術の話題。", 20),
    ("life", "暮らし", "日常の困りごと、節約、料理、住まいの話。", 30),
    ("hobby", "趣味", "ゲーム、音楽、読書、スポーツ、創作など。", 40),
    ("work", "仕事・キャリア", "転職、職場の悩み、資格、働き方の話。", 50),
    ("question", "質問", "わからないことを聞いて、答えをもらう場所。", 60),
    ("free", "雑談", "カテゴリーに当てはまらない、ゆるい話題。", 70),
]


def create_tables() -> None:
    """足りないテーブルを作る。既存のテーブルには触れない。"""
    Base.metadata.create_all(bind=engine)


def seed_categories() -> int:
    """初期カテゴリーを追加する。すでにあるものは飛ばす。追加した件数を返す。"""
    created = 0
    with SessionLocal() as db:
        for slug, name, description, order in DEFAULT_CATEGORIES:
            if db.scalar(select(Category).where(Category.slug == slug)):
                continue
            db.add(Category(slug=slug, name=name, description=description, sort_order=order))
            created += 1
        db.commit()
    return created


def initialize(retries: int = 3, delay_seconds: float = 2.0) -> int:
    """テーブル作成とカテゴリー投入をまとめて行う。

    Neon などのサーバーレスDBは、しばらく使われていないと停止しています。
    最初の接続で目を覚ますまで数秒かかることがあるため、数回やり直します。
    """
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            create_tables()
            created = seed_categories()
            logger.info(
                "データベースの準備が完了しました（カテゴリーを %d 件追加）", created
            )
            return created
        except OperationalError as exc:
            last_error = exc
            if attempt < retries:
                logger.warning(
                    "データベースに接続できませんでした（%d/%d 回目）。%.0f秒後に再試行します。",
                    attempt,
                    retries,
                    delay_seconds,
                )
                time.sleep(delay_seconds)

    logger.error(
        "データベースの初期化に失敗しました。DATABASE_URL の設定を確認してください。"
        "（PostgreSQL の場合、先頭が postgresql+psycopg:// になっている必要があります）"
    )
    raise RuntimeError("データベースの初期化に失敗しました") from last_error

"""データベースの初期化。

やること:
  1. テーブルをすべて作る（既にあるものはそのまま）
  2. migrations/ の SQL を適用する
  3. 初期カテゴリーを登録する（既にあれば何もしない）

使い方（プロジェクトのルートで）:
    python scripts/init_db.py

何度実行しても、既存のデータが消えることはありません。
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import Category  # noqa: E402
from scripts.migrate import run as run_migrations  # noqa: E402

# 最初から用意しておくカテゴリー
DEFAULT_CATEGORIES = [
    ("news", "ニュース", "時事・社会の話題について話すカテゴリーです。", 10),
    ("tech", "技術・プログラミング", "開発、ガジェット、学習方法などの技術の話題。", 20),
    ("life", "暮らし", "日常の困りごと、節約、料理、住まいの話。", 30),
    ("hobby", "趣味", "ゲーム、音楽、読書、スポーツ、創作など。", 40),
    ("work", "仕事・キャリア", "転職、職場の悩み、資格、働き方の話。", 50),
    ("question", "質問", "わからないことを聞いて、答えをもらう場所。", 60),
    ("free", "雑談", "カテゴリーに当てはまらない、ゆるい話題。", 70),
]


def main() -> None:
    print(f"接続先: {engine.url.render_as_string(hide_password=True)}")

    print("1) テーブルを作成します…")
    Base.metadata.create_all(bind=engine)
    print("   完了")

    print("2) マイグレーションを適用します…")
    run_migrations()

    print("3) 初期カテゴリーを確認します…")
    created = 0
    with SessionLocal() as db:
        for slug, name, description, order in DEFAULT_CATEGORIES:
            exists = db.scalar(select(Category).where(Category.slug == slug))
            if exists:
                continue
            db.add(
                Category(slug=slug, name=name, description=description, sort_order=order)
            )
            created += 1
        db.commit()
    print(f"   {created} 件のカテゴリーを追加しました（既存はそのまま）")

    print("\n初期化が完了しました。")
    if settings.admin_emails:
        print(f"管理者メール: {', '.join(settings.admin_emails)}")
        print("このアドレスで登録・ログインすると、自動的に管理者権限が付きます。")
    else:
        print("ヒント: .env の ADMIN_EMAILS に自分のメールアドレスを設定すると管理画面を使えます。")


if __name__ == "__main__":
    main()

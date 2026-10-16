"""データベースの初期化（手動実行用）。

通常はアプリの起動時に自動で実行されるため、このスクリプトを
動かす必要はありません。次のような場合にだけ使います。

  - ローカル開発で、サーバーを起動する前に準備しておきたいとき
  - 自動初期化を無効（AUTO_INIT_DB=false）にしているとき
  - カテゴリーを追加したあと、すぐに反映したいとき

使い方（プロジェクトのルートで）:
    python scripts/init_db.py

何度実行しても、既存のデータが消えることはありません。
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(message)s")

from app.bootstrap import initialize  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import engine  # noqa: E402
from scripts.migrate import run as run_migrations  # noqa: E402


def main() -> None:
    print(f"接続先: {engine.url.render_as_string(hide_password=True)}")

    print("1) テーブルと初期カテゴリーを用意します…")
    created = initialize()
    print(f"   完了（カテゴリーを {created} 件追加しました。既存はそのまま）")

    print("2) マイグレーションを適用します…")
    run_migrations()

    print("\n初期化が完了しました。")
    if settings.admin_emails:
        print(f"管理者メール: {', '.join(settings.admin_emails)}")
        print("このアドレスで登録・ログインすると、自動的に管理者権限が付きます。")
    else:
        print("ヒント: .env の ADMIN_EMAILS に自分のメールアドレスを設定すると管理画面を使えます。")


if __name__ == "__main__":
    main()

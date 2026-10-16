"""ごく小さなマイグレーション実行ツール。

migrations/ にある SQL ファイルを、番号の小さい順に1回だけ実行します。
実行済みの記録は schema_migrations テーブルに残るので、何度流しても安全です。

ファイル名のきまり:
    001_説明.sql              … どのデータベースでも実行
    002_説明.postgresql.sql   … PostgreSQL のときだけ実行
    003_説明.sqlite.sql       … SQLite のときだけ実行

使い方（プロジェクトのルートで）:
    python scripts/migrate.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

from app.db import engine  # noqa: E402

MIGRATIONS_DIR = ROOT / "migrations"


def _dialect() -> str:
    return engine.dialect.name  # 'postgresql' または 'sqlite'


def _applies_here(path: Path) -> bool:
    parts = path.name.split(".")
    if len(parts) == 2:  # 001_name.sql
        return True
    return parts[-2] == _dialect()  # 002_name.postgresql.sql


def run() -> int:
    dialect = _dialect()
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "  filename VARCHAR(200) PRIMARY KEY,"
                "  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
        )
        done = {row[0] for row in conn.execute(text("SELECT filename FROM schema_migrations"))}

    files = sorted(p for p in MIGRATIONS_DIR.glob("*.sql") if p.is_file())
    applied = 0

    for path in files:
        if path.name in done:
            continue
        if not _applies_here(path):
            print(f"  スキップ ({dialect} 対象外): {path.name}")
            continue

        sql = path.read_text(encoding="utf-8")
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        try:
            with engine.begin() as conn:
                for statement in statements:
                    conn.execute(text(statement))
                conn.execute(
                    text("INSERT INTO schema_migrations (filename) VALUES (:f)"),
                    {"f": path.name},
                )
        except Exception as exc:  # noqa: BLE001
            print(f"  失敗: {path.name}\n    {exc}")
            print("  （この migration は任意のものかもしれません。内容を確認してください）")
            continue
        print(f"  適用: {path.name}")
        applied += 1

    print(f"マイグレーション完了（{applied} 件適用 / 対象DB: {dialect}）")
    return applied


if __name__ == "__main__":
    run()

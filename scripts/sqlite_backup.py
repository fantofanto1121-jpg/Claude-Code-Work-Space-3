"""SQLite のバックアップ／復元（sqlite3 コマンドが無い環境でも動く）。

Python 標準の sqlite3 モジュールの backup API を使うので、
アプリが動いたままでも壊れないコピーを作れます。

使い方:
    python scripts/sqlite_backup.py backup  <元のDB> <保存先>
    python scripts/sqlite_backup.py restore <バックアップ> <復元先DB>
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


def copy_db(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(source)) as src, sqlite3.connect(str(dest)) as dst:
        src.backup(dst)


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[1] not in {"backup", "restore"}:
        print(__doc__)
        return 1

    mode, source, dest = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    if not source.exists():
        print(f"見つかりません: {source}")
        return 1

    copy_db(source, dest)
    print(f"{'バックアップ' if mode == 'backup' else '復元'}が完了しました: {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

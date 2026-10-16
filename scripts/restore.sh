#!/usr/bin/env bash
# バックアップからデータベースを復元する。
#
# 使い方:
#     bash scripts/restore.sh backups/bbs-20261016-120000.dump
#
# 警告: 現在のデータは上書きされます。実行前にもう一度 backup.sh を取ることを強く勧めます。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "使い方: bash scripts/restore.sh <バックアップファイル>" >&2
  echo "利用できるファイル:" >&2
  ls -1t backups/ 2>/dev/null >&2 || echo "  （backups/ がありません）" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
fi

echo "復元先: ${DATABASE_URL%%\?*}"
echo "復元元: $FILE"
read -r -p "現在のデータは上書きされます。続けますか？ [yes/N] " ANSWER
[ "$ANSWER" = "yes" ] || { echo "中止しました。"; exit 0; }

case "$DATABASE_URL" in
  sqlite*)
    DB_FILE="${DATABASE_URL#sqlite:///}"
    PY="${PYTHON:-python3}"
    cp "$DB_FILE" "${DB_FILE}.before-restore" 2>/dev/null || true
    "$PY" scripts/sqlite_backup.py restore "$FILE" "$DB_FILE"
    echo "元のファイルは ${DB_FILE}.before-restore に退避しました。"
    ;;
  postgres*)
    PG_URL="$(printf '%s' "$DATABASE_URL" | sed 's|postgresql+psycopg://|postgresql://|')"
    pg_restore --clean --if-exists --no-owner --no-acl --dbname="$PG_URL" "$FILE"
    echo "復元しました。"
    ;;
  *)
    echo "エラー: 対応していない DATABASE_URL です。" >&2
    exit 1
    ;;
esac

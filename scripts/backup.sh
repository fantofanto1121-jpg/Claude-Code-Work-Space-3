#!/usr/bin/env bash
# データベースのバックアップを取る。
#
# 使い方（プロジェクトのルートで）:
#     bash scripts/backup.sh
#
# 保存先: backups/ フォルダ（.gitignore 済みなのでGitHubには上がりません）
# PostgreSQL の場合は pg_dump が必要です:
#     Ubuntu/Debian: sudo apt install postgresql-client
#     macOS        : brew install libpq
# SQLite の場合は追加のインストールは不要です。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# .env から DATABASE_URL を読む（すでに環境変数にあればそちらを優先）
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "エラー: DATABASE_URL が設定されていません。" >&2
  exit 1
fi

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"

case "$DATABASE_URL" in
  sqlite*)
    DB_FILE="${DATABASE_URL#sqlite:///}"
    OUT="backups/bbs-${STAMP}.db"
    # Python標準の backup API を使う（sqlite3 コマンドが無くても動き、
    # アプリが動作中でも壊れないコピーが取れる）
    PY="${PYTHON:-python3}"
    "$PY" scripts/sqlite_backup.py backup "$DB_FILE" "$OUT"
    echo "SQLite のバックアップを作成しました: $OUT"
    ;;
  postgres*)
    # SQLAlchemy 用の postgresql+psycopg:// を pg_dump が読める形に直す
    PG_URL="$(printf '%s' "$DATABASE_URL" | sed 's|postgresql+psycopg://|postgresql://|')"
    OUT="backups/bbs-${STAMP}.dump"
    pg_dump --format=custom --no-owner --no-acl --file="$OUT" "$PG_URL"
    echo "PostgreSQL のバックアップを作成しました: $OUT"
    ;;
  *)
    echo "エラー: 対応していない DATABASE_URL です。" >&2
    exit 1
    ;;
esac

# 直近30個だけ残して、古いものは削除する
ls -1t backups/bbs-* 2>/dev/null | tail -n +31 | xargs -r rm --
echo "完了。backups/ の中身:"
ls -1t backups/ | head -5

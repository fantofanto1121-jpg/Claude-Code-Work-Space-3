# バックアップと復元

> **Neon 無料プランの自動バックアップ保持は6時間しかありません。**
> 自分でバックアップを取る運用が必須です。最低でも**週1回**実行してください。

---

## バックアップを取る

プロジェクトのルートで実行します。

```bash
bash scripts/backup.sh
```

- 保存先: `backups/` フォルダ
- ファイル名: `bbs-20261016-120000.dump`（日時入り）
- 古いものは自動で削除され、**直近30個**だけ残ります
- `backups/` は `.gitignore` 済みなので GitHub には上がりません

### PostgreSQL（本番）の場合に必要なもの

`pg_dump` コマンドが必要です。

```bash
# Ubuntu / Debian
sudo apt install postgresql-client

# macOS
brew install libpq && brew link --force libpq

# Windows
# PostgreSQL公式インストーラに含まれています
```

### SQLite（ローカル開発）の場合

追加のインストールは不要です。Python 標準の backup API を使うため、
**アプリが動いている最中でも**壊れないコピーが取れます。

---

## 復元する

```bash
bash scripts/restore.sh backups/bbs-20261016-120000.dump
```

確認のため `yes` の入力を求められます。

> **現在のデータは上書きされます。** 実行前にもう一度バックアップを取ることを勧めます。
> SQLite の場合、元ファイルは `bbs.db.before-restore` に自動で退避されます。

---

## 本番（Neon）のバックアップを自分のパソコンで取る

1. Render の環境変数、または Neon のダッシュボードから接続URLをコピー
2. 自分のパソコンで実行

   ```bash
   DATABASE_URL="postgresql+psycopg://neondb_owner:パスワード@ep-xxxx.../neondb?sslmode=require" \
     bash scripts/backup.sh
   ```

> 接続URLはパスワードそのものです。コマンド履歴に残るのが気になる場合は、
> `.env` に書いてから `bash scripts/backup.sh` を実行してください。

---

## おすすめの運用

| 頻度 | やること |
|------|----------|
| 週1回 | `bash scripts/backup.sh` を実行 |
| 大きな変更の前 | 必ず実行（マイグレーション適用前など） |
| 月1回 | バックアップから**実際に復元できるか**試す |

### 復元テストのやり方（安全な方法）

本番を壊さずに確認できます。

```bash
# 1. 本番のバックアップを取る
DATABASE_URL="本番のURL" bash scripts/backup.sh

# 2. ローカルのSQLiteではなく、Neonで「開発用ブランチ」を作って復元する
#    （Neonはブランチ機能があり、無料枠で10ブランチまで作れます）
```

**取れていると思っていたバックアップが壊れていた**、というのが最悪のケースです。
月1回は中身を確認してください。

```bash
# バックアップの中身を軽く確認（SQLite の場合）
python -c "
import sqlite3
c = sqlite3.connect('backups/ファイル名.db')
print('users  :', c.execute('SELECT COUNT(*) FROM users').fetchone()[0])
print('threads:', c.execute('SELECT COUNT(*) FROM threads').fetchone()[0])
print('posts  :', c.execute('SELECT COUNT(*) FROM posts').fetchone()[0])
"
```

---

## データベースの構造を変更するとき

1. **先にバックアップを取る**

   ```bash
   bash scripts/backup.sh
   ```

2. `migrations/` に新しいSQLファイルを追加する（`migrations/README.md` 参照）

3. 適用する

   ```bash
   python scripts/migrate.py
   ```

4. テストを実行する

   ```bash
   pytest
   ```

> **新しいテーブルを追加しただけ**なら、SQLを書く必要はありません。
> `python scripts/init_db.py` が `create_all()` で自動作成します。

---

## 容量を節約する

`rate_limit_hits` テーブルは、アクセスのたびに行が増えていきます。
放置するとデータベース容量を圧迫するので、定期的に掃除してください。

```bash
python -c "
import sys; sys.path.insert(0, '.')
from app.db import SessionLocal
from app.ratelimit import prune
with SessionLocal() as db:
    n = prune(db)          # 24時間より古い記録を削除
    db.commit()
    print(f'{n} 件削除しました')
"
```

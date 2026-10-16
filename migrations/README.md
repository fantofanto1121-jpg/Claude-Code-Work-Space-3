# migrations

データベースの構造を後から変更するための SQL を置く場所です。

## 使い方

1. 新しいファイルを作る（番号は連番、既存ファイルは絶対に書き換えない）

   ```
   migrations/003_add_thread_pinned.sql
   ```

   ```sql
   ALTER TABLE threads ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE
   ```

2. 適用する

   ```bash
   python scripts/migrate.py
   ```

## ファイル名のきまり

| 名前 | 実行されるDB |
|------|--------------|
| `003_xxx.sql` | すべて |
| `003_xxx.postgresql.sql` | PostgreSQL のみ |
| `003_xxx.sqlite.sql` | SQLite のみ |

適用済みのファイル名は `schema_migrations` テーブルに記録され、二度実行されません。

## 注意

- **新しいテーブルを追加しただけ**なら、`python scripts/init_db.py` が
  `create_all()` で自動的に作るので、SQL を書く必要はありません。
- **既存テーブルの列を変える**ときだけ、ここに SQL を書いてください。
- 本番に適用する前に、必ずバックアップを取ってください（`docs/BACKUP.md`）。

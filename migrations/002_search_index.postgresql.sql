-- 検索を速くするための索引（PostgreSQL 専用・任意）。
-- pg_trgm 拡張が使えない環境では失敗しますが、アプリは問題なく動きます。
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS ix_threads_title_trgm ON threads USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_posts_body_trgm ON posts USING gin (body gin_trgm_ops)

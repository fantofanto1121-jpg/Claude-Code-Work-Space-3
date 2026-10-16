# インターネットに公開する手順

所要時間の目安: **30〜40分**（初めての場合）

公開までの流れは3段階です。

```
① Neon でデータベースを作る  →  ② GitHub にコードを上げる  →  ③ Render で公開する
```

---

## 事前に用意するもの

- GitHub アカウント（無料）
- メールアドレス

---

## ① Neon でデータベースを作る

1. <https://neon.com> を開き、**Sign up** → GitHub アカウントでサインアップ
   （クレジットカードは不要です）
2. **Create project** を押す
3. 次のように設定します

   | 項目 | 設定値 |
   |------|--------|
   | Project name | `nextech-bbs`（任意） |
   | Postgres version | 最新のまま |
   | Region | **Asia Pacific (Singapore)** ← 日本から最も近い |

4. 作成後に表示される **Connection string** をコピーします。
   こんな形です。

   ```
   postgresql://neondb_owner:パスワード@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

5. **ここが重要です。** このアプリは psycopg3 というドライバを使うので、
   先頭を `postgresql://` から **`postgresql+psycopg://`** に書き換えてください。

   ```
   postgresql+psycopg://neondb_owner:パスワード@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   書き換えたものをメモ帳などに貼り付けて取っておきます（あとで Render に入力します）。

> このURLはデータベースのパスワードそのものです。**人に見せない／GitHubに上げない**でください。

---

## ② GitHub にコードを上げる

### まだリポジトリが無い場合

1. <https://github.com/new> でリポジトリを作成
   - Repository name: `nextech-bbs`（任意）
   - **Public / Private どちらでも構いません**
   - 「Add a README file」には**チェックを入れない**（既にあるため）

2. 自分のパソコンのターミナルで、プロジェクトのフォルダに移動して実行します。

   ```bash
   git init
   git add .
   git commit -m "NEXTECH 掲示板の初期実装"
   git branch -M main
   git remote add origin https://github.com/あなたのID/nextech-bbs.git
   git push -u origin main
   ```

### 上げる前の確認（重要）

```bash
git status
```

**`.env` が一覧に出ていないこと**を必ず確認してください。
出ていたら `.gitignore` が効いていません。`.env` を push すると秘密鍵が公開されます。

```bash
# 念のための確認。何も表示されなければ安全です
git ls-files | grep -E "^\.env$"
```

---

## ③ Render で公開する

1. <https://render.com> を開き、**GitHub アカウントでサインアップ**
2. ダッシュボードで **New +** → **Web Service**
3. **Build and deploy from a Git repository** を選び、自分のリポジトリ
   （例: `Claude-Code-Work-Space-3`）を接続する
4. 設定画面で次のように入力します

   | 項目 | 設定値 |
   |------|--------|
   | Name | `nextech-bbs` など **世界で重複しない名前**（これがURLになります） |
   | Region | **Singapore** |
   | Branch | `claude/gifted-galileo-f3ce46`（リポジトリの既定ブランチ。通常は自動で選ばれます） |
   | Runtime | `Python 3` |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers` |
   | Instance Type | **Free** |

   > リポジトリに `render.yaml` が含まれているので、Render が自動で読み取る場合があります。
   > その場合は上の入力を省略できます。

5. **Environment Variables** を設定します（ここが一番大事です）

   | Key | Value |
   |-----|-------|
   | `SECRET_KEY` | **Generate** ボタンで自動生成、または `python -c "import secrets; print(secrets.token_urlsafe(48))"` の出力 |
   | `DATABASE_URL` | ①でメモした `postgresql+psycopg://...` の文字列 |
   | `APP_ENV` | `production` |
   | `TRUST_PROXY_HEADERS` | `true` |
   | `BASE_URL` | 仮に `https://example.onrender.com`。**作成後に実際のURLへ必ず直す**（下記参照） |
   | `SITE_NAME` | `NEXTECH`（好きな名前に変更可） |
   | `ADMIN_EMAILS` | 自分のメールアドレス |
   | `PYTHON_VERSION` | `3.12.7` |
   | `REQUIRE_EMAIL_VERIFICATION` | `false` |
   | `AUTO_INIT_DB` | `true`（省略可。既定で有効） |

   メール送信を使う場合のみ、追加で `RESEND_API_KEY` と `MAIL_FROM` を設定します。

   > **重要: 公開URLを事前に予測しないでください。**
   > `〇〇.onrender.com` のサブドメインは **Render全体で世界に1つだけ**です。
   > 希望の名前が他の人に使われていると別の名前になり、予測したURLを開くと
   > **まったく無関係な他人のサイトが表示されます**。
   >
   > 正しいURLは、サービス作成後に **Renderのサービス画面の上部に表示されるもの**だけです。
   > それを確認してから `BASE_URL` を書き換え、**Manual Deploy** で再デプロイしてください。
   > （`BASE_URL` が違うと、パスワード再設定メールのリンクが壊れます）

6. **Create Web Service** を押します。初回のビルドに3〜5分かかります。

### データベースのテーブルを作る → **自動です。何もしなくて構いません**

アプリは起動時に、テーブルと初期カテゴリーを自動で用意します。
デプロイが成功した時点で、掲示板はそのまま使える状態になっています。

Render の **Logs** に次の行が出ていれば成功です。

```
nextech.bootstrap: データベースの準備が完了しました（カテゴリーを 7 件追加）
INFO:     Application startup complete.
```

2回目以降のデプロイでは「カテゴリーを 0 件追加」と出ます。
既存のデータは消えず、同じカテゴリーが重複して増えることもありません。

> **なぜ自動にしているか**
> Render の無料プランには Shell（サーバー上でコマンドを打つ機能）がありません。
> Shell と SSH は有料プラン専用です。そのため、サーバー上で初期化コマンドを
> 実行する手段が無く、アプリ自身が起動時に行う方式にしています。

**手動で実行したい場合（任意）**

ローカル開発で先に準備しておきたいときなどは、従来どおり実行できます。

```bash
python scripts/init_db.py
```

自動初期化を止めたい場合は、環境変数 `AUTO_INIT_DB` に `false` を設定してください。

---

## ④ 動作確認

公開URL（`https://〇〇.onrender.com`）を開いて、次を順に確認してください。

- [ ] トップページが表示され、カテゴリーが7つ並んでいる
- [ ] 「新規登録」から会員登録できる
- [ ] ログアウトして、ログインし直せる
- [ ] スレッドを作成できる
- [ ] 返信できる（15秒あけてから2回目を投稿）
- [ ] ページを再読み込みしても投稿が残っている
- [ ] 検索でスレッドが見つかる
- [ ] 右上メニューに「管理画面」が出る（`ADMIN_EMAILS` のアドレスでログインした場合）
- [ ] **スマートフォンから開いて**、崩れずに表示され、右下に作成ボタンが出る
- [ ] URLが `https://` で始まっている

> **初回アクセスは1分ほど待たされます。** Render 無料プランの仕様です（15分無アクセスで停止）。
> 2回目以降は速くなります。詳細は [COSTS.md](COSTS.md)。

---

## 更新のしかた

コードを直したあとは、次の3つを実行するだけです。

```bash
pytest                                  # テストが通ることを確認（重要）
git add .
git commit -m "変更内容の説明"
git push
```

push すると Render が自動的に再デプロイします。

---

## うまくいかないとき

| 症状 | 原因と対処 |
|------|-----------|
| ビルドが失敗する | Render の **Logs** を開く。`requirements.txt` のライブラリ名の打ち間違いが多い |
| `SECRET_KEY が設定されていません` でクラッシュ | 環境変数 `SECRET_KEY` が未設定。設定して **Manual Deploy** |
| `no such table` / `relation does not exist` | `python scripts/init_db.py` を実行していない |
| DBに繋がらない | `DATABASE_URL` の先頭が `postgresql+psycopg://` になっているか確認 |
| ログインしてもすぐログアウトされる | `SECRET_KEY` がデプロイのたびに変わっている。固定値を環境変数に設定する |
| パスワード再設定メールが届かない | `RESEND_API_KEY` 未設定。Render の Logs にリンクが出力されています |
| 画面が真っ白／CSSが効かない | ブラウザの開発者ツール（F12）の Console を確認。`/static/css/style.css` が 200 か確認 |
| 管理画面に入れない | `ADMIN_EMAILS` 設定後に**ログインし直し**が必要 |

ログの見方: Render のサービスページ → 左メニュー **Logs**。
エラーの最後の数行に原因が書かれていることがほとんどです。

---

## 公開したあとに必ずやること

1. **バックアップの設定** — [BACKUP.md](BACKUP.md)。Neon の自動保持は6時間しかありません
2. **利用規約・プライバシーポリシーの整備** — `app/templates/legal/` の【　】を埋める。[OPERATIONS.md](OPERATIONS.md)
3. **運営者の連絡先を記載** — `/contact` ページ。削除依頼の窓口として必要です

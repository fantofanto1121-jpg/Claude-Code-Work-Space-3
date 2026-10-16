# NEXTECH — スレッド型 情報掲示板

会員登録して、好きな表示名で書き込めるスレッド型の掲示板です。
投稿はデータベースに保存されるので、ブラウザを閉じても消えません。
PC とスマートフォンの両方に対応しています。

- **技術スタック**: Python (FastAPI) + Jinja2 + PostgreSQL
- **公開先**: Render（無料プラン） + Neon（無料プラン）
- **月額費用の目安**: 独自ドメインを使わなければ **0円**（制約は [docs/COSTS.md](docs/COSTS.md)）

---

## 目次

1. [できること](#できること)
2. [必要なもの](#必要なもの)
3. [自分のパソコンで動かす（5分）](#自分のパソコンで動かす5分)
4. [インターネットに公開する](#インターネットに公開する)
5. [管理者になる方法](#管理者になる方法)
6. [フォルダの中身](#フォルダの中身)
7. [テストの実行](#テストの実行)
8. [バックアップ](#バックアップ)
9. [よくあるつまずき](#よくあるつまずき)
10. [もっと詳しい資料](#もっと詳しい資料)

---

## できること

| 機能 | 状態 |
|------|------|
| トップページ・カテゴリー別一覧 | 実装済み |
| スレッド作成・返信（レスアンカー `>>3` 対応） | 実装済み |
| 会員登録・ログイン・ログアウト | 実装済み |
| パスワード再設定（メール） | 実装済み |
| マイページ（表示名変更・投稿一覧・退会） | 実装済み |
| タイトル・本文の全文検索 | 実装済み |
| 並べ替え・ページネーション | 実装済み |
| 投稿の通報 | 実装済み |
| 管理画面（通報対応・非表示・ロック・利用制限・操作履歴） | 実装済み |
| スマートフォン対応 | 実装済み |
| 画像アップロード | 未実装（費用と安全性を優先。あとから追加できる設計） |

---

## 必要なもの

- **Python 3.11 以上**（3.12 を推奨）
  確認: ターミナルで `python3 --version`
- **Git**
  確認: `git --version`

データベースは、最初は何も用意しなくて大丈夫です。
ローカル開発では SQLite という「ファイル1つで完結するデータベース」を自動で使います。

---

## 自分のパソコンで動かす（5分）

ターミナル（Windows なら PowerShell、Mac なら「ターミナル」アプリ）を開いて、
**このプロジェクトのフォルダの中で**順に実行します。

### 1. 仮想環境を作る

仮想環境とは「このプロジェクト専用の Python 置き場」です。
パソコン全体の Python を汚さないために作ります。

```bash
python3 -m venv .venv
```

有効にします（ターミナルの行頭に `(.venv)` と出れば成功）。

```bash
# Mac / Linux
source .venv/bin/activate

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
```

### 2. 必要なライブラリを入れる

```bash
pip install -r requirements.txt
```

### 3. 設定ファイルを作る

```bash
# Mac / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

次に、秘密鍵を生成します。これはログイン情報の署名に使う、パスワードのようなものです。

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

出てきた文字列を、`.env` の `SECRET_KEY=` の後ろに貼り付けて保存してください。

> **`.env` は絶対に GitHub にアップロードしないでください。**
> `.gitignore` で除外済みなので、通常の操作では上がりません。

### 4. データベースを用意する

テーブルと初期カテゴリーを作ります。何度実行してもデータは消えません。

```bash
python scripts/init_db.py
```

### 5. 起動する

```bash
uvicorn app.main:app --reload
```

ブラウザで <http://127.0.0.1:8000> を開いてください。
`--reload` は「コードを保存すると自動で再起動する」オプションです。開発中はこれが便利です。

止めるときは、ターミナルで `Ctrl + C` を押します。

---

## インターネットに公開する

手順の全文は **[docs/DEPLOY.md](docs/DEPLOY.md)** にあります。大きな流れは次の3つです。

1. **Neon** で無料の PostgreSQL データベースを作り、接続URLをコピーする
2. **GitHub** にこのコードを push する
3. **Render** で GitHub リポジトリを選び、環境変数を設定してデプロイする

Render が発行する `https://〇〇.onrender.com` が公開URLになります。

---

## 管理者になる方法

管理者かどうかは、**サーバー側の環境変数だけ**で決まります。
ブラウザから送られた値では絶対に管理者になれません。

1. `.env`（本番は Render の環境変数）の `ADMIN_EMAILS` に自分のメールアドレスを書く

   ```
   ADMIN_EMAILS=you@example.com
   ```

2. そのアドレスで会員登録、またはログインし直す
3. 右上のメニューに「管理画面」が出ます

複数人を管理者にするときはカンマ区切りです: `a@example.com,b@example.com`

> `ADMIN_EMAILS` から外すと、次のログイン時に自動で一般ユーザーに戻ります。

---

## フォルダの中身

```
.
├── app/                     アプリ本体
│   ├── main.py              入口。ルーター登録・エラー処理・セキュリティヘッダー
│   ├── config.py            環境変数の読み込み（設定はすべてここ経由）
│   ├── db.py                データベース接続
│   ├── models.py            テーブル定義（1クラス = 1テーブル）
│   ├── services.py          入力検証とビジネスロジック（採番・検索など）
│   ├── security.py          パスワード・セッション・CSRF
│   ├── deps.py              ログイン判定と権限チェック
│   ├── ratelimit.py         連投・総当たり攻撃の抑制
│   ├── utils.py             本文の安全なHTML化・日時表示
│   ├── mailer.py            メール送信
│   ├── errors.py            独自の例外
│   ├── templating.py        画面描画の共通処理
│   ├── routers/             画面ごとの処理
│   ├── templates/           HTML
│   └── static/              CSS・JavaScript・アイコン
├── scripts/                 初期化・管理・バックアップ用のコマンド
├── migrations/              データベース構造の変更履歴（SQL）
├── tests/                   自動テスト（83件）
├── docs/                    設計・デプロイ・セキュリティなどの資料
├── requirements.txt         本番で使うライブラリ
├── render.yaml              Render の設定
└── .env.example             環境変数のテンプレート
```

**どこを直せばいい？**

| やりたいこと | 編集するファイル |
|--------------|------------------|
| 色・見た目を変える | `app/static/css/style.css`（上部の `:root` に色をまとめてあります） |
| 文字数制限を変える | `app/config.py` の `Settings` クラス |
| カテゴリーを増やす | `scripts/init_db.py` の `DEFAULT_CATEGORIES` → 再実行 |
| 画面の文言を変える | `app/templates/` の該当HTML |
| 連投制限の秒数を変える | `app/ratelimit.py` の `LIMITS` |

---

## テストの実行

```bash
pip install -r requirements-dev.txt
pytest
```

83件のテストが走ります。内訳:

| ファイル | 確認していること |
|----------|------------------|
| `test_pages.py` | 各ページが表示できる / 検索が動く |
| `test_auth.py` | 登録・ログイン・入力エラー・退会 |
| `test_threads.py` | スレッド作成・返信・採番・改行保持・本人削除 |
| `test_permissions.py` | **他人の投稿を消せない** / 未ログイン拒否 / 管理者以外は管理画面に入れない |
| `test_security.py` | XSS・CSRF・SQLインジェクション・オープンリダイレクト |
| `test_reports.py` | 通報と管理者の対応 |
| `test_concurrency.py` | 同時投稿で番号が重複しないこと |

**コードを変更したら、必ず `pytest` を実行してから公開してください。**

---

## バックアップ

```bash
bash scripts/backup.sh                              # バックアップを作る
bash scripts/restore.sh backups/bbs-日付.dump       # 復元する
```

詳細と、Neon の自動バックアップについては [docs/BACKUP.md](docs/BACKUP.md) を参照してください。

---

## よくあるつまずき

| 症状 | 原因と対処 |
|------|-----------|
| `ModuleNotFoundError: No module named 'fastapi'` | 仮想環境が有効になっていません。`source .venv/bin/activate` を実行 |
| `SECRET_KEY が設定されていません` | `.env` の `SECRET_KEY` が空です。手順3をやり直してください |
| 起動するたびにログアウトされる | 同上。`SECRET_KEY` が未設定だと毎回ランダムな鍵になります |
| `no such table: users` | `python scripts/init_db.py` を実行していません |
| 投稿すると「投稿の間隔が短すぎます」 | 連投制限（15秒に1回）です。仕様通りの動作です |
| 公開URLの初回アクセスが1分くらい遅い | Render 無料プランの仕様（15分アクセスが無いと停止）。[docs/COSTS.md](docs/COSTS.md) 参照 |
| 管理画面に入れない | `ADMIN_EMAILS` を設定後、**ログインし直し**が必要です |

---

## もっと詳しい資料

| 資料 | 内容 |
|------|------|
| [docs/DESIGN.md](docs/DESIGN.md) | 技術選定の理由、データベース設計、画面設計 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Neon と Render への公開手順（画面つきの説明） |
| [docs/COSTS.md](docs/COSTS.md) | 無料枠の制限と、将来かかる可能性のある費用 |
| [docs/SECURITY.md](docs/SECURITY.md) | 実装した対策の一覧と、運用上の注意 |
| [docs/BACKUP.md](docs/BACKUP.md) | バックアップと復元の手順 |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 日々の運営、法務対応、収益化の準備 |

---

## ライセンスと注意

- 利用規約・プライバシーポリシーは**ひな形**です。公開前に専門家の確認を受けてください（[docs/OPERATIONS.md](docs/OPERATIONS.md)）。
- 既存の掲示板サービスの名称・ロゴ・独自デザインは使用していません。

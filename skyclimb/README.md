# スライム・スカイクライム（skyclimb）

スライムを引っ張って はじき、足場をつたって上へ登る 2D 縦スクロールアクションです。
**画像素材 63 点をすべて個別の透過 PNG として制作し、ゲームに組み込んであります。**

`index.html` をブラウザで開けば遊べます（通信なし・ビルド不要）。

---

## 1. 遊びかた

| 操作 | 内容 |
|------|------|
| スライムをドラッグして はなす | 引いた向きの **反対** へ飛ぶ。引くほど強い |
| 一時停止ボタン / Esc | 一時停止 |
| 設定ボタン | 効果音の ON / OFF |

- 足場に静止しているときだけ発射できます。
- **高いところから落ちるとハートが 1 つ減ります**（約 18m 以上の落下）。
- チェックポイントの足場に乗るとハートが 1 つ回復します。
- コインと結晶を集めながら、頂上（300m）の旗を目指します。
- 足場の種類：草・石・木・浮遊岩・崩れる遺跡・きのこ（大きく跳ねる）・動く足場・チェックポイント。

---

## 2. 画像素材について

### 制作方法

この環境では **画像生成ツールが利用できなかった**ため、仕様書の代替手段に従い
**プログラムによる描画（Canvas 2D）** で制作しました。

1. `tools/artlib.js` … 手描き風の共通描画（輪郭・陰影・質感・草・岩・木・金属・布・水・雲）
2. `tools/assets_a.js` / `tools/assets_b.js` … 素材 63 点の描画コード
3. `tools/gen.html` + `tools/generate.cjs` … headless Chromium で 1 枚ずつ描き、
   `canvas.toDataURL('image/png')` で **アルファ付き PNG** として書き出し
4. `tools/verify.py`（Pillow）… アルファチャンネル・寸法・余白・破損を検証

再生成するには次を実行します（Chromium と playwright-core が必要）。

```
node tools/generate.cjs          # PW_CORE, PW_EXE を環境変数で指定
python3 tools/verify.py          # 検証（tools/verify_report.json）
python3 tools/make_manifest.py   # assets/metadata/asset_manifest.json を更新
```

各素材が「どのファイルの何行目で描かれたか」は
`assets/metadata/asset_manifest.json` の `recipe` に記録しています。

### 画風のきまり

- 光源は **左上**。影は右下に落とす。
- 輪郭は同系色の濃い線で、**外周のシルエットにだけ**描く（内側に線を重ねない）。
- セル塗り＋やわらかい陰影。質感は控えめな筆致で、描き込みすぎない。
- UI の文字は画像に焼き込まず、**HTML 側のテキスト**で描画する。
- 色は素材ごとに固定パレット（マニフェストの `style_guide` 参照）。

### 検証結果

| 項目 | 結果 |
|------|------|
| ファイル数 | 63（すべて個別ファイル。スプライトシートではない） |
| 破損ファイル | 0 |
| アルファチャンネルあり | 63 / 63（`PNG RGBA`） |
| 実際に透明画素を含む | 62 / 63（`bg_sky.png` のみ全面不透過。最奥の空のため意図的） |
| 画像内の文字・透かし | なし |

---

## 3. 素材一覧（カテゴリ別）

| カテゴリ | 数 | 置き場所 | 内容 |
|----------|----|----------|------|
| スライム | 9 | `assets/sprites/slime/` | idle / drag / launch / fly / fall / land / blink / damage / icon |
| エフェクト | 8 | `assets/sprites/effects/` | drag_line / trajectory_dot / launch_streak / land_dust / land_star / splash / checkpoint / fall |
| 足場 | 10 | `assets/sprites/platforms/` | grass_small / medium / wide / stone / wood / floating_rock / broken_ruin / mushroom / moving / checkpoint |
| 背景 | 10 | `assets/backgrounds/{sky,far,mid,near}/` | sky / far_mountains / islands_far / castle / waterfall / clouds_mid / islands_mid / vines / forest / ruins |
| 小物 | 10 | `assets/sprites/props/` | wood_sign / lantern / flag / chest / crystal / flower / bush / rock / vine / checkpoint_flag |
| UI | 13 | `assets/sprites/ui/` | heart_full / heart_empty / energy_bar / energy_fill / panel / button_normal / button_pressed / pause / height_marker / checkpoint / coin / crystal / settings |
| タイトル | 3 | `assets/sprites/title/` | logo（枠のみ・題字は HTML） / slime_pose / decoration |

スライムの 8 状態は **192×192・接地線 y=168・中心 x=96** で基準をそろえてあり、
そのまま差し替えてアニメーションできます。

---

## 4. フォルダ構成

```
skyclimb/
├── index.html           画面と HUD（文字はすべて HTML 側）
├── css/style.css        HUD のスタイル（cqw 指定で画面に比例）
├── js/
│   ├── assets.js        素材一覧と読み込み（マニフェストから生成）
│   ├── world.js         足場の当たり判定仕様とステージ生成
│   └── game.js          物理・入力・カメラ・描画・HUD 連携
├── assets/
│   ├── sprites/{slime,effects,platforms,props,ui,title}/
│   ├── backgrounds/{sky,far,mid,near}/
│   └── metadata/asset_manifest.json
└── tools/               素材の生成・検証スクリプト
```

---

## 5. ゲームへの組み込み

| 仕様 | 実装場所 |
|------|----------|
| ドラッグ中に伸びる表現 | `slime_drag` へ差し替え（`js/game.js` のスプライト選択） |
| 引いた向きと逆へ飛ぶ | `release()` |
| 速度に応じたスプライト変化 | `slime_fly` / `slime_fall` / `slime_launch` |
| 着地でつぶれる | `slime_land` を 0.22 秒表示＋土煙と星 |
| 軌道予測線 | `fx_trajectory_dot` を 70 ステップ分シミュレーションして表示 |
| 当たり判定 | `js/world.js` の `PLATFORM_SPECS`（画像の見た目とは別に数値で保持） |
| 縦スクロール | カメラが上下に追従（`update()` 内） |
| 高さの記録 | 現在・最高を HUD に表示（1m = 48px） |
| パララックス | 空 → 遠景の山・浮島 → 雲 → 中景の浮島 → 樹林・滝・遺跡・ツタ |
| タッチとマウス | Pointer Events で共通処理 |

足場は **片側通行**（下からは通り抜け、落下中だけ着地）にしてあります。

---

## 6. 残っている課題

- 素材はすべて静止画です。コマ割りのアニメーション（歩き・まばたきの中割り）は未作成です。
- 宝箱は「開いた状態」の絵がなく、取得後は半透明にして代用しています。
- 背景は横方向のタイル化のみ対応で、縦の反復はレイヤー単位です。
- 音は WebAudio の簡単な効果音のみで、音声ファイルはありません。

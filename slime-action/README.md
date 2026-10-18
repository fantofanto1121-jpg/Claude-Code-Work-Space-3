# スライム・スリング アドベンチャー（slime-action）

スライムを引っ張って はじき、勢いよくぶつかって モンスターを倒す **横スクロール 2D アクション**です。
**画像素材 72 点をすべて個別の透過 PNG として制作し、ゲームに組み込んであります。**

`index.html` をブラウザで開けば遊べます（通信なし・ビルド不要）。

---

## 1. 遊びかた

| 操作 | 内容 |
|------|------|
| スライムをドラッグして はなす | 引いた向きの **反対** へ飛ぶ。引くほど強い |
| スペシャル ボタン / E キー | ゲージが満タンのとき発動。次の一撃が強化され、衝撃波で周囲にもダメージ |
| 回復 ボタン / Q キー | 結晶 3 個でハートを 1 つ回復 |
| 一時停止ボタン / Esc | 一時停止 |
| 設定ボタン | 効果音の ON / OFF |

- 足場に静止しているときだけ発射できます。
- **勢いがついた状態でぶつかるとダメージを与え、止まった状態で触れるとこちらが受けます。**
- 谷に落ちるとハートが 1 つ減り、**最後に通ったチェックポイント**へ戻ります。
  旗の立った足場に乗ると、そこがチェックポイントになります。
- ステージのモンスターを すべて倒すとクリア。全 3 ステージ、最後はボスが出ます。
- 足場の種類：草・石・木・浮遊岩・崩れる遺跡・きのこ（大きく跳ねる）・動く足場。

---

## 2. 画像素材について

### 制作方法

この環境では **画像生成ツールが利用できなかった**ため、仕様書の代替手段に従い
**プログラムによる描画（Canvas 2D）** で制作しました。

1. `tools/artlib.js` … 手描き風の共通描画（輪郭・陰影・質感・草・岩・木・金属・布・水・雲）
2. `tools/assets_a.js` / `assets_b.js` / `assets_c.js` … 素材 72 点の描画コード
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
- 草は草地の上辺のカーブに合わせて生やし、浮いて見えないようにする。
- セル塗り＋やわらかい陰影。質感は控えめな筆致で、描き込みすぎない。
- UI の文字は画像に焼き込まず、**HTML 側のテキスト**で描画する。

### 検証結果

| 項目 | 結果 |
|------|------|
| ファイル数 | 72（すべて個別ファイル。スプライトシートではない） |
| 破損ファイル | 0 |
| アルファチャンネルあり | 72 / 72（`PNG RGBA`） |
| 実際に透明画素を含む | 71 / 72（`bg_sky.png` のみ全面不透過。最奥の空のため意図的） |
| 画像内の文字・透かし | なし |

---

## 3. 素材一覧（カテゴリ別）

| カテゴリ | 数 | 置き場所 | 内容 |
|----------|----|----------|------|
| スライム | 9 | `assets/sprites/slime/` | idle / drag / launch / fly / fall / land / blink / damage / icon |
| 敵 | 9 | `assets/sprites/enemies/` | ゴブリン 3・赤スライム 2・こうもり 2・ボス 2 |
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
slime-action/
├── index.html           画面と HUD（文字はすべて HTML 側）
├── css/style.css        HUD のスタイル（cqw 指定で画面に比例）
├── js/
│   ├── assets.js        素材一覧と読み込み（マニフェストから生成）
│   ├── world.js         足場・敵の当たり判定仕様とステージ定義
│   └── game.js          物理・入力・敵の行動・カメラ・描画・HUD 連携
├── assets/
│   ├── sprites/{slime,enemies,effects,platforms,props,ui,title}/
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
| 着地でつぶれる | `slime_land` を 0.2 秒表示＋土煙と星 |
| 軌道予測線 | `fx_trajectory_dot` を 64 ステップ分シミュレーションして表示 |
| 当たり判定 | `js/world.js` の `PLATFORM_SPECS` と `ENEMY_SPECS`（画像とは別に数値で保持） |
| 敵の行動 | ゴブリン＝往復と攻撃、赤スライム／ボス＝跳ねる、こうもり＝空中を往復 |
| 体力バー | 枠は `ui_energy_bar`、中身はコードで赤く描画 |
| 横スクロール | カメラが左右に追従、上下にも少し動く |
| パララックス | 空 → 遠景の浮島・山 → 雲 → 中景の浮島 → 滝・遺跡・ツタ → 樹林 |
| チェックポイント | `platform_checkpoint` ＋ `prop_checkpoint_flag`。着地で復帰地点を更新し `fx_checkpoint` を表示 |
| 落下中の演出 | `fx_fall` を落下速度が上がったときに流す |
| 高度表示 | `ui_height_marker` ＋ 地面からの高さ（1m = 48px） |
| ボタンの押下 | `ui_button_pressed` を重ね、押している間だけ表示 |
| 遠景の城 | `bg_castle` をステージ終盤で正面に見える位置に配置（視差 0.45） |
| タッチとマウス | Pointer Events で共通処理 |

---

## 6. 残っている課題

- 素材はすべて静止画です。ゴブリンの歩きは 2 枚の差し替えで表現しています。
- 宝箱は「開いた状態」の絵がなく、置き飾りとして使っています。
- 制作した 72 点はすべてゲーム内で使用しています。
- 音は WebAudio の簡単な効果音のみで、音声ファイルはありません。

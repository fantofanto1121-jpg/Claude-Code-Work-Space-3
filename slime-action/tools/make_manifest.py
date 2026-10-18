# -*- coding: utf-8 -*-
"""verify.py の結果と用途表から asset_manifest.json を作る"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify import scan

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')

# name: (カテゴリ, 用途, 関連素材)
META = {
 'slime_idle':      ('slime','地上で静止しているときの基本スプライト', ['slime_blink','slime_drag']),
 'slime_drag':      ('slime','引っ張り中。伸びと尾を描いた状態', ['slime_idle','slime_launch']),
 'slime_launch':    ('slime','はじかれた瞬間。斜め上へ飛び出す', ['slime_drag','slime_fly']),
 'slime_fly':       ('slime','上昇中。速度が高いときに表示', ['slime_launch','slime_fall']),
 'slime_fall':      ('slime','落下中。下向きの速度が出たときに表示', ['slime_fly','slime_land']),
 'slime_land':      ('slime','着地の瞬間につぶれた状態', ['slime_fall','slime_idle']),
 'slime_blink':     ('slime','待機中のまばたき', ['slime_idle']),
 'slime_damage':    ('slime','ダメージを受けた状態', ['slime_idle']),
 'slime_icon':      ('slime','UI 用の顔アイコン', ['slime_idle']),

 'fx_drag_line':      ('effect','引っ張る方向を示す帯', ['fx_trajectory_dot']),
 'fx_trajectory_dot': ('effect','軌道予測の点', ['fx_drag_line']),
 'fx_launch_streak':  ('effect','発射直後の速度線', ['slime_launch']),
 'fx_land_dust':      ('effect','着地時の土煙', ['slime_land']),
 'fx_land_star':      ('effect','やさしい着地の小さな星', ['slime_land']),
 'fx_splash':         ('effect','水っぽい着地のしぶき', ['slime_land']),
 'fx_checkpoint':     ('effect','チェックポイント到達の光', ['platform_checkpoint','prop_checkpoint_flag']),
 'fx_fall':           ('effect','落下中の空気の流れ', ['slime_fall']),

 'platform_grass_small':   ('platform','小さい草の足場（幅 150px 判定）', ['platform_grass_medium']),
 'platform_grass_medium':  ('platform','標準の草の足場（幅 270px 判定）', ['platform_grass_wide']),
 'platform_grass_wide':    ('platform','広い草の足場（幅 420px 判定）', ['platform_grass_medium']),
 'platform_stone':         ('platform','石の足場。遺跡帯で使用', ['platform_broken_ruin']),
 'platform_wood':          ('platform','木の足場。中層で使用', ['platform_moving']),
 'platform_floating_rock': ('platform','浮遊岩。単独で浮かぶ足場', ['platform_grass_small']),
 'platform_broken_ruin':   ('platform','崩れる足場。着地から 0.7 秒で落下', ['platform_stone']),
 'platform_mushroom':      ('platform','反発する足場。大きく跳ねる', []),
 'platform_moving':        ('platform','左右に動く足場', ['platform_wood']),
 'platform_checkpoint':    ('platform','チェックポイントの足場', ['prop_checkpoint_flag','fx_checkpoint']),

 'bg_sky':                   ('background','最奥の空。全画面に引き伸ばして使用（不透明）', []),
 'bg_far_mountains':         ('background','遠景の山。視差 0.08', []),
 'bg_floating_islands_far':  ('background','遠景の浮島。視差 0.18・縦に反復', []),
 'bg_castle':                ('background','遠景の城。頂上付近に配置', []),
 'bg_waterfall':             ('background','遠景の滝。視差 0.5', []),
 'bg_clouds_mid':            ('background','中景の雲。視差 0.3・縦に反復', []),
 'bg_floating_islands_mid':  ('background','中景の浮島。視差 0.45・縦に反復', []),
 'bg_vines':                 ('background','手前のツタ。視差 0.9', ['prop_vine']),
 'bg_forest_decoration':     ('background','地上付近の樹林。視差 0.75', []),
 'bg_ruins_decoration':      ('background','遺跡帯の背景装飾。視差 0.8', []),

 'prop_wood_sign':       ('prop','木の看板。地上の案内に使用', []),
 'prop_lantern':         ('prop','吊りランタン。足場の装飾', []),
 'prop_flag':            ('prop','旗。足場の装飾', []),
 'prop_chest':           ('prop','宝箱。開けると結晶が出る', ['prop_crystal']),
 'prop_crystal':         ('prop','結晶。拾うとスコア', ['ui_crystal']),
 'prop_flower':          ('prop','花。足場の装飾', []),
 'prop_bush':            ('prop','茂み。足場の装飾', []),
 'prop_rock':            ('prop','小石。足場の装飾', []),
 'prop_vine':            ('prop','ツタ。足場の装飾', ['bg_vines']),
 'prop_checkpoint_flag': ('prop','チェックポイントの旗', ['platform_checkpoint','ui_checkpoint']),

 'ui_heart_full':   ('ui','残りライフ（あり）', ['ui_heart_empty']),
 'ui_heart_empty':  ('ui','残りライフ（なし）', ['ui_heart_full']),
 'ui_energy_bar':   ('ui','引っ張りの強さゲージの枠', ['ui_energy_fill']),
 'ui_energy_fill':  ('ui','ゲージの中身。横幅を切り取って表示', ['ui_energy_bar']),
 'ui_panel':        ('ui','説明・一時停止パネルの下地（文字は DOM 側で描画）', []),
 'ui_button_normal':('ui','ボタン（通常）', ['ui_button_pressed']),
 'ui_button_pressed':('ui','ボタン（押下）', ['ui_button_normal']),
 'ui_pause':        ('ui','一時停止ボタン', []),
 'ui_height_marker':('ui','高さ表示のアイコン', []),
 'ui_checkpoint':   ('ui','チェックポイント到達数のアイコン', ['prop_checkpoint_flag']),
 'ui_coin':         ('ui','コイン枚数のアイコン', []),
 'ui_crystal':      ('ui','結晶の所持数アイコン', ['prop_crystal']),
 'ui_settings':     ('ui','設定ボタン', []),

 'enemy_goblin_idle':    ('enemy','ゴブリンの待機', ['enemy_goblin_walk','enemy_goblin_attack']),
 'enemy_goblin_walk':    ('enemy','ゴブリンの歩き', ['enemy_goblin_idle']),
 'enemy_goblin_attack':  ('enemy','ゴブリンの攻撃。近づくと表示', ['enemy_goblin_idle']),
 'enemy_redslime_idle':  ('enemy','赤スライムの待機', ['enemy_redslime_squash']),
 'enemy_redslime_squash':('enemy','赤スライムの着地つぶれ', ['enemy_redslime_idle']),
 'enemy_bat_up':         ('enemy','こうもりの羽ばたき（上）', ['enemy_bat_down']),
 'enemy_bat_down':       ('enemy','こうもりの羽ばたき（下）', ['enemy_bat_up']),
 'enemy_boss_idle':      ('enemy','ボススライムの待機', ['enemy_boss_squash']),
 'enemy_boss_squash':    ('enemy','ボススライムの着地つぶれ', ['enemy_boss_idle']),

 'logo_slime_adventure': ('title','タイトルの飾り枠。題字は DOM のテキストで重ねる', ['title_slime_pose']),
 'title_slime_pose':     ('title','タイトル画面の主人公イラスト', ['logo_slime_adventure']),
 'title_decoration':     ('title','タイトル画面の装飾（星・草花）', []),
}

def find_recipes():
    """各素材がどのファイルの def(...) で描かれたかを記録する"""
    recipes = {}
    for fn in ('assets_a.js', 'assets_b.js'):
        path = os.path.join(HERE, fn)
        with open(path, encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                s = line.strip()
                if s.startswith("def('"):
                    name = s.split("'")[1]
                    recipes[name] = {'source': 'tools/' + fn, 'line': i,
                                     'helpers': 'tools/artlib.js'}
    return recipes


def main():
    rows = scan()
    recipes = find_recipes()
    by_name = {}
    for r in rows:
        name = os.path.splitext(os.path.basename(r['file']))[0]
        by_name[name] = r
    items = []
    missing = []
    for name, (cat, usage, rel) in META.items():
        r = by_name.get(name)
        if not r:
            missing.append(name)
            continue
        items.append({
            'name': name,
            'file': 'assets/' + r['file'],
            'category': cat,
            'usage': usage,
            'width': r['w'],
            'height': r['h'],
            'color_mode': r['mode'],
            'has_alpha_channel': r['alpha_channel'],
            'transparent_pixel_ratio': r['transparent_ratio'],
            'fully_opaque': r['transparent_px'] == 0,
            'content_bbox': r['content_bbox'],
            'bytes': r['bytes'],
            'related': rel,
            'recipe': recipes.get(name),
        })
    extra = sorted(set(by_name) - set(META))
    doc = {
        'project': 'slime-action',
        'title': 'スライム・スリング アドベンチャー',
        'generated_with': {
            'method': 'procedural-canvas2d',
            'detail': '画像生成ツールは利用できないため、Canvas 2D による手続き的描画を '
                      'headless Chromium で実行し、canvas.toDataURL("image/png") で '
                      'アルファ付き PNG として書き出した。',
            'source_files': ['tools/artlib.js', 'tools/assets_a.js', 'tools/assets_b.js',
                             'tools/gen.html', 'tools/generate.cjs'],
            'reproduce': 'node tools/generate.cjs （PW_CORE, PW_EXE を指定）',
            'verified_with': 'tools/verify.py (Pillow)',
        },
        'style_guide': {
            'light_direction': '左上',
            'outline': '同系色の濃い線。外周のシルエットにのみ描く',
            'palette': {
                'slime': ['#e8faff', '#6ecbf0', '#2585c0', '#1a648f'],
                'grass': ['#9fd964', '#6bb843', '#3f8a35', '#2d5c2a'],
                'rock':  ['#b8ad9b', '#8d8273', '#4b453d', '#332d27'],
                'wood':  ['#c9995e', '#a3703d', '#6a431f', '#412716'],
                'metal': ['#dde4ea', '#9aa3ac', '#5a636c', '#303840'],
                'ui':    ['#2c527c', '#17304f', '#0a1626', '#8fc2ec'],
                'gold':  ['#f0dc9a', '#c9a94f', '#8a6c22', '#4e3a0f'],
            },
            'notes': 'UI の文字は画像に焼き込まず、HTML 側のテキストで描画する',
        },
        'counts': {
            'total': len(items),
            'by_category': {},
        },
        'assets': sorted(items, key=lambda a: (a['category'], a['name'])),
        'unlisted_files': extra,
        'missing_files': missing,
    }
    for a in items:
        doc['counts']['by_category'][a['category']] = doc['counts']['by_category'].get(a['category'], 0) + 1
    out_dir = os.path.join(ROOT, 'assets', 'metadata')
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'asset_manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print('total', doc['counts']['total'], doc['counts']['by_category'])
    print('missing', missing, 'unlisted', extra)

if __name__ == '__main__':
    main()

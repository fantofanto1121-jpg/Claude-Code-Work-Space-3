# -*- coding: utf-8 -*-
"""
build_assets.py — 切り出した部品に名前を付けて assets/sheet/ へ配置し、
ゲームが使う寸法（着地面・当たり判定の幅・HUD の位置）を自動計測して書き出す。
絵は配布されたシートのものをそのまま使い、描き変えはしない。
"""
import os, json
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT = os.path.join(ROOT, 'assets', 'sheet')

# name: (どちらの切り出しか, id, 置き場所)
MAP = {
    # --- スライム ---
    'slime_idle':      ('c', 1,  'slime'),
    'slime_smile':     ('c', 2,  'slime'),
    'slime_laugh':     ('c', 3,  'slime'),
    'slime_blink':     ('c', 4,  'slime'),
    'slime_happy':     ('c', 5,  'slime'),
    'slime_drag':      ('c', 12, 'slime'),
    'slime_stretch':   ('c', 18, 'slime'),
    'slime_launch':    ('c', 20, 'slime'),
    'slime_fly':       ('c', 13, 'slime'),
    'slime_fly_long':  ('c', 39, 'slime'),
    'slime_fall':      ('c', 19, 'slime'),
    # --- 敵 ---
    'goblin_1':   ('c', 6,  'enemies'), 'goblin_2': ('c', 7,  'enemies'),
    'goblin_3':   ('c', 8,  'enemies'), 'goblin_4': ('c', 9,  'enemies'),
    'redslime_1': ('c', 14, 'enemies'), 'redslime_2': ('c', 15, 'enemies'),
    'redslime_3': ('c', 16, 'enemies'), 'redslime_4': ('c', 17, 'enemies'),
    'purple_1':   ('c', 21, 'enemies'), 'purple_2': ('c', 22, 'enemies'),
    'purple_3':   ('c', 23, 'enemies'), 'purple_4': ('c', 24, 'enemies'),
    # --- 足場 ---
    'island_wide':   ('c', 26, 'platforms'),
    'island_fence':  ('c', 27, 'platforms'),
    'island_medium': ('c', 25, 'platforms'),
    'island_small':  ('c', 30, 'platforms'),
    'island_tiny':   ('c', 43, 'platforms'),
    'island_rock':   ('c', 0,  'platforms'),
    'island_mini':   ('c', 31, 'platforms'),
    # --- 小物 ---
    'fence':      ('c', 28, 'props'),
    'banner':     ('f', 31, 'props'),
    'lantern':    ('f', 32, 'props'),
    'barrel':     ('f', 36, 'props'),
    'chest':      ('f', 44, 'props'),
    'bush_big':   ('c', 36, 'props'),
    'bush_small': ('c', 42, 'props'),
    'plant':      ('f', 35, 'props'),
    'rock_grass': ('f', 43, 'props'),
    'rock_small': ('c', 40, 'props'),
    'rocks':      ('c', 35, 'props'),
    'log':        ('f', 62, 'props'),
    'sign':       ('c', 37, 'props'),
    'flagpole':   ('f', 45, 'props'),
    # --- 背景 ---
    'castle_island':   ('c', 10, 'bg'),
    'sky_strip':       ('f', 84, 'bg'),
    'island_far_1':    ('c', 11, 'bg'),
    'island_far_2':    ('c', 45, 'bg'),
    'island_far_3':    ('f', 52, 'bg'),
    'island_far_4':    ('f', 60, 'bg'),
    'waterfall_big':   ('c', 33, 'bg'),
    'waterfall_mid':   ('c', 34, 'bg'),
    'waterfall_small': ('c', 44, 'bg'),
    # --- エフェクト ---
    'fx_swoosh':   ('c', 46, 'fx'),
    'fx_swoosh_s': ('c', 48, 'fx'),
    'fx_comet':    ('c', 47, 'fx'),
    'fx_star':     ('f', 56, 'fx'),
    'fx_splash':   ('f', 67, 'fx'),
    'fx_ripple':   ('f', 68, 'fx'),
    'fx_ripple_s': ('f', 77, 'fx'),
    'fx_dash':     ('f', 57, 'fx'),
    'fx_arrow':    ('f', 49, 'fx'),
    'fx_water':    ('c', 52, 'fx'),
    # --- UI ---
    'ui_status_panel':  ('f', 63, 'ui'),
    'ui_tutorial':      ('f', 85, 'ui'),
    'ui_quest_banner':  ('f', 70, 'ui'),
    'ui_height_panel':  ('f', 78, 'ui'),
    'ui_compass':       ('c', 53, 'ui'),
    'ui_coin':          ('f', 71, 'ui'),
    'ui_gem':           ('f', 72, 'ui'),
    'ui_potion':        ('f', 73, 'ui'),
    'ui_chest':         ('f', 75, 'ui'),
    'ui_key':           ('c', 56, 'ui'),
    'ui_pin':           ('f', 76, 'ui'),
    'ui_diamond':       ('f', 83, 'ui'),
    'ui_exclaim':       ('f', 79, 'ui'),
    'ui_btn_special':   ('f', 87, 'ui'),
    'ui_btn_slime':     ('f', 88, 'ui'),
    'ui_btn_potion':    ('f', 89, 'ui'),
    'ui_slime_row':     ('c', 59, 'ui'),
}

PLATFORMS = ['island_wide', 'island_fence', 'island_medium', 'island_small',
             'island_tiny', 'island_rock', 'island_mini']


def load(kind, i):
    d = 'sliced' if kind == 'c' else 'sliced_fine'
    return Image.open(os.path.join(HERE, d, 'piece_%03d.png' % i)).convert('RGBA')


def platform_metrics(im):
    """着地面の高さと、水平な上面の左右の範囲を、絵の形から測る"""
    a = np.array(im)[:, :, 3]
    h, w = a.shape
    tops = np.full(w, -1, dtype=np.int32)
    for x in range(w):
        col = np.nonzero(a[:, x] > 96)[0]
        if len(col):
            tops[x] = col[0]
    valid = tops >= 0
    if not valid.any():
        return {'surface': 0, 'left': 0, 'right': w}
    mid = tops[valid]
    surface = int(np.percentile(mid, 25))      # 上面として多い高さ
    ok = valid & (tops <= surface + 12)
    xs = np.nonzero(ok)[0]
    # 連続した最大区間を上面とする
    best = (0, 0); run_start = xs[0]; prev = xs[0]
    for x in xs[1:]:
        if x != prev + 1:
            if prev - run_start > best[1] - best[0]:
                best = (run_start, prev)
            run_start = x
        prev = x
    if prev - run_start > best[1] - best[0]:
        best = (run_start, prev)
    return {'surface': surface, 'left': int(best[0]), 'right': int(best[1] + 1)}


def panel_anchors(im):
    """HUD のステータス板から、ハート列と青いバーの位置を測る"""
    a = np.array(im)
    rgb, al = a[:, :, :3].astype(np.int32), a[:, :, 3]
    red = (rgb[:, :, 0] > 150) & (rgb[:, :, 1] < 95) & (rgb[:, :, 2] < 95) & (al > 128)
    blue = (rgb[:, :, 2] > 170) & (rgb[:, :, 0] < 110) & (al > 128)
    # 青いバーだけを見る（左のスライム章は除く）
    ys, xs = np.nonzero(red)
    if len(xs):
        blue[:, :int(xs.min()) - 4] = False
        blue[:int(ys.max()) + 4, :] = False
    def bbox(m):
        ys, xs = np.nonzero(m)
        if not len(ys):
            return None
        return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    return {'hearts': bbox(red), 'bar': bbox(blue), 'w': im.width, 'h': im.height}


def crop_heart(im, hearts_box):
    """ハート 1 つ分を切り出す（ゲーム側で数を変えて並べるため）"""
    x0, y0, x1, y1 = hearts_box
    one_w = (x1 - x0) / 4.0
    pad = 2
    box = (int(x0), max(0, y0 - pad), int(x0 + one_w), min(im.height, y1 + pad))
    return im.crop(box)


def main():
    manifest = {'project': 'slime-action', 'source': 'assets/source/asset_sheet.webp',
                'note': '配布された 1 枚絵のシートから切り出した素材。絵の描き変えはしていない。',
                'assets': [], 'platform_metrics': {}, 'ui_anchors': {}}
    for name, (kind, pid, cat) in MAP.items():
        im = load(kind, pid)
        d = os.path.join(OUT, cat)
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, name + '.png')
        im.save(path)
        rel = os.path.relpath(path, ROOT).replace('\\', '/')
        al = np.array(im)[:, :, 3]
        manifest['assets'].append({
            'name': name, 'file': rel, 'category': cat,
            'width': im.width, 'height': im.height,
            'has_alpha_channel': True,
            'transparent_pixel_ratio': round(float((al == 0).mean()), 4),
            'source_piece': ('coarse' if kind == 'c' else 'fine') + '#' + str(pid),
            'bytes': os.path.getsize(path),
        })
        if name in PLATFORMS:
            manifest['platform_metrics'][name] = platform_metrics(im)

    # 向きのある絵（伸びたスライム・飛んでいるスライム）は、頭の位置を測る
    DIRECTIONAL = ['slime_drag', 'slime_stretch', 'slime_launch', 'slime_fly',
                   'slime_fly_long', 'slime_fall', 'fx_swoosh', 'fx_swoosh_s', 'fx_comet']
    anchors = {}
    for name in DIRECTIONAL:
        kind, pid, cat = MAP[name]
        im = load(kind, pid)
        al = np.array(im)[:, :, 3]
        cols = (al > 96).sum(axis=0)
        if cols.max() == 0:
            continue
        hx = int(np.argmax(cols))
        rows = np.nonzero(al[:, hx] > 96)[0]
        hy = int((rows.min() + rows.max()) / 2) if len(rows) else im.height // 2
        anchors[name] = {'head': [hx, hy], 'w': im.width, 'h': im.height,
                         'facing': 'right' if hx > im.width / 2 else 'left'}
    manifest['sprite_anchors'] = anchors

    # HUD のステータス板からハートを切り出す
    panel = load('f', 63)
    anc = panel_anchors(panel)
    manifest['ui_anchors']['status_panel'] = anc
    if anc['hearts']:
        heart = crop_heart(panel, anc['hearts'])
        hp = os.path.join(OUT, 'ui', 'ui_heart.png')
        heart.save(hp)
        manifest['assets'].append({
            'name': 'ui_heart', 'file': os.path.relpath(hp, ROOT).replace('\\', '/'),
            'category': 'ui', 'width': heart.width, 'height': heart.height,
            'has_alpha_channel': True, 'source_piece': 'fine#63 (status panel から切り出し)',
            'transparent_pixel_ratio': round(float((np.array(heart)[:, :, 3] == 0).mean()), 4),
            'bytes': os.path.getsize(hp),
        })

    # 背景の色は、配布されたシートの空の絵から取る（色を勝手に作らない）
    strip = np.array(load('f', 84).convert('RGB'))
    hgt = strip.shape[0]
    def band(a, b):
        px = strip[int(hgt * a):int(hgt * b)].reshape(-1, 3).mean(axis=0)
        return '#%02x%02x%02x' % tuple(int(v) for v in px)
    manifest['sky_colors'] = [band(0.0, 0.2), band(0.2, 0.5), band(0.5, 0.78), band(0.78, 1.0)]

    # ゲージの色もステータス板から取る
    pan = np.array(panel.convert('RGB'))
    bx = anc['bar']
    if bx:
        fill = pan[bx[1]:bx[3], bx[0]:bx[2]].reshape(-1, 3).mean(axis=0)
        manifest['bar_colors'] = {
            'fill': '#%02x%02x%02x' % tuple(int(v) for v in fill),
            'track': '#121c2b',
            'rect': [bx[0], bx[1], anc['w'] - 8, bx[3]]
        }

    manifest['counts'] = {'total': len(manifest['assets'])}
    md = os.path.join(ROOT, 'assets', 'metadata')
    os.makedirs(md, exist_ok=True)
    with open(os.path.join(md, 'asset_manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    # ゲームが読む寸法データ
    js = ['/* sheet_data.js — tools/build_assets.py が自動生成。手で編集しない */',
          "'use strict';", '',
          'const PLATFORM_METRICS = ' + json.dumps(manifest['platform_metrics'], ensure_ascii=False, indent=2) + ';',
          '', 'const UI_ANCHORS = ' + json.dumps(manifest['ui_anchors'], ensure_ascii=False, indent=2) + ';',
          '', 'const SPRITE_ANCHORS = ' + json.dumps(manifest['sprite_anchors'], ensure_ascii=False) + ';',
          '', 'const SKY_COLORS = ' + json.dumps(manifest['sky_colors'], ensure_ascii=False) + ';',
          '', 'const BAR_STYLE = ' + json.dumps(manifest.get('bar_colors', {}), ensure_ascii=False) + ';', '']
    with open(os.path.join(ROOT, 'js', 'sheet_data.js'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(js))
    print('assets:', len(manifest['assets']))
    print('platform metrics:', json.dumps(manifest['platform_metrics'], ensure_ascii=False))
    print('ui anchors:', json.dumps(anc, ensure_ascii=False))


if __name__ == '__main__':
    main()

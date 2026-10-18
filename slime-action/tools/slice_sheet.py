# -*- coding: utf-8 -*-
"""
slice_sheet.py — 配布された 1 枚絵の素材シートを、個別の透過 PNG に切り出す。

やっていること:
  1. 白い背景（画像のふちから連続している白）だけを透明にする
     （スプライト内部の白いハイライトは残す）
  2. ふちの白いにじみを薄めて、切り抜きのギザギザを抑える
  3. 透明でない部分をかたまりごとに分け、1 つずつ PNG として書き出す
絵そのものは描き変えていない。切り出しと透過処理だけを行う。
"""
import os, sys, json
from collections import deque
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = os.path.join(ROOT, 'assets', 'source', 'asset_sheet.webp')

ALPHA_LO, ALPHA_HI = 64, 200   # 元画像のアルファをこの範囲で 0〜255 に伸ばす
GROUP_PAD = int(os.environ.get('GROUP_PAD', '5'))   # この距離内のかたまりは 1 つにまとめる
MIN_AREA = int(os.environ.get('MIN_AREA', '260'))  # これより小さいかたまりは捨てる


def dilate(mask, r):
    out = mask.copy()
    for _ in range(r):
        p = np.zeros_like(out)
        p[1:, :] |= out[:-1, :]
        p[:-1, :] |= out[1:, :]
        p[:, 1:] |= out[:, :-1]
        p[:, :-1] |= out[:, 1:]
        out |= p
    return out


def label(mask):
    """連結成分にラベルを振る（4 近傍）"""
    h, w = mask.shape
    lab = np.zeros((h, w), dtype=np.int32)
    cur = 0
    ys, xs = np.nonzero(mask)
    for i in range(len(ys)):
        sy, sx = int(ys[i]), int(xs[i])
        if lab[sy, sx]:
            continue
        cur += 1
        lab[sy, sx] = cur
        q = deque([(sy, sx)])
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = cur
                    q.append((ny, nx))
    return lab, cur


def build_alpha(src_alpha):
    """元画像のアルファを伸ばして、背景のうっすらした部分を完全に透明にする"""
    a = src_alpha.astype(np.float32)
    a = (a - ALPHA_LO) * (255.0 / (ALPHA_HI - ALPHA_LO))
    return np.clip(a, 0, 255).astype(np.uint8)


def main():
    im = Image.open(SRC).convert('RGBA')
    arr = np.array(im)
    alpha = build_alpha(arr[:, :, 3])

    solid = alpha > 40
    groups, n = label(dilate(solid, GROUP_PAD))
    out_dir = os.path.join(HERE, os.environ.get('OUT_DIR', 'sliced'))
    os.makedirs(out_dir, exist_ok=True)

    items = []
    for gid in range(1, n + 1):
        m = (groups == gid) & solid
        area = int(m.sum())
        if area < MIN_AREA:
            continue
        ys, xs = np.nonzero(m)
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        crop = arr[y0:y1, x0:x1].copy()
        crop[:, :, 3] = np.where(m[y0:y1, x0:x1], alpha[y0:y1, x0:x1], 0)
        items.append({'box': [x0, y0, x1, y1], 'area': area, 'img': crop})

    # 左上から順に並べる（行ごと）
    items.sort(key=lambda it: (round(it['box'][1] / 40), it['box'][0]))
    index = []
    for i, it in enumerate(items):
        Image.fromarray(it['img'], 'RGBA').save(os.path.join(out_dir, 'piece_%03d.png' % i))
        x0, y0, x1, y1 = it['box']
        index.append({'id': i, 'box': it['box'], 'w': x1 - x0, 'h': y1 - y0, 'area': it['area']})
    with open(os.path.join(HERE, os.environ.get('OUT_DIR', 'sliced') + '_index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print('pieces:', len(items))


if __name__ == '__main__':
    main()

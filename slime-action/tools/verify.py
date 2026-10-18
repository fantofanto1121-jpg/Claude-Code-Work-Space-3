# -*- coding: utf-8 -*-
"""生成した PNG の検証: アルファチャンネルの実在・寸法・余白・破損をチェックする"""
import json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')

def scan():
    rows = []
    for dirpath, _dirs, files in os.walk(ROOT):
        for fn in sorted(files):
            if not fn.endswith('.png'):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, ROOT).replace('\\', '/')
            try:
                im = Image.open(p)
                im.load()
            except Exception as e:                      # 破損チェック
                rows.append({'file': rel, 'ok': False, 'error': str(e)})
                continue
            alpha_ch = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
            a = im.convert('RGBA').getchannel('A')
            ext = a.getextrema()
            hist = a.histogram()
            total = im.width * im.height
            transparent = hist[0]
            partial = sum(hist[1:255])
            opaque = hist[255]
            bbox = a.getbbox()
            pad = None
            if bbox:
                pad = [bbox[0], bbox[1], im.width - bbox[2], im.height - bbox[3]]
            rows.append({
                'file': rel, 'ok': True, 'mode': im.mode, 'w': im.width, 'h': im.height,
                'alpha_channel': bool(alpha_ch), 'alpha_min': ext[0], 'alpha_max': ext[1],
                'transparent_px': transparent, 'semi_px': partial, 'opaque_px': opaque,
                'transparent_ratio': round(transparent / total, 4),
                'content_bbox': list(bbox) if bbox else None,
                'empty_margin_lrtb': pad,
                'bytes': os.path.getsize(p),
            })
    return rows

if __name__ == '__main__':
    rows = scan()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify_report.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    bad = [r for r in rows if not r.get('ok')]
    no_alpha = [r for r in rows if r.get('ok') and not r['alpha_channel']]
    fully_opaque = [r for r in rows if r.get('ok') and r['transparent_px'] == 0]
    big_margin = [r for r in rows if r.get('ok') and r['empty_margin_lrtb'] and max(r['empty_margin_lrtb']) > max(r['w'], r['h']) * 0.18]
    print('files:', len(rows))
    print('corrupt:', len(bad))
    print('without alpha channel:', len(no_alpha))
    print('fully opaque (no transparent px):', [r['file'] for r in fully_opaque])
    print('large empty margin:', [(r['file'], r['empty_margin_lrtb']) for r in big_margin])

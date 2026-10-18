/* ===========================================================
   artlib.js — 手描き風 2D アセットのための描画プリミティブ
   ブラウザの Canvas 2D 上で動きます（素材生成時のみ使用）。
   光源はすべて左上。輪郭は濃い同系色。質感はクリップした筆致で表現。
   =========================================================== */
'use strict';

const A = (function () {

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 色 ---------- */
  function hex(c) {
    const s = c.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function rgba(c, a) {
    const v = hex(c);
    return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + a + ')';
  }
  function mix(c1, c2, t) {
    const a = hex(c1), b = hex(c2);
    const r = Math.round(lerp(a[0], b[0], t)), g = Math.round(lerp(a[1], b[1], t)), bl = Math.round(lerp(a[2], b[2], t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function shadeC(c, amt) { return mix(c, amt < 0 ? '#1b1410' : '#ffffff', Math.abs(amt)); }

  /* ---------- パス ---------- */
  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // 点列をなめらかな閉曲線でつなぐ（手描きのふくらみを出す）
  function blob(ctx, pts) {
    const n = pts.length;
    ctx.beginPath();
    const mid0 = [(pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2];
    ctx.moveTo(mid0[0], mid0[1]);
    for (let i = 0; i < n; i++) {
      const c = pts[i], nx = pts[(i + 1) % n];
      ctx.quadraticCurveTo(c[0], c[1], (c[0] + nx[0]) / 2, (c[1] + nx[1]) / 2);
    }
    ctx.closePath();
  }

  // 円周上に揺らぎを与えた塊（岩・茂み・雲など）
  function lumpPts(cx, cy, rx, ry, n, wob, rnd) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = 1 + (rnd() - 0.5) * wob;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  }

  /* ---------- 塗り ---------- */
  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }
  function rad(ctx, x0, y0, r0, x1, y1, r1, stops) {
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }

  /* ---------- 共通の仕上げ ----------
     pathFn: ctx を受け取りパスを作る関数
     o: { base, hi, lo, box:[x,y,w,h], lw, outline, tex, rim, core }
  */
  function paint(ctx, pathFn, o) {
    const b = o.box;
    const base = o.base, hi = o.hi || shadeC(base, 0.3), lo = o.lo || shadeC(base, -0.35);
    const oc = o.outline || shadeC(base, -0.62);

    ctx.save();
    pathFn(ctx);
    ctx.fillStyle = lin(ctx, b[0], b[1], b[0] + b[2] * 0.55, b[1] + b[3],
      [[0, hi], [0.42, base], [1, lo]]);
    ctx.fill();

    // 内側の陰影と筆致
    ctx.save();
    pathFn(ctx);
    ctx.clip();

    // 右下の陰（コアシャドウ）
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = lin(ctx, b[0] + b[2] * 0.35, b[1] + b[3] * 0.3, b[0] + b[2], b[1] + b[3],
      [[0, rgba('#000000', 0)], [1, rgba(hexOf(lo), 0.75)]]);
    ctx.fillRect(b[0] - 4, b[1] - 4, b[2] + 8, b[3] + 8);
    ctx.globalAlpha = 1;

    // 左上のあたり（リムライト）
    if (o.rim !== false) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = lin(ctx, b[0], b[1], b[0] + b[2] * 0.5, b[1] + b[3] * 0.55,
        [[0, rgba(hexOf(hi), 0.9)], [1, rgba(hexOf(hi), 0)]]);
      ctx.fillRect(b[0] - 4, b[1] - 4, b[2] + 8, b[3] + 8);
      ctx.globalAlpha = 1;
    }

    if (o.tex) o.tex(ctx);
    ctx.restore();

    // 輪郭（二度描きでわずかに太さを変える）
    if (o.outline !== 'none') {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(hexOf(oc), 0.9);
      ctx.lineWidth = o.lw || 3;
      pathFn(ctx); ctx.stroke();
      ctx.strokeStyle = rgba(hexOf(oc), 0.35);
      ctx.lineWidth = (o.lw || 3) * 1.7;
      pathFn(ctx); ctx.stroke();
    }
    ctx.restore();
  }

  // rgb(...) 形式も受けられるように #rrggbb へ寄せる
  function hexOf(c) {
    if (c[0] === '#') return c;
    const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!m) return '#000000';
    const h = function (v) { return ('0' + parseInt(v, 10).toString(16)).slice(-2); };
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }

  /* ---------- 質感（クリップ内で呼ぶ） ---------- */
  function speckle(ctx, rnd, n, box, colors, sz) {
    for (let i = 0; i < n; i++) {
      const x = box[0] + rnd() * box[2], y = box[1] + rnd() * box[3];
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.beginPath();
      ctx.ellipse(x, y, sz * (0.5 + rnd()), sz * (0.4 + rnd() * 0.7), rnd() * 3, 0, TAU);
      ctx.fill();
    }
  }
  function brush(ctx, rnd, n, box, color, w, len) {
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = box[0] + rnd() * box[2], y = box[1] + rnd() * box[3];
      const a = (rnd() - 0.5) * 1.2 + 0.4;
      const l = len * (0.5 + rnd());
      ctx.lineWidth = w * (0.6 + rnd() * 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 - l * 0.2,
        x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  function crack(ctx, rnd, n, box, color, w) {
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let x = box[0] + rnd() * box[2], y = box[1] + rnd() * box[3];
      ctx.lineWidth = w * (0.6 + rnd());
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (rnd() - 0.5) * box[2] * 0.18;
        y += box[3] * (0.1 + rnd() * 0.16);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function softShadow(ctx, x, y, rx, ry, alpha) {
    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.fillStyle = rgba('#1d2a1c', alpha === undefined ? 0.3 : alpha);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function glow(ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [
      [0, rgba(color, alpha)], [0.5, rgba(color, alpha * 0.38)], [1, rgba(color, 0)]
    ]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------- 素材パーツ ---------- */

  // 草の天面（足場の上側）
  function grassCap(ctx, x0, x1, y, depth, rnd, pal) {
    const p = pal || {};
    const g1 = p.g1 || '#9fd964', g2 = p.g2 || '#6bb843', g3 = p.g3 || '#3f8a35';
    const w = x1 - x0;
    const path = function (c) {
      c.beginPath();
      c.moveTo(x0, y + depth * 0.3);
      c.quadraticCurveTo(x0 + w * 0.5, y - depth * 0.35, x1, y + depth * 0.3);
      const bumps = Math.max(4, Math.round(w / 34));
      for (let i = bumps; i >= 0; i--) {
        const t = i / bumps;
        const bx = lerp(x0, x1, t);
        const by = y + depth * (0.52 + Math.abs(Math.sin(t * Math.PI * 4 + 1)) * 0.46) + rnd() * depth * 0.1;
        c.lineTo(bx, by);
      }
      c.closePath();
    };
    paint(ctx, path, {
      base: g2, hi: g1, lo: g3, box: [x0, y - depth * 0.4, w, depth * 1.4], lw: 2.6,
      outline: '#2d5c2a',
      tex: function (c) {
        brush(c, rnd, Math.round(w / 9), [x0, y - depth * 0.2, w, depth * 1.1], rgba('#2f6b2d', 0.22), 2.4, 10);
        brush(c, rnd, Math.round(w / 14), [x0, y - depth * 0.3, w, depth * 0.6], rgba('#d6f3a0', 0.3), 2.2, 9);
      }
    });
    // 立ち上がる草
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < Math.round(w / 13); i++) {
      const bx = x0 + 4 + rnd() * (w - 8);
      const hgt = depth * (0.35 + rnd() * 0.55);
      ctx.strokeStyle = rnd() > 0.5 ? g1 : g2;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(bx, y + depth * 0.18);
      ctx.quadraticCurveTo(bx + (rnd() - 0.5) * 7, y - hgt * 0.5, bx + (rnd() - 0.5) * 14, y - hgt);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 岩の塊
  function rockMass(ctx, pts, rnd, pal) {
    const p = pal || {};
    const base = p.base || '#8d8273', hi = p.hi || '#b8ad9b', lo = p.lo || '#4b453d';
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    pts.forEach(function (q) {
      minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]);
      miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]);
    });
    const box = [minx, miny, maxx - minx, maxy - miny];
    const path = function (c) { blob(c, pts); };
    paint(ctx, path, {
      base: base, hi: hi, lo: lo, box: box, lw: 3, outline: p.outline || '#332d27',
      tex: function (c) {
        // 地層
        c.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const yy = box[1] + box[3] * (0.2 + i * 0.19) + rnd() * 6;
          c.strokeStyle = i % 2 ? rgba('#ffffff', 0.1) : rgba('#2b241d', 0.14);
          c.lineWidth = 4 + rnd() * 6;
          c.beginPath();
          c.moveTo(box[0] - 8, yy);
          c.bezierCurveTo(box[0] + box[2] * 0.35, yy + 9, box[0] + box[2] * 0.7, yy - 8, box[0] + box[2] + 8, yy + 4);
          c.stroke();
        }
        crack(c, rnd, Math.round(box[2] / 60) + 1, box, rgba('#241e18', 0.35), 1.8);
        speckle(c, rnd, Math.round(box[2] / 18), box, [rgba('#ffffff', 0.08), rgba('#2a241d', 0.1)], 4);
      }
    });
  }

  // 木の板
  function plank(ctx, x, y, w, h, rnd, pal) {
    const p = pal || {};
    const base = p.base || '#a3703d', hi = p.hi || '#c9995e', lo = p.lo || '#6a431f';
    paint(ctx, function (c) { rr(c, x, y, w, h, Math.min(7, h / 2.5)); }, {
      base: base, hi: hi, lo: lo, box: [x, y, w, h], lw: 2.6, outline: '#412716',
      tex: function (c) {
        c.lineCap = 'round';
        for (let i = 0; i < Math.max(2, Math.round(h / 7)); i++) {
          const yy = y + 4 + rnd() * (h - 8);
          c.strokeStyle = rgba(rnd() > 0.5 ? '#6a431f' : '#c9995e', 0.3);
          c.lineWidth = 1.4 + rnd() * 1.6;
          c.beginPath();
          c.moveTo(x + 3, yy);
          c.bezierCurveTo(x + w * 0.3, yy + (rnd() - 0.5) * 5, x + w * 0.7, yy + (rnd() - 0.5) * 5, x + w - 3, yy);
          c.stroke();
        }
        // 節
        if (rnd() > 0.45) {
          const kx = x + w * (0.2 + rnd() * 0.6), ky = y + h * 0.5;
          c.strokeStyle = rgba('#5c3719', 0.45); c.lineWidth = 2;
          c.beginPath(); c.ellipse(kx, ky, 4.5, 3, 0.3, 0, TAU); c.stroke();
        }
      }
    });
  }

  // 金属板
  function metal(ctx, pathFn, box, rnd, pal) {
    const p = pal || {};
    paint(ctx, pathFn, {
      base: p.base || '#9aa3ac', hi: p.hi || '#dde4ea', lo: p.lo || '#5a636c',
      box: box, lw: 2.6, outline: p.outline || '#303840',
      tex: function (c) {
        c.strokeStyle = rgba('#ffffff', 0.32);
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(box[0] + box[2] * 0.14, box[1] + box[3] * 0.24);
        c.lineTo(box[0] + box[2] * 0.42, box[1] + box[3] * 0.2);
        c.stroke();
        speckle(c, rnd, 8, box, [rgba('#ffffff', 0.12), rgba('#2a3138', 0.12)], 3);
      }
    });
  }

  // 葉のかたまり（茂み・樹冠）
  // 輪郭は外側のシルエットにだけ出す（内側の円が線で重なって見えないように）
  function foliage(ctx, cx, cy, rx, ry, rnd, pal) {
    const p = pal || {};
    const base = p.base || '#5aa341', hi = p.hi || '#8fcf5c', lo = p.lo || '#2f6b2f';
    const oc = p.outline || '#27542a';
    const puffs = 5 + Math.floor(rnd() * 3);
    const seeds = [];
    for (let i = 0; i < puffs; i++) {
      const t = i / puffs;
      seeds.push([
        cx + Math.cos(t * TAU) * rx * 0.55,
        cy + Math.sin(t * TAU) * ry * 0.5,
        rx * (0.4 + rnd() * 0.2)
      ]);
    }
    const path = function (c) {
      c.beginPath();
      seeds.forEach(function (s) { c.moveTo(s[0] + s[2], s[1]); c.arc(s[0], s[1], s[2], 0, TAU); });
      c.moveTo(cx + rx * 0.8, cy);
      c.ellipse(cx, cy, rx * 0.8, ry * 0.72, 0, 0, TAU);
    };

    ctx.save();
    // 1) 外周の輪郭（ひとまわり大きい同じ形を濃い色で）
    path(ctx);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = oc; ctx.lineWidth = Math.max(3, rx * 0.11);
    ctx.stroke();
    ctx.fillStyle = oc;
    ctx.fill();

    // 2) 本体
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(0.975, 0.965); ctx.translate(-cx, -cy);
    path(ctx);
    ctx.fillStyle = lin(ctx, cx - rx * 0.5, cy - ry, cx + rx * 0.5, cy + ry,
      [[0, hi], [0.45, base], [1, lo]]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // 下側の陰
    ctx.fillStyle = lin(ctx, cx, cy, cx + rx * 0.4, cy + ry,
      [[0, rgba(lo, 0)], [1, rgba(lo, 0.55)]]);
    ctx.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
    // 葉の重なり
    for (let i = 0; i < 4; i++) {
      const px = cx + (rnd() - 0.5) * rx * 1.1, py = cy + (rnd() - 0.2) * ry * 0.85;
      ctx.fillStyle = rgba(lo, 0.16);
      ctx.beginPath();
      ctx.ellipse(px, py, rx * (0.3 + rnd() * 0.2), ry * (0.24 + rnd() * 0.16), rnd(), 0, TAU);
      ctx.fill();
    }
    // 上側の明かり
    for (let i = 0; i < 3; i++) {
      const px = cx - rx * 0.28 + (rnd() - 0.5) * rx * 0.6;
      const py = cy - ry * 0.44 + (rnd() - 0.5) * ry * 0.3;
      ctx.fillStyle = rgba(hi, 0.4);
      ctx.beginPath();
      ctx.ellipse(px, py, rx * 0.26, ry * 0.19, -0.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  // 布（旗・幕）
  function cloth(ctx, pathFn, box, rnd, pal) {
    const p = pal || {};
    paint(ctx, pathFn, {
      base: p.base || '#b23f2e', hi: p.hi || '#d9644a', lo: p.lo || '#75231a',
      box: box, lw: 2.6, outline: p.outline || '#4a150f',
      tex: function (c) {
        c.strokeStyle = rgba('#000000', 0.12);
        c.lineWidth = 5;
        for (let i = 0; i < 3; i++) {
          const xx = box[0] + box[2] * (0.25 + i * 0.25);
          c.beginPath();
          c.moveTo(xx, box[1]);
          c.quadraticCurveTo(xx + (rnd() - 0.5) * 8, box[1] + box[3] * 0.5, xx, box[1] + box[3]);
          c.stroke();
        }
      }
    });
  }

  // 水の流れ
  function water(ctx, x, y, w, h, rnd) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.quadraticCurveTo(x + w * 0.9, y + h * 0.6, x + w * 0.72, y + h);
    ctx.lineTo(x + w * 0.28, y + h);
    ctx.quadraticCurveTo(x + w * 0.1, y + h * 0.6, x, y);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, x, y, x, y + h, [
      [0, rgba('#f2fbff', 0.95)], [0.4, rgba('#cfeafb', 0.8)], [1, rgba('#b6dcf4', 0.25)]
    ]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.lineCap = 'round';
    for (let i = 0; i < Math.round(w / 7); i++) {
      const sx = x + rnd() * w;
      const sy = y + rnd() * h;
      ctx.strokeStyle = rgba('#ffffff', 0.35 + rnd() * 0.3);
      ctx.lineWidth = 1.6 + rnd() * 2.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rnd() - 0.5) * 6, sy + 18 + rnd() * 40);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  // 雲
  function cloud(ctx, cx, cy, s, rnd, alpha) {
    const a = alpha === undefined ? 0.95 : alpha;
    const path = function (c) {
      c.beginPath();
      const n = 5 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1) - 0.5;
        const px = cx + t * s * 2.0;
        const py = cy - Math.cos(t * Math.PI) * s * 0.34 + (rnd() - 0.5) * s * 0.12;
        const pr = s * (0.62 - Math.abs(t) * 0.26) * (0.9 + rnd() * 0.25);
        c.moveTo(px + pr, py);
        c.arc(px, py, Math.max(4, pr), 0, TAU);
      }
      c.moveTo(cx + s * 1.1, cy + s * 0.1);
      c.ellipse(cx, cy + s * 0.1, s * 1.1, s * 0.34, 0, 0, TAU);
      c.closePath();
    };
    ctx.save();
    ctx.globalAlpha = a;
    path(ctx);
    ctx.fillStyle = lin(ctx, cx, cy - s * 0.8, cx, cy + s * 0.5,
      [[0, '#ffffff'], [0.6, '#f4fbff'], [1, '#d3e7f5']]);
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = rgba('#b9d4e8', 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.42, s * 1.3, s * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  return {
    TAU: TAU, clamp: clamp, lerp: lerp, rng: rng, rgba: rgba, mix: mix, shade: shadeC,
    rr: rr, blob: blob, lumpPts: lumpPts, lin: lin, rad: rad, paint: paint,
    speckle: speckle, brush: brush, crack: crack, softShadow: softShadow, glow: glow,
    grassCap: grassCap, rockMass: rockMass, plank: plank, metal: metal,
    foliage: foliage, cloth: cloth, water: water, cloud: cloud
  };
})();

if (typeof module !== 'undefined') module.exports = A;

/* ===========================================================
   assets_b.js — 背景 / 小物 / UI / タイトル
   =========================================================== */
'use strict';
/* global A, ASSETS, def */

/* 横方向にタイルできるよう、端の要素は反対側にも描く */
function wrap(ctx, W, x, margin, fn) {
  fn(x);
  if (x < margin) fn(x + W);
  if (x > W - margin) fn(x - W);
}

function bgTree(ctx, x, groundY, s, rnd, pal) {
  const p = pal || {};
  ctx.save();
  ctx.fillStyle = p.trunk || '#5a452d';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.06, groundY);
  ctx.lineTo(x - s * 0.04, groundY - s * 0.46);
  ctx.lineTo(x + s * 0.04, groundY - s * 0.46);
  ctx.lineTo(x + s * 0.06, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  A.foliage(ctx, x, groundY - s * 0.72, s * 0.42, s * 0.36, rnd, p);
}

function bgIsland(ctx, cx, topY, rw, depth, rnd, pal) {
  const p = pal || {};
  const pts = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = i / n, a = t * Math.PI * 2;
    const px = cx + Math.cos(a) * rw * (0.92 + rnd() * 0.12);
    let py;
    if (Math.sin(a) < 0) py = topY + Math.sin(a) * rw * 0.18;
    else py = topY + Math.sin(a) * depth * (0.55 + rnd() * 0.6);
    pts.push([px, py]);
  }
  A.rockMass(ctx, pts, rnd, p.rock);
  A.grassCap(ctx, cx - rw * 0.96, cx + rw * 0.96, topY - rw * 0.04, rw * 0.2, rnd, p.grass);
}

/* ---------------- 背景レイヤー ---------------- */

def('bg_sky', 'backgrounds/sky', 1024, 1024, function (ctx, w, h) {
  const rnd = A.rng(1);
  ctx.fillStyle = A.lin(ctx, 0, 0, 0, h, [
    [0, '#2d78bd'], [0.26, '#4e9ad4'], [0.56, '#86c4e8'], [0.82, '#b9ddef'], [1, '#dceff7']
  ]);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = A.rad(ctx, w * 0.24, h * 0.08, 0, w * 0.24, h * 0.08, h * 0.8,
    [[0, A.rgba('#fff7dc', 0.42)], [0.45, A.rgba('#fff3cf', 0.12)], [1, A.rgba('#ffffff', 0)]]);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    A.cloud(ctx, rnd() * w, h * (0.08 + rnd() * 0.8), 34 + rnd() * 54, rnd, 0.3 + rnd() * 0.3);
  }
});

def('bg_far_mountains', 'backgrounds/far', 1536, 512, function (ctx, w, h) {
  const rnd = A.rng(2);
  function range(baseY, peak, c1, c2, snow) {
    ctx.beginPath();
    ctx.moveTo(-10, h + 10);
    let x = -10, y = baseY;
    ctx.lineTo(x, y);
    while (x < w + 10) {
      const stepX = 240 + rnd() * 260;          // ゆったりした山ひだ
      const px = x + stepX * 0.5;
      const py = baseY - peak * (0.55 + rnd() * 0.45);
      const nx = x + stepX;
      const ny = baseY - peak * (0.12 + rnd() * 0.2);
      // 稜線はゆるやかな曲線、山頂だけ少しとがらせる
      ctx.quadraticCurveTo(x + stepX * 0.24, y - peak * 0.12, px - stepX * 0.07, py + peak * 0.06);
      ctx.lineTo(px, py);
      ctx.quadraticCurveTo(px + stepX * 0.16, py + peak * 0.16, nx, ny);
      x = nx; y = ny;
    }
    ctx.lineTo(w + 10, h + 10);
    ctx.closePath();
    ctx.fillStyle = A.lin(ctx, 0, baseY - peak, 0, baseY + 30, [[0, c1], [1, c2]]);
    ctx.fill();
    if (snow) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = A.rgba('#ffffff', 0.45);
      for (let i = 0; i < 12; i++) {
        const sx = rnd() * w, sy = baseY - peak * (0.55 + rnd() * 0.4);
        ctx.beginPath();
        ctx.moveTo(sx - 34, sy + 32); ctx.lineTo(sx, sy - 6); ctx.lineTo(sx + 34, sy + 32);
        ctx.quadraticCurveTo(sx, sy + 16, sx - 34, sy + 32);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  range(h * 0.82, h * 0.62, '#b7d3e8', '#93b8d8', true);
  range(h * 0.9, h * 0.48, '#92b7d6', '#6f9bc1', true);
  range(h * 0.98, h * 0.34, '#6d9ac0', '#5181a8', false);
});

def('bg_floating_islands_far', 'backgrounds/far', 1536, 768, function (ctx, w, h) {
  const rnd = A.rng(3);
  const pal = {
    rock: { base: '#9cadbb', hi: '#c3d0da', lo: '#5d7084', outline: '#3f5265' },
    grass: { g1: '#a7d47f', g2: '#79b45c', g3: '#4e8a46' }
  };
  const spots = [[160, 170, 72], [430, 300, 56], [700, 140, 84], [980, 320, 62], [1270, 190, 76], [1430, 400, 48]];
  spots.forEach(function (s) {
    wrap(ctx, w, s[0], 120, function (x) {
      bgIsland(ctx, x, s[1], s[2], s[2] * 1.6, A.rng(s[0] + s[1]), pal);
      bgTree(ctx, x + (rnd() - 0.5) * s[2], s[1] - 2, s[2] * 0.7, A.rng(s[0] * 3),
        { base: '#7fae72', hi: '#a9cf92', lo: '#4f7d5c' });
    });
  });
  ctx.fillStyle = A.rgba('#b4d6ec', 0.3);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
});

def('bg_castle', 'backgrounds/far', 768, 512, function (ctx, w, h) {
  const rnd = A.rng(4);
  const pal = { wall: '#dbe6f1', wallL: '#f4f8fc', wallD: '#a8bcd0', roof: '#5f8db9', roofL: '#9bc2e0', win: '#3d5f85' };
  function tower(x, baseY, tw, th, roofH) {
    A.paint(ctx, function (c) { c.beginPath(); c.rect(x, baseY - th, tw, th); }, {
      base: pal.wall, hi: pal.wallL, lo: pal.wallD, box: [x, baseY - th, tw, th], lw: 2, outline: '#7c93aa'
    });
    ctx.fillStyle = pal.win;
    const rows = Math.max(1, Math.floor(th / 54));
    for (let r = 0; r < rows; r++) {
      for (let c2 = 0; c2 < Math.max(1, Math.floor(tw / 22)); c2++) {
        A.rr(ctx, x + 8 + c2 * 22, baseY - th + 22 + r * 54, 7, 14, 3.4);
        ctx.fill();
      }
    }
    A.paint(ctx, function (c) {
      c.beginPath();
      c.moveTo(x - tw * 0.2, baseY - th);
      c.lineTo(x + tw / 2, baseY - th - roofH);
      c.lineTo(x + tw * 1.2, baseY - th);
      c.closePath();
    }, { base: pal.roof, hi: pal.roofL, lo: '#3f6a94', box: [x - tw * 0.2, baseY - th - roofH, tw * 1.4, roofH], lw: 2.2, outline: '#2d4c69' });
  }
  const baseY = h * 0.78;
  // 城壁
  A.paint(ctx, function (c) { c.beginPath(); c.rect(120, baseY - 96, 540, 96); }, {
    base: pal.wall, hi: pal.wallL, lo: pal.wallD, box: [120, baseY - 96, 540, 96], lw: 2.2, outline: '#7c93aa'
  });
  for (let i = 0; i < 18; i++) {
    if (i % 2) continue;
    A.paint(ctx, function (c) { c.beginPath(); c.rect(124 + i * 30, baseY - 116, 22, 22); }, {
      base: pal.wall, hi: pal.wallL, lo: pal.wallD, box: [124 + i * 30, baseY - 116, 22, 22], lw: 2, outline: '#7c93aa'
    });
  }
  tower(130, baseY, 56, 170, 72);
  tower(600, baseY, 56, 170, 72);
  tower(250, baseY, 64, 232, 86);
  tower(470, baseY, 64, 232, 86);
  tower(348, baseY, 86, 320, 126);
  // 門
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(356, baseY); c.lineTo(356, baseY - 48);
    c.quadraticCurveTo(391, baseY - 86, 426, baseY - 48);
    c.lineTo(426, baseY);
    c.closePath();
  }, { base: '#5c7692', hi: '#89a3bd', lo: '#38506b', box: [356, baseY - 86, 70, 86], lw: 2.4, outline: '#2b3f55' });
  // 城の下の島
  bgIsland(ctx, 384, baseY + 4, 330, 300, rnd, {
    rock: { base: '#9fb0bd', hi: '#c8d3dc', lo: '#5c6f80', outline: '#3e5163' },
    grass: { g1: '#a9d681', g2: '#7bb65e', g3: '#508c48' }
  });
});

def('bg_waterfall', 'backgrounds/mid', 256, 768, function (ctx, w, h) {
  const rnd = A.rng(5);
  // 落ち口の岩
  A.rockMass(ctx, A.lumpPts(128, 40, 112, 34, 11, 0.3, rnd), rnd);
  A.grassCap(ctx, 24, 232, 18, 18, rnd);
  A.water(ctx, 86, 44, 84, 600, rnd);
  // 水けむり
  for (let i = 0; i < 5; i++) {
    const y = 600 + i * 30;
    ctx.fillStyle = A.rad(ctx, 128, y, 4, 128, y, 90 + i * 18,
      [[0, A.rgba('#ffffff', 0.3)], [1, A.rgba('#ffffff', 0)]]);
    ctx.beginPath(); ctx.ellipse(128, y, 90 + i * 18, 30, 0, 0, Math.PI * 2); ctx.fill();
  }
});

def('bg_clouds_mid', 'backgrounds/mid', 1536, 512, function (ctx, w, h) {
  const rnd = A.rng(6);
  const spots = [[120, 150, 60], [420, 90, 78], [760, 200, 66], [1080, 120, 84], [1380, 230, 58],
  [260, 330, 52], [900, 380, 70], [1250, 400, 48]];
  spots.forEach(function (s) {
    wrap(ctx, w, s[0], 200, function (x) {
      A.cloud(ctx, x, s[1], s[2], A.rng(s[0] + s[1]), 0.92);
    });
  });
});

def('bg_floating_islands_mid', 'backgrounds/mid', 1536, 768, function (ctx, w, h) {
  const rnd = A.rng(7);
  const pal = {
    rock: { base: '#8d8577', hi: '#b7ae9d', lo: '#4c463e', outline: '#322d28' },
    grass: { g1: '#9dd363', g2: '#6cb544', g3: '#44893a' }
  };
  const spots = [[180, 300, 128], [560, 190, 104], [900, 340, 136], [1250, 220, 112], [1480, 420, 92]];
  spots.forEach(function (s) {
    wrap(ctx, w, s[0], 180, function (x) {
      const r = A.rng(s[0] * 7 + s[1]);
      bgIsland(ctx, x, s[1], s[2], s[2] * 1.7, r, pal);
      bgTree(ctx, x - s[2] * 0.4, s[1] - 4, s[2] * 0.8, r, { base: '#6aa85a', hi: '#9ccd7c', lo: '#3f7a4c' });
      bgTree(ctx, x + s[2] * 0.35, s[1] - 2, s[2] * 0.62, r, { base: '#6aa85a', hi: '#9ccd7c', lo: '#3f7a4c' });
    });
  });
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = A.rgba('#a9cfea', 0.16);
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
});

def('bg_vines', 'backgrounds/near', 512, 512, function (ctx, w, h) {
  const rnd = A.rng(8);
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 56 + rnd() * 22;
    const len = 150 + rnd() * 320;
    wrap(ctx, w, x, 60, function (px) {
      ctx.save();
      ctx.strokeStyle = '#4b8f36';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      const sway = (rnd() - 0.5) * 46;
      ctx.beginPath();
      ctx.moveTo(px, -6);
      ctx.quadraticCurveTo(px + sway, len * 0.55, px + sway * 1.3, len);
      ctx.stroke();
      const leaves = Math.round(len / 26);
      for (let k = 1; k <= leaves; k++) {
        const t = k / (leaves + 1);
        const lx = px + sway * t * 1.2 + (k % 2 ? 9 : -9);
        const ly = len * t;
        A.paint(ctx, function (c) {
          c.beginPath();
          c.ellipse(lx, ly, 11, 6, k % 2 ? 0.6 : -0.6, 0, Math.PI * 2);
        }, { base: '#5fa844', hi: '#8fcd63', lo: '#356f33', box: [lx - 11, ly - 7, 22, 14], lw: 1.6, outline: '#2a5c2a' });
      }
      ctx.restore();
    });
  }
});

def('bg_forest_decoration', 'backgrounds/near', 1024, 384, function (ctx, w, h) {
  const rnd = A.rng(9);
  for (let i = 0; i < 11; i++) {
    const x = 40 + i * 92 + rnd() * 34;
    const s = 150 + rnd() * 110;
    wrap(ctx, w, x, 110, function (px) {
      bgTree(ctx, px, h - 6, s, A.rng(i * 31 + 5), { base: '#4f8f42', hi: '#79b85c', lo: '#2d6338' });
    });
  }
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    A.foliage(ctx, x, h - 10 - rnd() * 16, 36 + rnd() * 28, 22 + rnd() * 14, A.rng(i * 7 + 2),
      { base: '#4a8a3f', hi: '#74b256', lo: '#2b5f34' });
  }
});

def('bg_ruins_decoration', 'backgrounds/near', 768, 384, function (ctx, w, h) {
  const rnd = A.rng(10);
  const pal = { base: '#a89f8f', hi: '#d6cdbb', lo: '#5f584d', outline: '#38322b' };
  function column(x, baseY, cw, ch, broken) {
    A.paint(ctx, function (c) { A.rr(c, x, baseY - ch, cw, ch, 5); }, {
      base: pal.base, hi: pal.hi, lo: pal.lo, box: [x, baseY - ch, cw, ch], lw: 2.6, outline: pal.outline,
      tex: function (c) {
        c.strokeStyle = A.rgba('#4a443b', 0.22);
        c.lineWidth = 2;
        for (let i = 1; i < 5; i++) {
          c.beginPath(); c.moveTo(x + 4, baseY - ch * (i / 5)); c.lineTo(x + cw - 4, baseY - ch * (i / 5) - 3); c.stroke();
        }
        A.speckle(c, rnd, 12, [x, baseY - ch, cw, ch], [A.rgba('#ffffff', 0.1), A.rgba('#4e8c43', 0.14)], 4);
      }
    });
    if (!broken) {
      A.paint(ctx, function (c) { A.rr(c, x - 8, baseY - ch - 16, cw + 16, 18, 5); }, {
        base: pal.base, hi: pal.hi, lo: pal.lo, box: [x - 8, baseY - ch - 16, cw + 16, 18], lw: 2.4, outline: pal.outline
      });
    }
  }
  const baseY = h - 8;
  column(60, baseY, 52, 250, false);
  column(200, baseY, 46, 160, true);
  column(430, baseY, 52, 230, false);
  column(600, baseY, 44, 120, true);
  // 横たわる梁
  A.paint(ctx, function (c) { A.rr(c, 250, baseY - 46, 180, 30, 6); }, {
    base: pal.base, hi: pal.hi, lo: pal.lo, box: [250, baseY - 46, 180, 30], lw: 2.6, outline: pal.outline
  });
  A.brush(ctx, rnd, 22, [40, baseY - 60, 640, 56], A.rgba('#4e8c43', 0.4), 4, 12);
});

/* ---------------- 小物 ---------------- */

def('prop_wood_sign', 'sprites/props', 160, 160, function (ctx) {
  const rnd = A.rng(21);
  A.plank(ctx, 72, 60, 16, 96, rnd, { base: '#8a5c2b', hi: '#ad7d44', lo: '#55341a' });
  A.plank(ctx, 20, 26, 120, 56, rnd);
  A.metal(ctx, function (c) { A.rr(c, 30, 34, 10, 10, 3); }, [30, 34, 10, 10], rnd);
  A.metal(ctx, function (c) { A.rr(c, 120, 34, 10, 10, 3); }, [120, 34, 10, 10], rnd);
});

def('prop_lantern', 'sprites/props', 96, 160, function (ctx) {
  const rnd = A.rng(22);
  ctx.save();
  ctx.strokeStyle = '#4b3722'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(48, 6); ctx.lineTo(48, 34); ctx.stroke();
  ctx.restore();
  A.metal(ctx, function (c) {
    c.beginPath();
    c.moveTo(24, 46); c.lineTo(72, 46); c.lineTo(64, 58); c.lineTo(32, 58); c.closePath();
  }, [24, 46, 48, 12], rnd, { base: '#6d5637', hi: '#9a7a4c', lo: '#3f3020', outline: '#2a2015' });
  A.paint(ctx, function (c) { A.rr(c, 30, 58, 36, 54, 7); }, {
    base: '#ffd98f', hi: '#fff3ce', lo: '#e0a94c',
    box: [30, 58, 36, 54], lw: 3, outline: '#6a4a1f'
  });
  A.glow(ctx, 48, 86, 46, '#ffdf9d', 0.35);
  A.metal(ctx, function (c) { A.rr(c, 26, 108, 44, 12, 5); }, [26, 108, 44, 12], rnd,
    { base: '#6d5637', hi: '#9a7a4c', lo: '#3f3020', outline: '#2a2015' });
});

def('prop_flag', 'sprites/props', 128, 192, function (ctx) {
  const rnd = A.rng(23);
  A.plank(ctx, 22, 10, 14, 178, rnd, { base: '#8a5c2b', hi: '#ad7d44', lo: '#55341a' });
  A.cloth(ctx, function (c) {
    c.beginPath();
    c.moveTo(36, 22); c.lineTo(114, 30); c.lineTo(96, 58); c.lineTo(114, 92); c.lineTo(36, 84);
    c.closePath();
  }, [36, 22, 78, 70], rnd);
  ctx.fillStyle = A.rgba('#f7ead2', 0.92);
  ctx.beginPath();
  ctx.moveTo(74, 42);
  ctx.quadraticCurveTo(52, 46, 54, 64);
  ctx.quadraticCurveTo(64, 56, 74, 60);
  ctx.quadraticCurveTo(84, 56, 94, 64);
  ctx.quadraticCurveTo(96, 46, 74, 42);
  ctx.closePath();
  ctx.fill();
});

def('prop_chest', 'sprites/props', 160, 128, function (ctx) {
  const rnd = A.rng(24);
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(18, 56); c.quadraticCurveTo(80, 10, 142, 56); c.lineTo(142, 64); c.lineTo(18, 64);
    c.closePath();
  }, { base: '#a3703d', hi: '#c9995e', lo: '#6a431f', box: [18, 16, 124, 48], lw: 3, outline: '#412716' });
  A.paint(ctx, function (c) { A.rr(c, 18, 62, 124, 52, 6); }, {
    base: '#9a6a39', hi: '#c08f52', lo: '#5f3c1c', box: [18, 62, 124, 52], lw: 3, outline: '#412716',
    tex: function (c) {
      c.strokeStyle = A.rgba('#5f3c1c', 0.4); c.lineWidth = 2;
      c.beginPath(); c.moveTo(22, 88); c.lineTo(138, 88); c.stroke();
    }
  });
  A.metal(ctx, function (c) { A.rr(c, 46, 20, 16, 96, 5); }, [46, 20, 16, 96], rnd,
    { base: '#c9a94f', hi: '#f0dc9a', lo: '#8a6c22', outline: '#4e3a0f' });
  A.metal(ctx, function (c) { A.rr(c, 98, 20, 16, 96, 5); }, [98, 20, 16, 96], rnd,
    { base: '#c9a94f', hi: '#f0dc9a', lo: '#8a6c22', outline: '#4e3a0f' });
  A.metal(ctx, function (c) { A.rr(c, 68, 56, 24, 28, 5); }, [68, 56, 24, 28], rnd,
    { base: '#d8b957', hi: '#f6e5a8', lo: '#946f1f', outline: '#4e3a0f' });
});

def('prop_crystal', 'sprites/props', 96, 128, function (ctx) {
  A.glow(ctx, 48, 70, 46, '#9fe4ff', 0.3);
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(48, 10); c.lineTo(76, 56); c.lineTo(58, 116); c.lineTo(36, 116); c.lineTo(20, 56);
    c.closePath();
  }, {
    base: '#63c7ec', hi: '#d5f4ff', lo: '#2a7fae', box: [20, 10, 56, 106], lw: 3, outline: '#1d5d84',
    tex: function (c) {
      c.fillStyle = A.rgba('#ffffff', 0.4);
      c.beginPath(); c.moveTo(48, 12); c.lineTo(62, 56); c.lineTo(50, 112); c.lineTo(44, 56); c.closePath();
      c.fill();
    }
  });
});

def('prop_flower', 'sprites/props', 64, 64, function (ctx) {
  const rnd = A.rng(26);
  ctx.save();
  ctx.strokeStyle = '#4b8f36'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(32, 60); ctx.quadraticCurveTo(28, 44, 32, 30); ctx.stroke();
  ctx.fillStyle = '#5fa844';
  ctx.beginPath(); ctx.ellipse(22, 46, 8, 4.4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = 32 + Math.cos(a) * 11, py = 26 + Math.sin(a) * 11;
    A.paint(ctx, function (c) { c.beginPath(); c.ellipse(px, py, 9, 8, a, 0, Math.PI * 2); }, {
      base: '#f7f2e4', hi: '#ffffff', lo: '#cdbfa6', box: [px - 9, py - 9, 18, 18], lw: 1.8, outline: '#9d8d72'
    });
  }
  A.paint(ctx, function (c) { c.beginPath(); c.arc(32, 26, 7, 0, Math.PI * 2); }, {
    base: '#f3c75a', hi: '#ffe9a8', lo: '#b2842a', box: [25, 19, 14, 14], lw: 1.8, outline: '#7d5a16'
  });
  void rnd;
});

def('prop_bush', 'sprites/props', 160, 96, function (ctx) {
  const rnd = A.rng(27);
  A.softShadow(ctx, 80, 88, 56, 10, 0.22);
  A.foliage(ctx, 58, 56, 46, 32, rnd);
  A.foliage(ctx, 104, 60, 40, 28, rnd);
  A.foliage(ctx, 80, 44, 36, 26, rnd, { base: '#63ad48', hi: '#97d665', lo: '#357331' });
});

def('prop_rock', 'sprites/props', 96, 64, function (ctx) {
  const rnd = A.rng(28);
  A.softShadow(ctx, 48, 58, 34, 7, 0.22);
  A.rockMass(ctx, A.lumpPts(48, 36, 36, 20, 10, 0.35, rnd), rnd);
});

def('prop_vine', 'sprites/props', 96, 256, function (ctx) {
  const rnd = A.rng(29);
  ctx.save();
  ctx.strokeStyle = '#4b8f36'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(48, 4);
  ctx.bezierCurveTo(20, 80, 74, 150, 44, 248);
  ctx.stroke();
  ctx.restore();
  for (let k = 0; k < 9; k++) {
    const t = (k + 0.6) / 10;
    const lx = 48 + Math.sin(t * 5) * 22 + (k % 2 ? 14 : -14);
    const ly = 10 + t * 236;
    A.paint(ctx, function (c) { c.beginPath(); c.ellipse(lx, ly, 15, 8, k % 2 ? 0.6 : -0.6, 0, Math.PI * 2); }, {
      base: '#5fa844', hi: '#93d168', lo: '#356f33', box: [lx - 15, ly - 9, 30, 18], lw: 2, outline: '#2a5c2a'
    });
  }
  void rnd;
});

def('prop_checkpoint_flag', 'sprites/props', 128, 192, function (ctx) {
  const rnd = A.rng(30);
  A.metal(ctx, function (c) { A.rr(c, 26, 12, 12, 176, 6); }, [26, 12, 12, 176], rnd,
    { base: '#9aa3ac', hi: '#dde4ea', lo: '#5a636c', outline: '#303840' });
  A.cloth(ctx, function (c) {
    c.beginPath();
    c.moveTo(38, 24); c.lineTo(112, 36); c.lineTo(92, 62); c.lineTo(110, 92); c.lineTo(38, 80);
    c.closePath();
  }, [38, 24, 74, 68], rnd, { base: '#4f9ad6', hi: '#86c6ee', lo: '#2c6a9e', outline: '#1b4466' });
  ctx.fillStyle = A.rgba('#f4fbff', 0.95);
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 ? 5 : 13;
    ctx[k ? 'lineTo' : 'moveTo'](72 + Math.cos(a) * r, 56 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  A.metal(ctx, function (c) { c.beginPath(); c.ellipse(32, 184, 30, 10, 0, 0, Math.PI * 2); }, [2, 174, 60, 20], rnd,
    { base: '#8d96a0', hi: '#cfd7de', lo: '#4e565e', outline: '#303840' });
});

/* ---------------- UI ---------------- */

function heart(ctx, filled) {
  const path = function (c) {
    c.beginPath();
    c.moveTo(32, 54);
    c.bezierCurveTo(10, 38, 6, 24, 14, 16);
    c.bezierCurveTo(22, 8, 30, 13, 32, 19);
    c.bezierCurveTo(34, 13, 42, 8, 50, 16);
    c.bezierCurveTo(58, 24, 54, 38, 32, 54);
    c.closePath();
  };
  if (filled) {
    A.paint(ctx, path, {
      base: '#dc4c4a', hi: '#f78f84', lo: '#8d1f20', box: [6, 8, 52, 46], lw: 3, outline: '#5e1314',
      tex: function (c) {
        c.strokeStyle = A.rgba('#ffd2c9', 0.85); c.lineWidth = 3.4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(19, 22); c.quadraticCurveTo(17, 29, 21, 33); c.stroke();
      }
    });
  } else {
    A.paint(ctx, path, {
      base: '#4c5a68', hi: '#6c7c8a', lo: '#2a333d', box: [6, 8, 52, 46], lw: 3, outline: '#1d242b', rim: false
    });
  }
}

def('ui_heart_full', 'sprites/ui', 64, 64, function (ctx) { heart(ctx, true); });
def('ui_heart_empty', 'sprites/ui', 64, 64, function (ctx) { heart(ctx, false); });

def('ui_energy_bar', 'sprites/ui', 320, 48, function (ctx) {
  const rnd = A.rng(41);
  A.paint(ctx, function (c) { A.rr(c, 4, 4, 312, 40, 20); }, {
    base: '#1b3350', hi: '#2f5578', lo: '#0c1a2b',
    box: [4, 4, 312, 40], lw: 3, outline: '#86b6e0',
    tex: function (c) {
      c.fillStyle = A.rgba('#000000', 0.35);
      A.rr(c, 12, 12, 296, 24, 12);
      c.fill();
    }
  });
  // 留め具
  [16, 304].forEach(function (x) {
    A.metal(ctx, function (c) { c.beginPath(); c.arc(x, 24, 9, 0, Math.PI * 2); }, [x - 9, 15, 18, 18], rnd,
      { base: '#c9a94f', hi: '#f0dc9a', lo: '#8a6c22', outline: '#4e3a0f' });
  });
});

def('ui_energy_fill', 'sprites/ui', 300, 32, function (ctx) {
  A.paint(ctx, function (c) { A.rr(c, 2, 2, 296, 28, 14); }, {
    base: '#45b0e4', hi: '#b6ecff', lo: '#1d6ea5', box: [2, 2, 296, 28], lw: 2, outline: '#14557f',
    tex: function (c) {
      c.fillStyle = A.rgba('#ffffff', 0.4);
      A.rr(c, 10, 7, 280, 7, 4);
      c.fill();
    }
  });
});

def('ui_panel', 'sprites/ui', 512, 256, function (ctx) {
  const rnd = A.rng(42);
  A.paint(ctx, function (c) { A.rr(c, 8, 8, 496, 240, 26); }, {
    base: '#17304f', hi: '#2c527c', lo: '#0a1626', box: [8, 8, 496, 240], lw: 4, outline: '#8fc2ec',
    tex: function (c) {
      c.strokeStyle = A.rgba('#9fcdf2', 0.4);
      c.lineWidth = 2;
      A.rr(c, 22, 22, 468, 212, 18);
      c.stroke();
      A.speckle(c, rnd, 20, [8, 8, 496, 240], [A.rgba('#ffffff', 0.04)], 10);
    }
  });
  // 四隅の飾り
  [[30, 30], [482, 30], [30, 226], [482, 226]].forEach(function (p) {
    A.metal(ctx, function (c) { c.beginPath(); c.arc(p[0], p[1], 9, 0, Math.PI * 2); }, [p[0] - 9, p[1] - 9, 18, 18], rnd,
      { base: '#c9a94f', hi: '#f0dc9a', lo: '#8a6c22', outline: '#4e3a0f' });
  });
});

function button(ctx, pressed) {
  const dy = pressed ? 6 : 0;
  if (!pressed) {
    A.paint(ctx, function (c) { A.rr(c, 10, 22, 236, 66, 18); }, {
      base: '#6b4a22', hi: '#8a6330', lo: '#3f2a12', box: [10, 22, 236, 66], lw: 3, outline: '#2a1b0c', rim: false
    });
  }
  A.paint(ctx, function (c) { A.rr(c, 10, 12 + dy, 236, 62, 18); }, {
    base: pressed ? '#b08a3c' : '#d8b957', hi: pressed ? '#cda95a' : '#f6e5a8',
    lo: pressed ? '#73551c' : '#946f1f', box: [10, 12 + dy, 236, 62], lw: 3.4, outline: '#4e3a0f',
    tex: function (c) {
      c.fillStyle = A.rgba('#ffffff', pressed ? 0.12 : 0.3);
      A.rr(c, 24, 20 + dy, 208, 14, 7);
      c.fill();
    }
  });
}
def('ui_button_normal', 'sprites/ui', 256, 96, function (ctx) { button(ctx, false); });
def('ui_button_pressed', 'sprites/ui', 256, 96, function (ctx) { button(ctx, true); });

function iconPlate(ctx, pal) {
  A.paint(ctx, function (c) { A.rr(c, 4, 4, 56, 56, 16); }, {
    base: pal ? pal[0] : '#1d3a5c', hi: pal ? pal[1] : '#33608e', lo: pal ? pal[2] : '#0b1a2c',
    box: [4, 4, 56, 56], lw: 2.8, outline: '#8fc2ec'
  });
}

def('ui_pause', 'sprites/ui', 64, 64, function (ctx) {
  iconPlate(ctx);
  A.paint(ctx, function (c) { A.rr(c, 20, 18, 9, 28, 4); }, {
    base: '#dce9f5', hi: '#ffffff', lo: '#9ab2c6', box: [20, 18, 9, 28], lw: 2, outline: '#45617a'
  });
  A.paint(ctx, function (c) { A.rr(c, 35, 18, 9, 28, 4); }, {
    base: '#dce9f5', hi: '#ffffff', lo: '#9ab2c6', box: [35, 18, 9, 28], lw: 2, outline: '#45617a'
  });
});

def('ui_height_marker', 'sprites/ui', 64, 64, function (ctx) {
  iconPlate(ctx);
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(13, 46); c.lineTo(27, 20); c.lineTo(36, 34); c.lineTo(42, 26); c.lineTo(52, 46);
    c.closePath();
  }, {
    base: '#9fc3e0', hi: '#e2f1fb', lo: '#5d82a4', box: [13, 20, 39, 26], lw: 2.4, outline: '#2f5578',
    tex: function (c) {
      c.fillStyle = A.rgba('#ffffff', 0.85);
      c.beginPath(); c.moveTo(27, 20); c.lineTo(33, 31); c.lineTo(21, 31); c.closePath(); c.fill();
    }
  });
});

def('ui_checkpoint', 'sprites/ui', 64, 64, function (ctx) {
  iconPlate(ctx);
  const rnd = A.rng(43);
  A.metal(ctx, function (c) { A.rr(c, 20, 14, 5, 36, 2.5); }, [20, 14, 5, 36], rnd,
    { base: '#9aa3ac', hi: '#dde4ea', lo: '#5a636c', outline: '#303840' });
  A.cloth(ctx, function (c) {
    c.beginPath();
    c.moveTo(25, 16); c.lineTo(48, 21); c.lineTo(42, 29); c.lineTo(48, 38); c.lineTo(25, 33);
    c.closePath();
  }, [25, 16, 23, 22], rnd, { base: '#4f9ad6', hi: '#86c6ee', lo: '#2c6a9e', outline: '#1b4466' });
});

def('ui_coin', 'sprites/ui', 64, 64, function (ctx) {
  A.glow(ctx, 32, 32, 28, '#ffe9a8', 0.25);
  A.paint(ctx, function (c) { c.beginPath(); c.ellipse(32, 32, 23, 24, 0, 0, Math.PI * 2); }, {
    base: '#e8bf4e', hi: '#fff0b4', lo: '#9a6f17', box: [9, 8, 46, 48], lw: 3, outline: '#5e4310'
  });
  A.paint(ctx, function (c) { c.beginPath(); c.ellipse(32, 32, 14, 15, 0, 0, Math.PI * 2); }, {
    base: '#f2d274', hi: '#fff6d2', lo: '#b98a24', box: [18, 17, 28, 30], lw: 2, outline: '#7d5a16', rim: false
  });
});

def('ui_crystal', 'sprites/ui', 64, 64, function (ctx) {
  A.glow(ctx, 32, 32, 26, '#9fe4ff', 0.28);
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(32, 8); c.lineTo(50, 30); c.lineTo(38, 56); c.lineTo(26, 56); c.lineTo(14, 30);
    c.closePath();
  }, {
    base: '#63c7ec', hi: '#d5f4ff', lo: '#2a7fae', box: [14, 8, 36, 48], lw: 2.8, outline: '#1d5d84',
    tex: function (c) {
      c.fillStyle = A.rgba('#ffffff', 0.4);
      c.beginPath(); c.moveTo(32, 10); c.lineTo(42, 30); c.lineTo(33, 54); c.lineTo(29, 30); c.closePath(); c.fill();
    }
  });
});

def('ui_settings', 'sprites/ui', 64, 64, function (ctx) {
  iconPlate(ctx);
  const path = function (c) {
    c.beginPath();
    const teeth = 8;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 ? 13 : 20;
      c[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    c.closePath();
  };
  A.paint(ctx, path, {
    base: '#c3d3e2', hi: '#f0f7fc', lo: '#7c93a8', box: [12, 12, 40, 40], lw: 2.6, outline: '#41586d'
  });
  A.paint(ctx, function (c) { c.beginPath(); c.arc(32, 32, 7, 0, Math.PI * 2); }, {
    base: '#2a4663', hi: '#4b7fa4', lo: '#16293c',
    box: [25, 25, 14, 14], lw: 2, outline: '#10202f', rim: false
  });
});

/* ---------------- タイトル素材 ---------------- */

def('logo_slime_adventure', 'sprites/title', 768, 256, function (ctx) {
  const rnd = A.rng(51);
  // 文字は入れず、題字を載せるための飾り枠として作る
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(60, 40);
    c.quadraticCurveTo(384, 8, 708, 40);
    c.quadraticCurveTo(724, 128, 708, 214);
    c.quadraticCurveTo(384, 246, 60, 214);
    c.quadraticCurveTo(44, 128, 60, 40);
    c.closePath();
  }, {
    base: '#1b3a5e', hi: '#2f6090', lo: '#0a1a2c', box: [44, 8, 680, 238], lw: 5, outline: '#9ccbf0',
    tex: function (c) {
      c.strokeStyle = A.rgba('#9ccbf0', 0.45);
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(78, 56);
      c.quadraticCurveTo(384, 28, 690, 56);
      c.quadraticCurveTo(704, 128, 690, 198);
      c.quadraticCurveTo(384, 226, 78, 198);
      c.quadraticCurveTo(64, 128, 78, 56);
      c.closePath();
      c.stroke();
    }
  });
  // 左右の飾り
  [[96, 128], [672, 128]].forEach(function (p, i) {
    A.metal(ctx, function (c) {
      c.beginPath();
      c.moveTo(p[0], p[1] - 34); c.lineTo(p[0] + (i ? -22 : 22), p[1]); c.lineTo(p[0], p[1] + 34);
      c.lineTo(p[0] + (i ? 22 : -22), p[1]);
      c.closePath();
    }, [p[0] - 24, p[1] - 36, 48, 72], rnd, { base: '#c9a94f', hi: '#f0dc9a', lo: '#8a6c22', outline: '#4e3a0f' });
  });
  A.glow(ctx, 384, 128, 240, '#8fd0f5', 0.12);
});

def('title_slime_pose', 'sprites/title', 384, 384, function (ctx) {
  const rnd = A.rng(52);
  A.softShadow(ctx, 192, 344, 120, 22, 0.28);
  // 足場に乗ったポーズ
  A.rockMass(ctx, A.lumpPts(192, 332, 120, 36, 11, 0.25, rnd), rnd);
  A.grassCap(ctx, 86, 298, 304, 22, rnd);
  ctx.save();
  ctx.translate(192, 300);
  ctx.scale(1.55, 1.55);
  ctx.translate(-96, -168);
  slimePaint(ctx, 96, 168, 112, 100, 1.02, 'open', { shadow: false });
  ctx.restore();
  A.glow(ctx, 192, 220, 150, '#bfe9ff', 0.16);
});

def('title_decoration', 'sprites/title', 512, 256, function (ctx) {
  const rnd = A.rng(53);
  for (let i = 0; i < 7; i++) {
    const x = 30 + rnd() * 452, y = 24 + rnd() * 200, r = 7 + rnd() * 13;
    ctx.fillStyle = A.rgba('#fff3c8', 0.9);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      const rr2 = k % 2 ? r * 0.36 : r;
      ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = A.rgba('#d8ab42', 0.6);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  [[70, 200], [250, 220], [430, 196]].forEach(function (p, i) {
    A.foliage(ctx, p[0], p[1], 40 - i * 4, 24, rnd);
  });
  [[140, 208], [330, 214], [470, 206]].forEach(function (p) {
    ctx.save();
    ctx.translate(p[0] - 32, p[1] - 32);
    ctx.scale(0.9, 0.9);
    const f = ASSETS.find(function (a) { return a.name === 'prop_flower'; });
    if (f) f.draw(ctx, 64, 64);
    ctx.restore();
  });
});

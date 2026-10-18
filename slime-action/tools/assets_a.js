/* ===========================================================
   assets_a.js — スライム / エフェクト / 足場
   =========================================================== */
'use strict';
/* global A, ASSETS, def */

/* ---------------- 主人公スライム ---------------- */
/* すべて 192x192、接地線 y=168、中心 x=96 で基準位置をそろえる */

const SL = { base: '#6ecbf0', hi: '#e8faff', lo: '#2585c0', out: '#1a648f', ink: '#153b52' };

function slimeShape(ctx, cx, by, w, h, squish) {
  // squish: 1 でまる、>1 で横つぶれ
  const rw = (w / 2) * squish, rh = (h / 2) / squish;
  const cy = by - rh;
  ctx.beginPath();
  ctx.moveTo(cx - rw, cy + rh * 0.72);
  ctx.bezierCurveTo(cx - rw * 1.04, cy - rh * 0.3, cx - rw * 0.62, cy - rh * 1.12, cx, cy - rh * 1.12);
  ctx.bezierCurveTo(cx + rw * 0.62, cy - rh * 1.12, cx + rw * 1.04, cy - rh * 0.3, cx + rw, cy + rh * 0.72);
  ctx.bezierCurveTo(cx + rw * 0.76, cy + rh * 1.08, cx - rw * 0.76, cy + rh * 1.08, cx - rw, cy + rh * 0.72);
  ctx.closePath();
  return { cx: cx, cy: cy, rw: rw, rh: rh };
}

function slimeFace(ctx, g, kind, dx) {
  const rw = g.rw, rh = g.rh, cx = g.cx + (dx || 0), cy = g.cy;
  ctx.save();
  ctx.fillStyle = SL.ink;
  ctx.strokeStyle = SL.ink;
  ctx.lineCap = 'round';
  const ex = rw * 0.3, ey = cy + rh * 0.02;

  if (kind === 'blink') {
    ctx.lineWidth = rw * 0.07;
    [-1, 1].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(cx + d * ex, ey + rh * 0.04, rw * 0.11, Math.PI * 1.08, Math.PI * 1.92, true);
      ctx.stroke();
    });
  } else if (kind === 'damage') {
    ctx.lineWidth = rw * 0.075;
    [-1, 1].forEach(function (d) {
      const x = cx + d * ex;
      ctx.beginPath();
      ctx.moveTo(x - rw * 0.1, ey - rh * 0.1); ctx.lineTo(x + rw * 0.1, ey + rh * 0.1);
      ctx.moveTo(x + rw * 0.1, ey - rh * 0.1); ctx.lineTo(x - rw * 0.1, ey + rh * 0.1);
      ctx.stroke();
    });
  } else if (kind === 'squint') {
    ctx.lineWidth = rw * 0.08;
    [-1, 1].forEach(function (d) {
      ctx.beginPath();
      ctx.moveTo(cx + d * ex - rw * 0.1, ey - rh * 0.02);
      ctx.quadraticCurveTo(cx + d * ex, ey - rh * 0.14, cx + d * ex + rw * 0.1, ey - rh * 0.02);
      ctx.stroke();
    });
  } else {
    const big = (kind === 'surprise' || kind === 'worry') ? 1.18 : 1;
    [-1, 1].forEach(function (d) {
      ctx.beginPath();
      ctx.ellipse(cx + d * ex, ey, rw * 0.095 * big, rh * 0.16 * big, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#ffffff';
    [-1, 1].forEach(function (d) {
      ctx.beginPath();
      ctx.ellipse(cx + d * ex - rw * 0.03, ey - rh * 0.055, rw * 0.033, rh * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // まゆ（内側を上げると困り顔、下げると怒り顔）
  if (kind === 'worry' || kind === 'damage') {
    const inner = kind === 'worry' ? -0.34 : -0.2;
    const outer = kind === 'worry' ? -0.2 : -0.34;
    ctx.strokeStyle = SL.ink;
    ctx.lineWidth = rw * 0.06;
    [-1, 1].forEach(function (d) {
      ctx.beginPath();
      ctx.moveTo(cx + d * (ex - rw * 0.12), ey + rh * inner);
      ctx.lineTo(cx + d * (ex + rw * 0.12), ey + rh * outer);
      ctx.stroke();
    });
  }

  // 口
  ctx.strokeStyle = SL.ink;
  ctx.lineWidth = rw * 0.055;
  ctx.beginPath();
  if (kind === 'open' || kind === 'surprise') {
    ctx.fillStyle = SL.ink;
    ctx.ellipse(cx, ey + rh * 0.3, rw * 0.11, rh * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'worry' || kind === 'damage') {
    ctx.moveTo(cx - rw * 0.11, ey + rh * 0.36);
    ctx.quadraticCurveTo(cx, ey + rh * 0.24, cx + rw * 0.11, ey + rh * 0.36);
    ctx.stroke();
  } else {
    ctx.arc(cx, ey + rh * 0.2, rw * 0.13, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  }

  // ほお
  ctx.fillStyle = A.rgba('#ef8aa6', 0.45);
  [-1, 1].forEach(function (d) {
    ctx.beginPath();
    ctx.ellipse(cx + d * rw * 0.56, ey + rh * 0.24, rw * 0.13, rh * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function slimePaint(ctx, cx, by, w, h, squish, face, opts) {
  const o = opts || {};
  const g = slimeShape(ctx, cx, by, w, h, squish);
  const path = function (c) { slimeShape(c, cx, by, w, h, squish); };

  if (o.shadow !== false) A.softShadow(ctx, cx, by + 4, g.rw * 0.92, g.rh * 0.26, 0.26);

  A.paint(ctx, path, {
    base: o.pale ? '#9fd8ea' : SL.base, hi: SL.hi, lo: o.pale ? '#4f8fae' : SL.lo,
    box: [g.cx - g.rw, g.cy - g.rh * 1.15, g.rw * 2, g.rh * 2.3],
    lw: 3.2, outline: SL.out,
    tex: function (c) {
      // 内側の水っぽい明かり
      c.fillStyle = A.rad(c, g.cx - g.rw * 0.2, g.cy + g.rh * 0.45, g.rw * 0.1,
        g.cx, g.cy + g.rh * 0.4, g.rw * 1.1,
        [[0, A.rgba('#bdeeff', 0.5)], [1, A.rgba('#bdeeff', 0)]]);
      c.fillRect(g.cx - g.rw * 1.2, g.cy - g.rh, g.rw * 2.4, g.rh * 2.2);
    }
  });

  // ハイライト
  ctx.save();
  ctx.fillStyle = A.rgba('#ffffff', 0.92);
  ctx.beginPath();
  ctx.ellipse(g.cx - g.rw * 0.38, g.cy - g.rh * 0.46, g.rw * 0.24, g.rh * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.ellipse(g.cx - g.rw * 0.07, g.cy - g.rh * 0.66, g.rw * 0.085, g.rh * 0.06, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  slimeFace(ctx, g, face, o.faceDx || 0);
  return g;
}

function slimeTail(ctx, fromX, fromY, toX, toY, w0, w1) {
  const dx = toX - fromX, dy = toY - fromY, len = Math.hypot(dx, dy);
  if (len < 2) return;
  const nx = -dy / len, ny = dx / len;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(fromX + nx * w0, fromY + ny * w0);
  ctx.quadraticCurveTo(fromX + dx * 0.55 + nx * w0 * 0.55, fromY + dy * 0.55 + ny * w0 * 0.55, toX + nx * w1, toY + ny * w1);
  ctx.quadraticCurveTo(toX + dx * 0.1, toY + dy * 0.1, toX - nx * w1, toY - ny * w1);
  ctx.quadraticCurveTo(fromX + dx * 0.55 - nx * w0 * 0.55, fromY + dy * 0.55 - ny * w0 * 0.55, fromX - nx * w0, fromY - ny * w0);
  ctx.closePath();
  ctx.fillStyle = A.lin(ctx, fromX, fromY, toX, toY,
    [[0, SL.base], [0.6, '#8fdaf3'], [1, A.rgba('#cdf1ff', 0.75)]]);
  ctx.fill();
  ctx.strokeStyle = A.rgba(SL.out, 0.75);
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
}

def('slime_idle', 'sprites/slime', 192, 192, function (ctx) {
  slimePaint(ctx, 96, 168, 112, 100, 1.02, 'normal');
});

def('slime_drag', 'sprites/slime', 192, 192, function (ctx) {
  slimeTail(ctx, 74, 122, 186, 156, 33, 6);
  slimePaint(ctx, 74, 168, 106, 94, 1.16, 'squint');
});

def('slime_launch', 'sprites/slime', 192, 192, function (ctx) {
  ctx.save();
  ctx.translate(96, 100);
  ctx.rotate(-0.42);
  ctx.translate(-96, -100);
  slimeTail(ctx, 96, 100, 24, 140, 26, 6);
  slimePaint(ctx, 96, 150, 104, 116, 0.84, 'open', { shadow: false });
  ctx.restore();
});

def('slime_fly', 'sprites/slime', 192, 192, function (ctx) {
  const rnd = A.rng(11);
  ctx.save();
  ctx.translate(96, 96);
  ctx.rotate(-0.3);
  ctx.translate(-96, -96);
  slimePaint(ctx, 96, 150, 92, 128, 0.8, 'surprise', { shadow: false });
  ctx.restore();
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = A.rgba('#cdeeff', 0.5 - i * 0.12);
    ctx.lineWidth = 5 - i;
    ctx.beginPath();
    ctx.moveTo(44 + i * 10 + rnd() * 6, 150 + i * 8);
    ctx.lineTo(70 + i * 14, 124 + i * 6);
    ctx.stroke();
  }
  ctx.restore();
});

def('slime_fall', 'sprites/slime', 192, 192, function (ctx) {
  slimePaint(ctx, 96, 172, 94, 122, 0.86, 'worry', { shadow: false });
});

def('slime_land', 'sprites/slime', 192, 192, function (ctx) {
  slimePaint(ctx, 96, 168, 126, 76, 1.3, 'squint');
});

def('slime_blink', 'sprites/slime', 192, 192, function (ctx) {
  slimePaint(ctx, 96, 168, 112, 100, 1.02, 'blink');
});

def('slime_damage', 'sprites/slime', 192, 192, function (ctx) {
  slimePaint(ctx, 96, 168, 114, 94, 1.08, 'damage', { pale: true });
  // 目まいの小さな星
  const rnd = A.rng(5);
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const x = 60 + i * 34 + rnd() * 6, y = 52 + (i % 2) * 14;
    ctx.fillStyle = A.rgba('#ffe9a0', 0.9);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const r = k % 2 ? 3.5 : 9;
      ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
});

def('slime_icon', 'sprites/slime', 96, 96, function (ctx) {
  slimePaint(ctx, 48, 84, 76, 70, 1.0, 'normal', { shadow: false });
});

/* ---------------- 移動エフェクト ---------------- */

def('fx_drag_line', 'sprites/effects', 256, 32, function (ctx) {
  ctx.save();
  const g = A.lin(ctx, 0, 0, 256, 0,
    [[0, A.rgba('#ffffff', 0.12)], [0.55, A.rgba('#ffffff', 0.72)], [1, A.rgba('#ffffff', 0.95)]]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(4, 20); ctx.quadraticCurveTo(128, 8, 252, 12);
  ctx.quadraticCurveTo(128, 24, 4, 24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
});

def('fx_trajectory_dot', 'sprites/effects', 32, 32, function (ctx) {
  ctx.fillStyle = A.rad(ctx, 16, 14, 1, 16, 16, 14,
    [[0, A.rgba('#ffffff', 0.98)], [0.55, A.rgba('#eaf8ff', 0.8)], [1, A.rgba('#cdeaff', 0)]]);
  ctx.beginPath(); ctx.arc(16, 16, 14, 0, Math.PI * 2); ctx.fill();
});

def('fx_launch_streak', 'sprites/effects', 256, 96, function (ctx) {
  const rnd = A.rng(21);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const y = 20 + i * 11 + rnd() * 5;
    const len = 120 + rnd() * 110;
    ctx.strokeStyle = A.rgba('#e8f7ff', 0.42 + rnd() * 0.4);
    ctx.lineWidth = 4 + rnd() * 5;
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.quadraticCurveTo(len * 0.5, y - 5, len, y - 2);
    ctx.stroke();
  }
  ctx.restore();
});

def('fx_land_dust', 'sprites/effects', 256, 96, function (ctx) {
  const rnd = A.rng(33);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 28 + t * 200 + (rnd() - 0.5) * 14;
    const y = 74 - Math.sin(t * Math.PI) * 34 - rnd() * 10;
    const r = 12 + rnd() * 20;
    ctx.fillStyle = A.rad(ctx, x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r,
      [[0, A.rgba('#f0e6d4', 0.75)], [0.6, A.rgba('#d9cbb2', 0.42)], [1, A.rgba('#c8b89c', 0)]]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
});

def('fx_land_star', 'sprites/effects', 64, 64, function (ctx) {
  A.glow(ctx, 32, 32, 26, '#fff0b8', 0.5);
  ctx.save();
  ctx.fillStyle = '#fff6cf';
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 ? 7 : 24;
    ctx[k ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = A.rgba('#e0b64e', 0.75);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
});

def('fx_splash', 'sprites/effects', 256, 96, function (ctx) {
  const rnd = A.rng(44);
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 36 + t * 184;
    const y = 76 - Math.sin(t * Math.PI) * 44;
    const r = 7 + rnd() * 11;
    ctx.fillStyle = A.lin(ctx, x, y - r, x, y + r,
      [[0, A.rgba('#ffffff', 0.9)], [1, A.rgba('#9ad9f4', 0.55)]]);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.72, r, (t - 0.5) * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = A.rgba('#4aa6d8', 0.4);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.fillStyle = A.rgba('#bfe8fa', 0.5);
  ctx.beginPath();
  ctx.ellipse(128, 82, 92, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
});

def('fx_checkpoint', 'sprites/effects', 192, 192, function (ctx) {
  A.glow(ctx, 96, 96, 92, '#ffe9a8', 0.42);
  ctx.save();
  ctx.strokeStyle = A.rgba('#ffe9a8', 0.75);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(96, 128, 62, 20, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(96, 112, 44, 14, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  const rnd = A.rng(9);
  for (let i = 0; i < 7; i++) {
    const x = 96 + (rnd() - 0.5) * 110, y = 136 - rnd() * 86;
    ctx.fillStyle = A.rgba('#fff3c8', 0.6 + rnd() * 0.3);
    ctx.beginPath(); ctx.arc(x, y, 2 + rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
});

def('fx_fall', 'sprites/effects', 128, 128, function (ctx) {
  const rnd = A.rng(66);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const x = 30 + i * 16 + rnd() * 6;
    ctx.strokeStyle = A.rgba('#e2f4ff', 0.45 + rnd() * 0.4);
    ctx.lineWidth = 4 + rnd() * 4;
    ctx.beginPath();
    ctx.moveTo(x, 18 + rnd() * 18);
    ctx.lineTo(x + (rnd() - 0.5) * 8, 80 + rnd() * 26);
    ctx.stroke();
  }
  ctx.restore();
});

/* ---------------- 足場 ---------------- */

function rockPlatform(ctx, w, h, seed, opts) {
  const o = opts || {};
  const rnd = A.rng(seed);
  const topY = o.topY === undefined ? h * 0.26 : o.topY;
  const pts = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const a = t * Math.PI * 2;
    // 上面は平ら、下面はとがる
    const px = w / 2 + Math.cos(a) * (w / 2 - 8) * (0.94 + rnd() * 0.1);
    let py;
    if (Math.sin(a) < 0) py = topY + Math.sin(a) * 10;
    else py = topY + Math.sin(a) * (h - topY - 6) * (0.8 + rnd() * 0.35);
    pts.push([px, py]);
  }
  A.rockMass(ctx, pts, rnd, o.pal);
  return { topY: topY, rnd: rnd };
}

function hangingVines(ctx, x0, x1, y, rnd, count) {
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const len = 18 + rnd() * 46;
    const sway = (rnd() - 0.5) * 16;
    ctx.save();
    ctx.strokeStyle = '#4e9638';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway, y + len * 0.6, x + sway * 1.3, y + len);
    ctx.stroke();
    ctx.fillStyle = '#62ad46';
    const leaves = Math.max(2, Math.round(len / 16));
    for (let k = 1; k <= leaves; k++) {
      const t = k / (leaves + 1);
      ctx.beginPath();
      ctx.ellipse(x + sway * t * 1.2 + (k % 2 ? 5 : -5), y + len * t, 5.5, 3.2, k % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

def('platform_grass_small', 'sprites/platforms', 192, 128, function (ctx) {
  const r = rockPlatform(ctx, 192, 128, 101, { topY: 34 });
  A.grassCap(ctx, 10, 182, 32, 22, r.rnd);
  hangingVines(ctx, 24, 168, 54, r.rnd, 3);
});

def('platform_grass_medium', 'sprites/platforms', 320, 148, function (ctx) {
  const r = rockPlatform(ctx, 320, 148, 202, { topY: 38 });
  A.grassCap(ctx, 12, 308, 36, 24, r.rnd);
  hangingVines(ctx, 30, 290, 60, r.rnd, 5);
});

def('platform_grass_wide', 'sprites/platforms', 480, 164, function (ctx) {
  const r = rockPlatform(ctx, 480, 164, 303, { topY: 40 });
  A.grassCap(ctx, 14, 466, 38, 26, r.rnd);
  hangingVines(ctx, 40, 440, 64, r.rnd, 7);
  A.foliage(ctx, 392, 36, 34, 22, r.rnd);
});

def('platform_stone', 'sprites/platforms', 320, 140, function (ctx) {
  const rnd = A.rng(404);
  // 切り出した石段
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(16, 30); c.lineTo(304, 26); c.lineTo(292, 104);
    c.lineTo(250, 122); c.lineTo(70, 118); c.lineTo(24, 98);
    c.closePath();
  }, {
    base: '#9c9689', hi: '#cdc7b8', lo: '#5a554c', box: [16, 26, 288, 96], lw: 3, outline: '#36322c',
    tex: function (c) {
      c.strokeStyle = A.rgba('#48433b', 0.3);
      c.lineWidth = 2.4;
      [[70, 30, 64, 118], [160, 28, 168, 120], [238, 27, 246, 121]].forEach(function (s) {
        c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); c.stroke();
      });
      c.beginPath(); c.moveTo(20, 70); c.lineTo(300, 66); c.stroke();
      A.speckle(c, rnd, 26, [16, 26, 288, 96], [A.rgba('#ffffff', 0.1), A.rgba('#2f2b25', 0.12)], 4);
      A.brush(c, rnd, 10, [16, 90, 288, 30], A.rgba('#5f8f4a', 0.26), 4, 10);
    }
  });
  // 上端のふちどり
  A.paint(ctx, function (c) { A.rr(c, 10, 18, 300, 18, 8); }, {
    base: '#b2ab9c', hi: '#e0dacb', lo: '#6b6459', box: [10, 18, 300, 18], lw: 2.6, outline: '#36322c'
  });
  hangingVines(ctx, 40, 280, 112, rnd, 4);
});

def('platform_wood', 'sprites/platforms', 288, 104, function (ctx) {
  const rnd = A.rng(505);
  A.plank(ctx, 10, 20, 268, 26, rnd);
  A.plank(ctx, 18, 44, 252, 22, rnd, { base: '#96652f', hi: '#bb8a4e', lo: '#5e3b1b' });
  // 支え
  A.plank(ctx, 44, 62, 20, 34, rnd, { base: '#8a5c2b', hi: '#ad7d44', lo: '#55341a' });
  A.plank(ctx, 224, 62, 20, 34, rnd, { base: '#8a5c2b', hi: '#ad7d44', lo: '#55341a' });
  // 金具
  A.metal(ctx, function (c) { A.rr(c, 100, 18, 14, 50, 4); }, [100, 18, 14, 50], rnd);
  A.metal(ctx, function (c) { A.rr(c, 176, 18, 14, 50, 4); }, [176, 18, 14, 50], rnd);
});

def('platform_floating_rock', 'sprites/platforms', 256, 208, function (ctx) {
  const rnd = A.rng(606);
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 14, a = t * Math.PI * 2;
    const px = 128 + Math.cos(a) * 112 * (0.92 + rnd() * 0.12);
    let py;
    if (Math.sin(a) < 0) py = 44 + Math.sin(a) * 12;
    else py = 44 + Math.sin(a) * 150 * (0.55 + rnd() * 0.6);
    pts.push([px, py]);
  }
  A.rockMass(ctx, pts, rnd);
  A.grassCap(ctx, 20, 236, 42, 24, rnd);
  hangingVines(ctx, 40, 216, 66, rnd, 5);
  // 下に浮かぶ小岩
  A.rockMass(ctx, A.lumpPts(74, 186, 16, 11, 9, 0.4, rnd), rnd);
  A.rockMass(ctx, A.lumpPts(186, 196, 12, 9, 9, 0.4, rnd), rnd);
});

def('platform_broken_ruin', 'sprites/platforms', 320, 156, function (ctx) {
  const rnd = A.rng(707);
  // 割れた石畳
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(14, 36); c.lineTo(150, 30); c.lineTo(160, 96); c.lineTo(120, 112);
    c.lineTo(38, 104); c.lineTo(18, 80);
    c.closePath();
  }, { base: '#a39b8c', hi: '#d3cbbb', lo: '#5d564c', box: [14, 30, 146, 82], lw: 3, outline: '#37322b' });
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(176, 32); c.lineTo(306, 38); c.lineTo(296, 100); c.lineTo(230, 116);
    c.lineTo(184, 92);
    c.closePath();
  }, { base: '#9b9385', hi: '#cac2b2', lo: '#565046', box: [176, 32, 130, 84], lw: 3, outline: '#37322b' });
  // 折れた柱
  A.paint(ctx, function (c) { A.rr(c, 198, 4, 30, 40, 5); }, {
    base: '#b0a899', hi: '#ddd5c4', lo: '#6a6359', box: [198, 4, 30, 40], lw: 2.6, outline: '#37322b'
  });
  A.crack(ctx, rnd, 5, [20, 40, 280, 60], A.rgba('#2f2a24', 0.35), 2);
  A.brush(ctx, rnd, 16, [20, 30, 286, 20], A.rgba('#5d9548', 0.4), 4, 11);
  hangingVines(ctx, 40, 280, 104, rnd, 4);
});

def('platform_mushroom', 'sprites/platforms', 224, 168, function (ctx) {
  const rnd = A.rng(808);
  // 柄
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(94, 72); c.quadraticCurveTo(88, 120, 80, 158);
    c.lineTo(144, 158); c.quadraticCurveTo(136, 118, 130, 72);
    c.closePath();
  }, { base: '#f0e3cb', hi: '#fffaf0', lo: '#b7aa8c', box: [80, 72, 64, 86], lw: 2.8, outline: '#6d5e46' });
  // かさ
  A.paint(ctx, function (c) {
    c.beginPath();
    c.moveTo(18, 84);
    c.bezierCurveTo(26, 18, 198, 18, 206, 84);
    c.quadraticCurveTo(112, 104, 18, 84);
    c.closePath();
  }, {
    base: '#d9564a', hi: '#f0897a', lo: '#8f2b26', box: [18, 20, 188, 84], lw: 3, outline: '#59170f',
    tex: function (c) {
      [[64, 54, 15], [112, 42, 18], [160, 56, 13], [88, 72, 10], [140, 74, 9]].forEach(function (s) {
        c.fillStyle = A.rgba('#fdf3e2', 0.92);
        c.beginPath(); c.ellipse(s[0], s[1], s[2], s[2] * 0.78, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = A.rgba('#b9ac94', 0.5); c.lineWidth = 1.4; c.stroke();
      });
    }
  });
  A.brush(ctx, rnd, 8, [60, 140, 110, 18], A.rgba('#4e9638', 0.5), 4, 12);
});

def('platform_moving', 'sprites/platforms', 256, 120, function (ctx) {
  const rnd = A.rng(909);
  A.plank(ctx, 18, 30, 220, 28, rnd, { base: '#9a6a35', hi: '#c08f52', lo: '#5f3c1c' });
  A.metal(ctx, function (c) { A.rr(c, 10, 24, 236, 14, 7); }, [10, 24, 236, 14], rnd);
  A.metal(ctx, function (c) { A.rr(c, 24, 56, 208, 16, 8); }, [24, 56, 208, 16], rnd,
    { base: '#8d96a0', hi: '#cfd7de', lo: '#4e565e' });
  // 吊り鎖
  ctx.save();
  ctx.strokeStyle = '#6f7880';
  ctx.lineWidth = 4;
  [40, 216].forEach(function (x) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.ellipse(x, 10 + i * 6, 4, 4.5, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
  });
  ctx.restore();
  // ルーン
  ctx.save();
  ctx.strokeStyle = A.rgba('#8fd8f5', 0.85);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  [70, 128, 186].forEach(function (x) {
    ctx.beginPath();
    ctx.moveTo(x - 7, 38); ctx.lineTo(x, 50); ctx.lineTo(x + 7, 38);
    ctx.stroke();
  });
  ctx.restore();
  A.glow(ctx, 128, 46, 46, '#9bdcf6', 0.18);
});

def('platform_checkpoint', 'sprites/platforms', 288, 184, function (ctx) {
  const rnd = A.rng(1010);
  const pts = [];
  for (let i = 0; i < 13; i++) {
    const t = i / 13, a = t * Math.PI * 2;
    const px = 144 + Math.cos(a) * 128 * (0.93 + rnd() * 0.1);
    let py;
    if (Math.sin(a) < 0) py = 76 + Math.sin(a) * 10;
    else py = 76 + Math.sin(a) * 96 * (0.7 + rnd() * 0.5);
    pts.push([px, py]);
  }
  A.rockMass(ctx, pts, rnd);
  A.grassCap(ctx, 18, 270, 74, 24, rnd);
  // 石の台座
  A.paint(ctx, function (c) { A.rr(c, 108, 52, 72, 26, 7); }, {
    base: '#aba393', hi: '#dcd4c3', lo: '#645d52', box: [108, 52, 72, 26], lw: 2.6, outline: '#37322b'
  });
  hangingVines(ctx, 40, 250, 96, rnd, 5);
});

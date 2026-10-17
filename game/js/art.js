/* ===========================================================
   art.js  —  プロシージャル描画（背景・地形・キャラクター・演出）
   画像素材を一切使わず、すべて Canvas 2D で描きます。
   =========================================================== */
'use strict';

const Art = (function () {

  /* ---------------- 小道具 ---------------- */

  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function shadowOn(ctx, color, blur, oy) {
    ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetY = oy || 0;
  }
  function shadowOff(ctx) {
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }

  /* ===========================================================
     遠景レイヤー（空・雲・山・空中の城）
     =========================================================== */

  function drawSky(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#2f7fc4');
    g.addColorStop(0.28, '#4e9fd8');
    g.addColorStop(0.58, '#88c7ec');
    g.addColorStop(0.82, '#bbe0f3');
    g.addColorStop(1.00, '#d9eef7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 太陽のやわらかい光
    const sun = ctx.createRadialGradient(w * 0.26, h * 0.06, 0, w * 0.26, h * 0.06, h * 0.75);
    sun.addColorStop(0, 'rgba(255,250,228,.55)');
    sun.addColorStop(0.35, 'rgba(255,244,210,.16)');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
  }

  function cloudPuff(ctx, x, y, r, alpha) {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
    g.addColorStop(0.55, 'rgba(249,253,255,' + (alpha * 0.82) + ')');
    g.addColorStop(1, 'rgba(226,241,252,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  function drawCloud(ctx, x, y, s, alpha, rng) {
    const n = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const px = x + t * s * 2.1 + (rng() - 0.5) * s * 0.3;
      const py = y + Math.abs(t) * s * 0.5 - rng() * s * 0.32;
      const pr = s * (0.95 - Math.abs(t) * 0.5) * (0.8 + rng() * 0.4);
      cloudPuff(ctx, px, py, Math.max(6, pr), alpha);
    }
    // 下側のやわらかい影
    ctx.save();
    ctx.globalAlpha = alpha * 0.25;
    const g = ctx.createLinearGradient(0, y, 0, y + s * 0.7);
    g.addColorStop(0, 'rgba(176,208,235,.9)');
    g.addColorStop(1, 'rgba(176,208,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.3, s * 1.7, s * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function ridgeLine(ctx, w, baseY, peak, rough, rng) {
    const pts = [];
    let x = -40;
    let y = baseY - peak * (0.4 + rng() * 0.3);
    while (x < w + 60) {
      pts.push([x, y]);
      const step = 60 + rng() * 120;
      x += step;
      y += (rng() - 0.5) * peak * rough;
      y = clamp(y, baseY - peak, baseY - peak * 0.12);
    }
    pts.push([w + 60, baseY - peak * 0.2]);
    return pts;
  }

  function drawMountains(ctx, w, baseY, peak, colTop, colBot, rng, snow) {
    const pts = ridgeLine(ctx, w, baseY, peak, 0.55, rng);
    ctx.beginPath();
    ctx.moveTo(-40, baseY + 200);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0) ctx.lineTo(p[0], p[1]);
      else {
        const q = pts[i - 1];
        const mx = (q[0] + p[0]) / 2;
        // 山頂をとがらせる
        ctx.lineTo(mx, Math.min(q[1], p[1]) - peak * 0.16 * rng());
        ctx.lineTo(p[0], p[1]);
      }
    }
    ctx.lineTo(w + 60, baseY + 200);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - peak, 0, baseY + 60);
    g.addColorStop(0, colTop);
    g.addColorStop(1, colBot);
    ctx.fillStyle = g;
    ctx.fill();

    if (snow) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        ctx.beginPath();
        ctx.moveTo(p[0] - 36, p[1] + 34);
        ctx.lineTo(p[0], p[1] - 6);
        ctx.lineTo(p[0] + 36, p[1] + 34);
        ctx.quadraticCurveTo(p[0], p[1] + 16, p[0] - 36, p[1] + 34);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* --------- 浮遊島（背景用） --------- */

  function floatingIsland(ctx, cx, topY, rw, depth, rng, palette) {
    const pal = palette || {};
    const rock1 = pal.rock1 || '#8e8375';
    const rockMid = pal.rockMid || '#6b6256';
    const rock2 = pal.rock2 || '#3f3c39';
    const grass1 = pal.grass1 || '#8fcd57';
    const grass2 = pal.grass2 || '#4c9739';

    // --- 岩（下すぼまり・ごつごつ） ---
    ctx.beginPath();
    ctx.moveTo(cx - rw, topY);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(cx - rw, cx - rw * 0.08, Math.pow(t, 0.85)) + (rng() - 0.5) * rw * 0.14;
      const y = lerp(topY + rw * 0.2, topY + depth, Math.pow(t, 1.3));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx + rw * 0.04, topY + depth * 1.02);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(cx + rw * 0.12, cx + rw, Math.pow(t, 1.15)) + (rng() - 0.5) * rw * 0.14;
      const y = lerp(topY + depth, topY + rw * 0.2, Math.pow(t, 0.75));
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const rg = ctx.createLinearGradient(cx - rw * 0.7, topY, cx + rw * 0.6, topY + depth);
    rg.addColorStop(0, rock1);
    rg.addColorStop(0.45, rockMid);
    rg.addColorStop(1, rock2);
    ctx.fillStyle = rg;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // 岩の層
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = Math.max(1, rw * 0.02);
    for (let i = 0; i < 4; i++) {
      const yy = topY + rw * 0.3 + i * depth * 0.17;
      ctx.beginPath();
      ctx.moveTo(cx - rw, yy);
      ctx.quadraticCurveTo(cx, yy + rw * 0.1, cx + rw, yy - rw * 0.04);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    for (let i = 0; i < 3; i++) {
      const sx = cx + (rng() - 0.5) * rw * 1.1;
      const sy = topY + rw * 0.25 + rng() * depth * 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rng() - 0.5) * rw * 0.25, sy + depth * 0.25 * (0.5 + rng()));
      ctx.stroke();
    }
    // 左からの光
    const lg = ctx.createLinearGradient(cx - rw, topY, cx + rw * 0.2, topY + depth * 0.6);
    lg.addColorStop(0, 'rgba(255,248,222,.2)');
    lg.addColorStop(1, 'rgba(255,248,222,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(cx - rw * 1.2, topY, rw * 2.4, depth);
    ctx.restore();

    // --- 草の天面（上半分の楕円） ---
    ctx.beginPath();
    ctx.ellipse(cx, topY, rw, rw * 0.3, 0, Math.PI, TAU);
    const bumps = Math.max(5, Math.round(rw / 22));
    for (let i = bumps; i >= 0; i--) {
      const t = i / bumps;
      const bx = lerp(cx - rw, cx + rw, t);
      const skirt = Math.sin(t * Math.PI) * rw * 0.2 + rw * 0.05 + rng() * rw * 0.05;
      ctx.lineTo(bx, topY + skirt);
    }
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, topY - rw * 0.3, 0, topY + rw * 0.28);
    gg.addColorStop(0, grass1);
    gg.addColorStop(0.55, grass1);
    gg.addColorStop(1, grass2);
    ctx.fillStyle = gg;
    ctx.fill();

    // 草の縁のハイライト
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(226,250,180,.45)';
    ctx.beginPath();
    ctx.ellipse(cx, topY - rw * 0.02, rw * 0.95, rw * 0.22, 0, Math.PI, TAU);
    ctx.fill();
    ctx.restore();
  }


  function drawTree(ctx, x, groundY, s, rng, tint) {
    const conifer = rng() < 0.55;
    const trunk = tint ? '#5d5244' : '#5b4328';
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.06, groundY);
    ctx.lineTo(x - s * 0.045, groundY - s * 0.5);
    ctx.lineTo(x + s * 0.045, groundY - s * 0.5);
    ctx.lineTo(x + s * 0.06, groundY);
    ctx.closePath();
    ctx.fill();

    const c1 = tint ? '#8cb79a' : '#8fd05c';
    const c2 = tint ? '#4e8270' : '#3c8a3c';

    if (conifer) {
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const cy = groundY - s * (0.34 + t * 0.72);
        const rwd = s * (0.44 - t * 0.17);
        ctx.beginPath();
        ctx.moveTo(x - rwd, cy);
        ctx.quadraticCurveTo(x - rwd * 0.45, cy - s * 0.1, x, cy - s * 0.4);
        ctx.quadraticCurveTo(x + rwd * 0.45, cy - s * 0.1, x + rwd, cy);
        ctx.quadraticCurveTo(x, cy + s * 0.1, x - rwd, cy);
        ctx.closePath();
        const g = ctx.createLinearGradient(x - rwd, cy - s * 0.4, x + rwd, cy);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    } else {
      const puffs = 5;
      for (let i = 0; i < puffs; i++) {
        const a = (i / puffs) * TAU + rng() * 0.4;
        const px = x + Math.cos(a) * s * 0.24;
        const py = groundY - s * 0.72 + Math.sin(a) * s * 0.16;
        const pr = s * (0.26 + rng() * 0.12);
        const g = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.45, pr * 0.1, px, py, pr);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      }
      const g2 = ctx.createRadialGradient(x - s * 0.1, groundY - s * 0.9, s * 0.05, x, groundY - s * 0.78, s * 0.42);
      g2.addColorStop(0, tint ? 'rgba(190,225,205,.65)' : 'rgba(205,240,150,.6)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(x, groundY - s * 0.78, s * 0.42, 0, TAU); ctx.fill();
    }
  }

  /* --------- 空中の城 --------- */
  function tower(ctx, x, baseY, w, h, roofH, pal) {
    // 塔body
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, pal.wallL);
    g.addColorStop(0.45, pal.wall);
    g.addColorStop(1, pal.wallD);
    ctx.fillStyle = g;
    ctx.fillRect(x, baseY - h, w, h);
    // 窓
    ctx.fillStyle = pal.win;
    const cols = Math.max(1, Math.floor(w / 16));
    const rows = Math.max(1, Math.floor(h / 42));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = x + (c + 0.5) * (w / cols) - 2.4;
        const wy = baseY - h + 18 + r * 42;
        if (wy > baseY - 14) continue;
        rr(ctx, wx, wy, 4.8, 9, 2.2);
        ctx.fill();
      }
    }
    // 屋根
    ctx.beginPath();
    ctx.moveTo(x - w * 0.18, baseY - h);
    ctx.lineTo(x + w / 2, baseY - h - roofH);
    ctx.lineTo(x + w * 1.18, baseY - h);
    ctx.closePath();
    const rg = ctx.createLinearGradient(x, baseY - h - roofH, x + w, baseY - h);
    rg.addColorStop(0, pal.roofL);
    rg.addColorStop(1, pal.roof);
    ctx.fillStyle = rg;
    ctx.fill();
    // 旗
    ctx.strokeStyle = pal.wallD;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, baseY - h - roofH);
    ctx.lineTo(x + w / 2, baseY - h - roofH - 14);
    ctx.stroke();
    ctx.fillStyle = pal.flag;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, baseY - h - roofH - 14);
    ctx.lineTo(x + w / 2 + 13, baseY - h - roofH - 10);
    ctx.lineTo(x + w / 2, baseY - h - roofH - 6);
    ctx.closePath();
    ctx.fill();
  }

  function drawCastle(ctx, cx, baseY, scale, rng) {
    const pal = {
      wallL: '#f0f5fb', wall: '#d5e2f0', wallD: '#9fb6ce', win: '#3c5f85',
      roofL: '#9cc3e4', roof: '#5b8bbb', flag: '#c8dcf0'
    };
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -baseY);

    // 城壁
    ctx.fillStyle = pal.wallD;
    ctx.fillRect(cx - 230, baseY - 86, 460, 86);
    ctx.fillStyle = pal.wall;
    ctx.fillRect(cx - 230, baseY - 86, 460, 58);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = (i % 2 === 0) ? pal.wall : 'rgba(0,0,0,0)';
      ctx.fillRect(cx - 230 + i * 29, baseY - 100, 18, 16);
    }
    // 門
    ctx.fillStyle = '#5a7593';
    ctx.beginPath();
    ctx.moveTo(cx - 26, baseY);
    ctx.lineTo(cx - 26, baseY - 38);
    ctx.quadraticCurveTo(cx, baseY - 70, cx + 26, baseY - 38);
    ctx.lineTo(cx + 26, baseY);
    ctx.closePath();
    ctx.fill();

    // 塔（左右・中央）
    tower(ctx, cx - 250, baseY - 10, 46, 150, 64, pal);
    tower(ctx, cx + 204, baseY - 10, 46, 150, 64, pal);
    tower(ctx, cx - 150, baseY - 60, 54, 190, 76, pal);
    tower(ctx, cx + 96, baseY - 60, 54, 190, 76, pal);
    tower(ctx, cx - 36, baseY - 86, 72, 268, 112, pal);
    tower(ctx, cx - 104, baseY - 150, 38, 120, 56, pal);
    tower(ctx, cx + 66, baseY - 150, 38, 120, 56, pal);

    ctx.restore();
    void rng;
  }

  /* --------- 橋 --------- */
  function drawStoneBridge(ctx, x0, x1, y, rng) {
    const w = x1 - x0;
    ctx.fillStyle = '#cfdae6';
    ctx.fillRect(x0, y, w, 13);
    ctx.fillStyle = '#9aafc4';
    ctx.fillRect(x0, y + 13, w, 8);
    const arches = Math.max(2, Math.round(w / 90));
    for (let i = 0; i < arches; i++) {
      const ax = x0 + (i + 0.5) * (w / arches);
      const ar = (w / arches) * 0.33;
      ctx.fillStyle = '#b6c6d8';
      ctx.beginPath();
      ctx.moveTo(ax - ar, y + 21);
      ctx.lineTo(ax - ar, y + 50);
      ctx.lineTo(ax + ar, y + 50);
      ctx.lineTo(ax + ar, y + 21);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(ax - ar * 0.68, y + 52);
      ctx.lineTo(ax - ar * 0.68, y + 30);
      ctx.quadraticCurveTo(ax, y + 12, ax + ar * 0.68, y + 30);
      ctx.lineTo(ax + ar * 0.68, y + 52);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    void rng;
  }

  /* ===========================================================
     遠景・中景レイヤーの組み立て
     =========================================================== */


  function buildFar(w, h, seed) {
    const rng = rngFrom(seed);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');

    drawSky(ctx, w, h);

    // 高いところの薄雲
    for (let i = 0; i < 6; i++) {
      drawCloud(ctx, rng() * w, h * (0.03 + rng() * 0.2), 34 + rng() * 44, 0.34 + rng() * 0.18, rng);
    }

    // 遠い山脈（3 層。奥ほど淡く）
    drawMountains(ctx, w, h * 0.74, h * 0.36, 'rgba(186,214,238,.96)', 'rgba(156,192,224,.96)', rng, true);
    drawMountains(ctx, w, h * 0.8, h * 0.29, 'rgba(146,186,221,.96)', 'rgba(116,164,205,.96)', rng, true);
    drawMountains(ctx, w, h * 0.87, h * 0.21, 'rgba(108,156,193,.95)', 'rgba(84,134,176,.95)', rng, false);

    // 空中の城
    const castleX = w * 0.54, castleY = h * 0.3;
    floatingIsland(ctx, castleX, castleY, 300, 330, rng, {
      rock1: '#b3c2cf', rockMid: '#8597a9', rock2: '#55687c',
      grass1: '#a9d67e', grass2: '#5f9d4c'
    });
    drawCastle(ctx, castleX, castleY - 2, 0.86, rng);
    for (let i = 0; i < 6; i++) {
      drawTree(ctx, castleX - 250 + rng() * 500, castleY + 10, 56 + rng() * 22, rng, true);
    }

    // 小さな浮島
    const smalls = [
      [w * 0.15, h * 0.2, 66, 96], [w * 0.29, h * 0.38, 48, 68],
      [w * 0.75, h * 0.21, 80, 116], [w * 0.88, h * 0.35, 56, 80],
      [w * 0.42, h * 0.13, 42, 60], [w * 0.65, h * 0.47, 54, 76]
    ];
    smalls.forEach(function (s) {
      floatingIsland(ctx, s[0], s[1], s[2], s[3], rng, {
        rock1: '#a7b6c4', rockMid: '#7f91a3', rock2: '#4f6276',
        grass1: '#a4d37b', grass2: '#5c9a49'
      });
      drawTree(ctx, s[0] + (rng() - 0.5) * s[2], s[1] + 4, s[2] * 0.78, rng, true);
    });

    // やわらかな光のにじみ
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createRadialGradient(w * 0.26, h * 0.02, 0, w * 0.26, h * 0.02, h * 1.05);
    beam.addColorStop(0, 'rgba(255,250,226,.2)');
    beam.addColorStop(0.45, 'rgba(255,250,226,.07)');
    beam.addColorStop(1, 'rgba(255,250,226,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 低い雲
    for (let i = 0; i < 5; i++) {
      drawCloud(ctx, rng() * w, h * (0.45 + rng() * 0.26), 40 + rng() * 46, 0.3 + rng() * 0.16, rng);
    }

    // 雲海（下方のすき間を埋める）
    const sea = ctx.createLinearGradient(0, h * 0.76, 0, h);
    sea.addColorStop(0, 'rgba(226,243,252,0)');
    sea.addColorStop(0.45, 'rgba(232,246,253,.55)');
    sea.addColorStop(1, 'rgba(244,251,255,.92)');
    ctx.fillStyle = sea;
    ctx.fillRect(0, h * 0.76, w, h * 0.24);
    for (let i = 0; i < Math.round(w / 150); i++) {
      drawCloud(ctx, rng() * w, h * (0.86 + rng() * 0.12), 56 + rng() * 74, 0.5 + rng() * 0.3, rng);
    }

    // 空気遠近
    const haze = ctx.createLinearGradient(0, h * 0.35, 0, h);
    haze.addColorStop(0, 'rgba(182,218,242,0)');
    haze.addColorStop(1, 'rgba(182,218,242,.35)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.35, w, h * 0.65);

    return { canvas: c, falls: [{ x: castleX - 160, y: castleY + 54, w: 46, h: 170 }] };
  }


  function buildMid(w, h, seed) {
    const rng = rngFrom(seed + 77);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');

    const falls = [];
    const islands = [
      [w * 0.08, h * 0.54, 150, 190], [w * 0.24, h * 0.64, 120, 160],
      [w * 0.4, h * 0.5, 165, 210], [w * 0.57, h * 0.62, 132, 172],
      [w * 0.72, h * 0.52, 158, 200], [w * 0.88, h * 0.63, 124, 164],
      [w * 0.97, h * 0.49, 140, 180]
    ];
    islands.forEach(function (s, i) {
      floatingIsland(ctx, s[0], s[1], s[2], s[3], rng, {
        rock1: '#9a9083', rockMid: '#726a5d', rock2: '#474340',
        grass1: '#90ce58', grass2: '#4b963a'
      });
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        drawTree(ctx, s[0] + (rng() - 0.5) * s[2] * 1.2, s[1] + 6, 46 + rng() * 26, rng, true);
      }
      if (i % 2 === 0) falls.push({ x: s[0] - s[2] * 0.3, y: s[1] + 16, w: 20 + rng() * 12, h: 108 + rng() * 76 });
    });

    // 石橋
    drawStoneBridge(ctx, w * 0.12, w * 0.22, h * 0.6, rng);
    drawStoneBridge(ctx, w * 0.62, w * 0.7, h * 0.58, rng);

    // 奥行きの青み
    ctx.globalCompositeOperation = 'source-atop';
    const haze = ctx.createLinearGradient(0, 0, 0, h);
    haze.addColorStop(0, 'rgba(158,205,238,.34)');
    haze.addColorStop(1, 'rgba(158,205,238,.14)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    return { canvas: c, falls: falls };
  }

  /* --------- 滝（毎フレーム描画） --------- */

  function drawWaterfall(ctx, x, y, w, h, t, alpha) {
    const a = alpha === undefined ? 0.85 : alpha;
    ctx.save();
    ctx.globalAlpha = a;

    // 落ち口の水たまり
    ctx.fillStyle = 'rgba(224,246,255,.75)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y, w * 0.78, w * 0.2, 0, 0, TAU);
    ctx.fill();

    // 本流（下へ行くほど細く・薄く）
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(240,252,255,.88)');
    g.addColorStop(0.35, 'rgba(212,240,253,.5)');
    g.addColorStop(0.72, 'rgba(202,235,251,.16)');
    g.addColorStop(1, 'rgba(196,232,250,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.quadraticCurveTo(x + w * 0.88, y + h * 0.55, x + w * 0.64, y + h);
    ctx.lineTo(x + w * 0.36, y + h);
    ctx.quadraticCurveTo(x + w * 0.12, y + h * 0.55, x, y);
    ctx.closePath();
    ctx.fill();

    // 流れる筋
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = Math.max(1.1, w * 0.06);
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const off = ((t * (190 + i * 58) + i * 150) % (h + 140)) - 70;
      const sx = x + w * (0.2 + i * 0.2);
      ctx.beginPath();
      ctx.moveTo(sx, y + off);
      ctx.lineTo(sx + w * 0.04, y + off + 46);
      ctx.stroke();
    }
    ctx.restore();

    // 落下点のしぶき
    for (let i = 0; i < 3; i++) {
      const p = ((t * 0.5 + i * 0.33) % 1);
      const mr = w * (0.9 + p * 1.5);
      ctx.globalAlpha = a * (1 - p) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h - p * w * 0.8, mr, mr * 0.42, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ===========================================================
     足場（プレイ面）
     =========================================================== */


  function drawPlatform(ctx, p, rng) {
    const x = p.x, y = p.y, w = p.w, h = p.h;
    const grassH = Math.min(44, Math.max(24, h * 0.32));

    // --- 岩の本体 ---
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 8);
    const lsteps = 6;
    for (let i = 1; i <= lsteps; i++) {
      const t = i / lsteps;
      ctx.lineTo(x - 4 - Math.sin(t * Math.PI) * w * 0.05 + (rng() - 0.5) * 10, y + 8 + h * t);
    }
    const bsteps = Math.max(4, Math.round(w / 90));
    for (let i = 1; i <= bsteps; i++) {
      const t = i / bsteps;
      const bx = lerp(x, x + w, t);
      const sag = Math.sin(t * Math.PI) * h * 0.12;
      ctx.lineTo(bx, y + h + sag + (rng() - 0.5) * 12);
    }
    for (let i = lsteps; i >= 1; i--) {
      const t = i / lsteps;
      ctx.lineTo(x + w + 4 + Math.sin(t * Math.PI) * w * 0.045 + (rng() - 0.5) * 10, y + 8 + h * t);
    }
    ctx.lineTo(x + w + 4, y + 8);
    ctx.closePath();

    const rg = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
    rg.addColorStop(0, '#b4ab9b');
    rg.addColorStop(0.22, '#93897a');
    rg.addColorStop(0.58, '#6a6359');
    rg.addColorStop(1, '#423e3a');
    ctx.save();
    shadowOn(ctx, 'rgba(0,0,0,.4)', 26, 12);
    ctx.fillStyle = rg;
    ctx.fill();
    shadowOff(ctx);
    ctx.clip();

    // 地層
    for (let i = 0; i < 5; i++) {
      const yy = y + 54 + i * (h * 0.16) + rng() * 16;
      ctx.strokeStyle = i % 2 ? 'rgba(255,250,236,.07)' : 'rgba(0,0,0,.1)';
      ctx.lineWidth = 5 + rng() * 7;
      ctx.beginPath();
      ctx.moveTo(x - 20, yy);
      ctx.bezierCurveTo(x + w * 0.3, yy + 18, x + w * 0.7, yy - 16, x + w + 20, yy + 8);
      ctx.stroke();
    }
    // 岩だな（出っぱり）
    for (let i = 0; i < Math.max(1, Math.round(w / 260)); i++) {
      const lx = x + 40 + rng() * (w - 80);
      const ly = y + 90 + rng() * (h * 0.5);
      const lw = 60 + rng() * 120;
      ctx.fillStyle = 'rgba(190,178,158,.3)';
      ctx.beginPath();
      ctx.ellipse(lx, ly, lw, 12 + rng() * 10, 0.04, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(lx, ly + 6, lw * 0.96, 10 + rng() * 8, 0.04, 0, Math.PI);
      ctx.fill();
    }
    // ひび
    ctx.strokeStyle = 'rgba(26,22,18,.4)';
    for (let i = 0; i < Math.round(w / 70); i++) {
      const sx = x + rng() * w, sy = y + 50 + rng() * (h - 60);
      ctx.lineWidth = 1 + rng() * 2.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rng() - 0.5) * 50, sy + 34 + rng() * 60);
      ctx.lineTo(sx + (rng() - 0.5) * 80, sy + 80 + rng() * 70);
      ctx.stroke();
    }
    // こけ
    for (let i = 0; i < Math.round(w / 90); i++) {
      const mx = x + rng() * w, my = y + grassH + rng() * 60;
      ctx.fillStyle = 'rgba(104,146,74,' + (0.12 + rng() * 0.14) + ')';
      ctx.beginPath();
      ctx.ellipse(mx, my, 18 + rng() * 40, 8 + rng() * 14, 0, 0, TAU);
      ctx.fill();
    }
    // 上部の光
    const lg = ctx.createLinearGradient(0, y, 0, y + h * 0.45);
    lg.addColorStop(0, 'rgba(255,246,214,.26)');
    lg.addColorStop(1, 'rgba(255,246,214,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(x - 20, y, w + 40, h * 0.45);
    ctx.restore();

    // --- 草地（岩よりすこし張り出す） ---
    ctx.beginPath();
    ctx.moveTo(x - 10, y + grassH * 0.25);
    ctx.quadraticCurveTo(x + w * 0.5, y - 12, x + w + 10, y + grassH * 0.25);
    const bumps = Math.max(6, Math.round(w / 46));
    for (let i = bumps; i >= 0; i--) {
      const t = i / bumps;
      const bx = lerp(x - 10, x + w + 10, t);
      const by = y + grassH * 0.55 + Math.abs(Math.sin(t * Math.PI * 5 + rng())) * grassH * 0.5 + rng() * 6;
      ctx.lineTo(bx, by);
    }
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, y - 12, 0, y + grassH + 10);
    gg.addColorStop(0, '#a6e268');
    gg.addColorStop(0.35, '#77c548');
    gg.addColorStop(0.75, '#4e9b37');
    gg.addColorStop(1, '#357f2d');
    ctx.fillStyle = gg;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(224,252,172,.55)';
    ctx.fillRect(x - 12, y - 6, w + 24, 9);
    ctx.fillStyle = 'rgba(40,96,40,.22)';
    for (let i = 0; i < Math.round(w / 120); i++) {
      const sx2 = x + rng() * w;
      ctx.beginPath();
      ctx.ellipse(sx2, y + grassH * 0.6, 40 + rng() * 60, 10 + rng() * 8, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // 草の葉
    for (let i = 0; i < Math.round(w / 18); i++) {
      const bx = x + 6 + rng() * (w - 12);
      const by = y + 2;
      const hgt = 11 + rng() * 17;
      ctx.strokeStyle = rng() > 0.5 ? '#8ad455' : '#5aad3c';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + (rng() - 0.5) * 10, by - hgt * 0.6, bx + (rng() - 0.5) * 20, by - hgt);
      ctx.stroke();
    }
    // 花と小石
    for (let i = 0; i < Math.max(1, Math.round(w / 110)); i++) {
      flower(ctx, x + 20 + rng() * (w - 40), y - 1, 1 + rng() * 0.6, rng);
    }
    for (let i = 0; i < Math.round(w / 170); i++) {
      const sx3 = x + 20 + rng() * (w - 40);
      ctx.fillStyle = 'rgba(176,168,152,.9)';
      ctx.beginPath();
      ctx.ellipse(sx3, y + 2, 9 + rng() * 7, 6 + rng() * 4, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath();
      ctx.ellipse(sx3 - 2, y - 1, 5, 2.6, 0, Math.PI, TAU);
      ctx.fill();
    }
    // ツタ
    for (let i = 0; i < Math.max(2, Math.round(w / 85)); i++) {
      vine(ctx, x + 12 + rng() * (w - 24), y + grassH * 0.75, 44 + rng() * 110, rng);
    }
  }

  function flower(ctx, x, y, s, rng) {
    const col = ['#ffffff', '#ffe9a8', '#f6c7e2', '#cfe4ff'][Math.floor(rng() * 4)];
    ctx.strokeStyle = '#4e9a38';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 4, y - 12 * s);
    ctx.stroke();
    const cy = y - 12 * s;
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 3.4 * s, cy + Math.sin(a) * 3.4 * s, 2.6 * s, 2.6 * s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#f3c75a';
    ctx.beginPath();
    ctx.arc(x, cy, 2.1 * s, 0, TAU);
    ctx.fill();
  }

  function vine(ctx, x, y, len, rng) {
    ctx.strokeStyle = 'rgba(78,150,58,.95)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    const sway = (rng() - 0.5) * 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway, y + len * 0.6, x + sway * 1.4, y + len);
    ctx.stroke();
    ctx.fillStyle = 'rgba(96,172,66,.95)';
    const leaves = Math.round(len / 22);
    for (let i = 1; i <= leaves; i++) {
      const t = i / (leaves + 1);
      const lx = x + sway * t * 1.2 + (i % 2 ? 4 : -4);
      const ly = y + len * t;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 4.6, 2.8, (i % 2 ? 0.5 : -0.5), 0, TAU);
      ctx.fill();
    }
  }

  /* --------- 装飾 --------- */
  function drawDeco(ctx, d, rng) {
    switch (d.type) {
      case 'banner': return decoBanner(ctx, d);
      case 'lantern': return decoLantern(ctx, d);
      case 'fence': return decoFence(ctx, d, rng);
      case 'crate': return decoCrate(ctx, d);
      case 'bush': return decoBush(ctx, d, rng);
      case 'sign': return decoSign(ctx, d);
      case 'path': return decoPath(ctx, d, rng);
      default: return undefined;
    }
  }

  function woodGrad(ctx, x, w, a, b) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, a); g.addColorStop(0.5, b); g.addColorStop(1, a);
    return g;
  }

  function decoBanner(ctx, d) {
    const x = d.x, y = d.y, h = d.h || 240;
    // 柱
    ctx.fillStyle = woodGrad(ctx, x - 9, 18, '#5b422a', '#8a6943');
    ctx.fillRect(x - 9, y - h, 18, h);
    // 腕木
    ctx.fillStyle = woodGrad(ctx, x - 9, 100, '#4f3a24', '#7d5f3c');
    ctx.fillRect(x - 9, y - h, 96, 13);
    // 斜め補強
    ctx.strokeStyle = '#59402a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - h + 42);
    ctx.lineTo(x + 44, y - h + 12);
    ctx.stroke();
    // 旗
    const bx = x + 16, by = y - h + 16, bw = 62, bh = 150;
    ctx.save();
    shadowOn(ctx, 'rgba(0,0,0,.3)', 10, 6);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw / 2, by + bh - 26);
    ctx.lineTo(bx, by + bh);
    ctx.closePath();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#9c3426');
    g.addColorStop(0.45, '#c8452f');
    g.addColorStop(1, '#8c2e20');
    ctx.fillStyle = g;
    ctx.fill();
    shadowOff(ctx);
    // 紋章（翼）
    ctx.fillStyle = 'rgba(250,236,214,.92)';
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2, by + 42);
    ctx.quadraticCurveTo(bx + 10, by + 48, bx + 14, by + 74);
    ctx.quadraticCurveTo(bx + 24, by + 62, bx + bw / 2, by + 68);
    ctx.quadraticCurveTo(bx + bw - 24, by + 62, bx + bw - 14, by + 74);
    ctx.quadraticCurveTo(bx + bw - 10, by + 48, bx + bw / 2, by + 42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function decoLantern(ctx, d) {
    const x = d.x, y = d.y;
    ctx.strokeStyle = '#4b3722';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, y - 86);
    ctx.lineTo(x + 26, y - 86);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 26, y - 86);
    ctx.lineTo(x + 26, y - 72);
    ctx.stroke();
    // 本体
    ctx.fillStyle = '#3b2c1c';
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 72);
    ctx.lineTo(x + 42, y - 72);
    ctx.lineTo(x + 36, y - 64);
    ctx.lineTo(x + 16, y - 64);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - 64, 0, y - 32);
    g.addColorStop(0, 'rgba(255,236,176,.95)');
    g.addColorStop(1, 'rgba(250,200,120,.85)');
    ctx.fillStyle = g;
    rr(ctx, x + 16, y - 64, 20, 30, 4);
    ctx.fill();
    ctx.strokeStyle = '#3b2c1c';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // ほのかな光
    const glow = ctx.createRadialGradient(x + 26, y - 49, 2, x + 26, y - 49, 48);
    glow.addColorStop(0, 'rgba(255,226,150,.35)');
    glow.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x + 26, y - 49, 48, 0, TAU); ctx.fill();
  }

  function decoFence(ctx, d, rng) {
    const x = d.x, y = d.y, w = d.w || 200;
    const posts = Math.max(2, Math.round(w / 56));
    ctx.fillStyle = woodGrad(ctx, x, w, '#6a4e31', '#916f48');
    ctx.fillRect(x, y - 44, w, 10);
    ctx.fillRect(x, y - 24, w, 9);
    for (let i = 0; i <= posts; i++) {
      const px = x + (i / posts) * (w - 12);
      ctx.fillStyle = woodGrad(ctx, px, 13, '#553d26', '#8a6a44');
      ctx.fillRect(px, y - 58, 13, 60);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(px, y - 58, 13, 4);
      void rng;
    }
  }

  function decoCrate(ctx, d) {
    const x = d.x, y = d.y, s = d.s || 64;
    ctx.save();
    shadowOn(ctx, 'rgba(0,0,0,.35)', 12, 6);
    ctx.fillStyle = woodGrad(ctx, x, s, '#7a5631', '#a97c48');
    rr(ctx, x, y - s, s, s, 5);
    ctx.fill();
    shadowOff(ctx);
    ctx.strokeStyle = '#5d3f22';
    ctx.lineWidth = 5;
    rr(ctx, x + 2, y - s + 2, s - 4, s - 4, 4);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - s + 4); ctx.lineTo(x + s - 4, y - 4);
    ctx.moveTo(x + s - 4, y - s + 4); ctx.lineTo(x + 4, y - 4);
    ctx.stroke();
    ctx.restore();
  }

  function decoBush(ctx, d, rng) {
    const x = d.x, y = d.y, s = d.s || 46;
    for (let i = 0; i < 6; i++) {
      const bx = x + (rng() - 0.5) * s * 1.6;
      const by = y - rng() * s * 0.5;
      const br = s * (0.4 + rng() * 0.4);
      const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.4, br * 0.1, bx, by, br);
      g.addColorStop(0, '#86cc5a');
      g.addColorStop(1, '#3d8336');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
    }
  }

  function decoSign(ctx, d) {
    const x = d.x, y = d.y;
    ctx.fillStyle = woodGrad(ctx, x - 6, 12, '#5b422a', '#8a6943');
    ctx.fillRect(x - 6, y - 74, 12, 76);
    ctx.save();
    shadowOn(ctx, 'rgba(0,0,0,.3)', 8, 4);
    ctx.fillStyle = woodGrad(ctx, x - 44, 88, '#8a6943', '#b58b55');
    rr(ctx, x - 44, y - 104, 88, 40, 6);
    ctx.fill();
    shadowOff(ctx);
    ctx.strokeStyle = '#5b422a';
    ctx.lineWidth = 3.4;
    rr(ctx, x - 44, y - 104, 88, 40, 6);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#4a3520';
    ctx.font = '600 20px "Hiragino Maru Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.text || '→', x, y - 77);
    ctx.textAlign = 'left';
  }

  function decoPath(ctx, d, rng) {
    const x = d.x, y = d.y, w = d.w || 300;
    for (let i = 0; i < Math.round(w / 46); i++) {
      const px = x + i * 46 + rng() * 8;
      const py = y - 2 + (rng() - 0.5) * 5;
      ctx.fillStyle = 'rgba(196,186,166,.85)';
      ctx.beginPath();
      ctx.ellipse(px, py, 22 + rng() * 6, 9 + rng() * 3, (rng() - 0.5) * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath();
      ctx.ellipse(px - 2, py - 2.5, 16, 5, 0, 0, TAU);
      ctx.fill();
    }
  }

  /* --------- ステージ面の組み立て --------- */
  function buildStageLayer(stage, W, H) {
    const rng = rngFrom(stage.seed || 1234);
    const c = makeCanvas(stage.width, H);
    const ctx = c.getContext('2d');
    stage.platforms.forEach(function (p) { drawPlatform(ctx, p, rng); });
    (stage.decos || []).forEach(function (d) { drawDeco(ctx, d, rng); });
    void W;
    return c;
  }


  /* --------- 前景（ぼかした草花） --------- */
  function buildFore(w, h, seed) {
    const rng = rngFrom(seed + 991);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    if (ctx.filter !== undefined) ctx.filter = 'blur(5px)';

    const baseY = h + 26;
    for (let i = 0; i < Math.round(w / 26); i++) {
      const x = rng() * w;
      const hgt = 70 + rng() * 150;
      ctx.strokeStyle = rng() > 0.5 ? 'rgba(52,112,52,.85)' : 'rgba(38,88,46,.85)';
      ctx.lineWidth = 7 + rng() * 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x + (rng() - 0.5) * 46, baseY - hgt * 0.6, x + (rng() - 0.5) * 92, baseY - hgt);
      ctx.stroke();
    }
    for (let i = 0; i < Math.round(w / 190); i++) {
      const x = rng() * w;
      const y = baseY - 70 - rng() * 120;
      const col = ['rgba(255,255,255,.85)', 'rgba(255,232,170,.85)', 'rgba(244,198,226,.85)', 'rgba(206,226,255,.85)'][Math.floor(rng() * 4)];
      ctx.fillStyle = col;
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * TAU;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(ang) * 11, y + Math.sin(ang) * 11, 8, 8, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(243,199,90,.9)';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
    }
    if (ctx.filter !== undefined) ctx.filter = 'none';
    return c;
  }

  /* ===========================================================
     キャラクター
     =========================================================== */

  function slimeBody(ctx, r, colors) {
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.72);
    ctx.bezierCurveTo(-r * 1.06, -r * 0.2, -r * 0.62, -r * 1.12, 0, -r * 1.12);
    ctx.bezierCurveTo(r * 0.62, -r * 1.12, r * 1.06, -r * 0.2, r, r * 0.72);
    ctx.bezierCurveTo(r * 0.72, r * 1.02, -r * 0.72, r * 1.02, -r, r * 0.72);
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.34, -r * 0.5, r * 0.1, 0, 0, r * 1.5);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.42, colors[1]);
    g.addColorStop(1, colors[2]);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawSlime(ctx, s) {
    const r = s.r;
    ctx.save();
    ctx.translate(s.x, s.y);

    // 影は呼び出し側で描画済み
    ctx.rotate(s.ang || 0);
    ctx.scale(s.sx || 1, s.sy || 1);

    if (s.flash > 0) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(s.flash * 28));

    slimeBody(ctx, r, ['#f2fcff', '#8fd8f7', '#2a93d6']);

    // 内側のやわらかい影
    ctx.save();
    ctx.clip();
    const sh = ctx.createLinearGradient(0, r * 0.1, 0, r * 1.1);
    sh.addColorStop(0, 'rgba(26,110,165,0)');
    sh.addColorStop(1, 'rgba(26,110,165,.45)');
    ctx.fillStyle = sh;
    ctx.fillRect(-r * 1.2, -r * 0.2, r * 2.4, r * 1.6);
    // 上部のリムライト
    const rim = ctx.createLinearGradient(0, -r * 1.2, 0, -r * 0.2);
    rim.addColorStop(0, 'rgba(255,255,255,.75)');
    rim.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r);
    ctx.restore();

    // 輪郭
    ctx.lineWidth = Math.max(1.6, r * 0.07);
    ctx.strokeStyle = 'rgba(28,106,160,.75)';
    slimeBody(ctx, r, ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)']);
    ctx.stroke();

    // ハイライト
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.36, -r * 0.5, r * 0.26, r * 0.17, -0.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.ellipse(-r * 0.06, -r * 0.72, r * 0.1, r * 0.07, -0.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = s.flash > 0 ? (0.45 + 0.55 * Math.abs(Math.sin(s.flash * 28))) : 1;

    // 顔
    const face = s.face || 'normal';
    const eo = (s.dir || 1) * r * 0.04;
    ctx.fillStyle = '#17405e';
    if (face === 'hurt') {
      ctx.strokeStyle = '#17405e';
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = 'round';
      [[-r * 0.3, 0], [r * 0.24, 0]].forEach(function (p) {
        ctx.beginPath();
        ctx.moveTo(p[0] - r * 0.1 + eo, -r * 0.14);
        ctx.lineTo(p[0] + r * 0.1 + eo, r * 0.06);
        ctx.moveTo(p[0] + r * 0.1 + eo, -r * 0.14);
        ctx.lineTo(p[0] - r * 0.1 + eo, r * 0.06);
        ctx.stroke();
      });
    } else if (face === 'charge') {
      ctx.beginPath();
      ctx.ellipse(-r * 0.28 + eo, -r * 0.02, r * 0.1, r * 0.16, 0, 0, TAU);
      ctx.ellipse(r * 0.22 + eo, -r * 0.02, r * 0.1, r * 0.16, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25 + eo, -r * 0.08, r * 0.035, r * 0.045, 0, 0, TAU);
      ctx.ellipse(r * 0.25 + eo, -r * 0.08, r * 0.035, r * 0.045, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(-r * 0.28 + eo, -r * 0.04, r * 0.095, r * 0.145, 0, 0, TAU);
      ctx.ellipse(r * 0.22 + eo, -r * 0.04, r * 0.095, r * 0.145, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25 + eo, -r * 0.1, r * 0.032, r * 0.042, 0, 0, TAU);
      ctx.ellipse(r * 0.25 + eo, -r * 0.1, r * 0.032, r * 0.042, 0, 0, TAU);
      ctx.fill();
    }

    // ほお
    ctx.fillStyle = 'rgba(240,142,166,.5)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.52 + eo, r * 0.17, r * 0.14, r * 0.085, 0, 0, TAU);
    ctx.ellipse(r * 0.48 + eo, r * 0.17, r * 0.14, r * 0.085, 0, 0, TAU);
    ctx.fill();

    // 口
    if (face !== 'hurt') {
      ctx.strokeStyle = '#17405e';
      ctx.lineWidth = r * 0.055;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-r * 0.03 + eo, r * 0.08, r * 0.14, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* 引っ張ったときの尾 */
  function drawSlimeTail(ctx, s, ax, ay) {
    const dx = ax - s.x, dy = ay - s.y;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const nx = -dy / len, ny = dx / len;
    const w0 = s.r * 0.78, w1 = s.r * 0.16;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(s.x + nx * w0, s.y + ny * w0);
    ctx.quadraticCurveTo(s.x + dx * 0.5 + nx * w0 * 0.6, s.y + dy * 0.5 + ny * w0 * 0.6, ax + nx * w1, ay + ny * w1);
    ctx.quadraticCurveTo(ax + dx * 0.12, ay + dy * 0.12, ax - nx * w1, ay - ny * w1);
    ctx.quadraticCurveTo(s.x + dx * 0.5 - nx * w0 * 0.6, s.y + dy * 0.5 - ny * w0 * 0.6, s.x - nx * w0, s.y - ny * w0);
    ctx.closePath();
    const g = ctx.createLinearGradient(s.x, s.y, ax, ay);
    g.addColorStop(0, 'rgba(146,217,247,.95)');
    g.addColorStop(0.6, 'rgba(176,230,250,.85)');
    g.addColorStop(1, 'rgba(206,241,255,.6)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,140,200,.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /* --------- 敵 --------- */

  function monsterBadge(ctx, x, y, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#2b3f5c'); g.addColorStop(1, '#101e30');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(190,220,250,.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    // 簡素な角のあるモンスター顔
    ctx.fillStyle = '#e8f1fa';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y - r * 0.1);
    ctx.lineTo(x - r * 0.3, y - r * 0.55);
    ctx.lineTo(x, y - r * 0.2);
    ctx.lineTo(x + r * 0.3, y - r * 0.55);
    ctx.lineTo(x + r * 0.55, y - r * 0.1);
    ctx.quadraticCurveTo(x, y + r * 0.62, x - r * 0.55, y - r * 0.1);
    ctx.fill();
    ctx.fillStyle = '#101e30';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.2, y + r * 0.02, r * 0.11, r * 0.14, 0, 0, TAU);
    ctx.ellipse(x + r * 0.2, y + r * 0.02, r * 0.11, r * 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }


  function drawEnemyHp(ctx, e) {
    const w = e.barW || 86, h = 10, br = 12;
    const total = w + br * 2 + 6;
    const x = e.x - total / 2 + br * 2 + 6;
    const y = e.y - e.h - 30;
    monsterBadge(ctx, x - br - 6, y + h / 2, br);
    ctx.save();
    rr(ctx, x, y, w, h, 5);
    ctx.fillStyle = 'rgba(10,22,38,.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,220,250,.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    if (ratio > 0) {
      rr(ctx, x + 1.6, y + 1.6, Math.max(2, (w - 3.2) * ratio), h - 3.2, 3.6);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#f3736b');
      g.addColorStop(1, '#c42f2c');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGoblin(ctx, e, t) {
    const s = e.scale || 1;
    const walk = Math.sin(t * 7 + e.phase) * (e.walking ? 1 : 0.25);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.dir * s, s);
    const bob = Math.abs(walk) * 2.2;
    ctx.translate(0, -bob);

    // 脚
    ctx.fillStyle = '#4e7d3a';
    ctx.save(); ctx.translate(-8, -20); ctx.rotate(walk * 0.4);
    rr(ctx, -5, 0, 11, 22, 4); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(9, -20); ctx.rotate(-walk * 0.4);
    rr(ctx, -5, 0, 11, 22, 4); ctx.fill(); ctx.restore();
    // 足
    ctx.fillStyle = '#3c3024';
    rr(ctx, -16 + walk * 3, -2, 18, 8, 4); ctx.fill();
    rr(ctx, 2 - walk * 3, -2, 18, 8, 4); ctx.fill();

    // 胴（革のチュニック）
    const bg = ctx.createLinearGradient(-20, -58, 20, -16);
    bg.addColorStop(0, '#8dbd5e');
    bg.addColorStop(1, '#4f8336');
    ctx.fillStyle = bg;
    rr(ctx, -20, -56, 40, 40, 13); ctx.fill();
    ctx.fillStyle = '#7d5e36';
    rr(ctx, -20, -40, 40, 20, 8); ctx.fill();
    ctx.fillStyle = '#5c4426';
    ctx.fillRect(-20, -30, 40, 6);

    // 腕と棍棒
    ctx.fillStyle = '#6ea248';
    ctx.save();
    ctx.translate(14, -48);
    ctx.rotate(-0.5 + (e.attack || 0) * 1.5);
    rr(ctx, -5, -4, 10, 26, 5); ctx.fill();
    ctx.fillStyle = '#8a6336';
    rr(ctx, -4.5, 16, 9, 30, 4); ctx.fill();
    ctx.fillStyle = '#a97e49';
    rr(ctx, -8, 36, 16, 18, 5); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#6ea248';
    ctx.save();
    ctx.translate(-16, -46); ctx.rotate(0.4);
    rr(ctx, -5, -4, 10, 24, 5); ctx.fill();
    ctx.restore();

    // 頭
    const hg = ctx.createRadialGradient(-6, -76, 3, 0, -70, 26);
    hg.addColorStop(0, '#a8d472');
    hg.addColorStop(1, '#5d8f3c');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, -70, 21, 19, 0, 0, TAU);
    ctx.fill();
    // 耳
    ctx.fillStyle = '#74a84b';
    ctx.beginPath();
    ctx.moveTo(-18, -74); ctx.lineTo(-36, -84); ctx.lineTo(-17, -64);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, -74); ctx.lineTo(36, -84); ctx.lineTo(17, -64);
    ctx.closePath(); ctx.fill();
    // 兜（革）
    ctx.fillStyle = '#6f5531';
    ctx.beginPath();
    ctx.ellipse(0, -80, 22, 15, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#86683c';
    ctx.fillRect(-23, -81, 46, 6);
    // 顔
    ctx.fillStyle = '#20331d';
    ctx.beginPath();
    ctx.ellipse(-7, -70, 3.4, 4.2, 0, 0, TAU);
    ctx.ellipse(8, -70, 3.4, 4.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-6, -71.5, 1.2, 0, TAU);
    ctx.arc(9, -71.5, 1.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2d4a24';
    ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -77); ctx.lineTo(-3, -74);
    ctx.moveTo(13, -77); ctx.lineTo(4, -74);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -61); ctx.quadraticCurveTo(0, -57, 7, -61);
    ctx.stroke();
    // きば
    ctx.fillStyle = '#f3f6e8';
    ctx.beginPath();
    ctx.moveTo(-4, -61); ctx.lineTo(-1.5, -56); ctx.lineTo(-6.5, -58);
    ctx.closePath(); ctx.fill();

    ctx.restore();
  }

  function drawRedSlime(ctx, e, t) {
    const s = e.scale || 1;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(s, s);
    const squash = e.squash || 0;
    ctx.scale(1 + squash, 1 - squash * 0.8);
    ctx.translate(0, -26);

    const r = 26;
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.95);
    ctx.bezierCurveTo(-r * 1.06, -r * 0.1, -r * 0.6, -r * 1.05, 0, -r * 1.05);
    ctx.bezierCurveTo(r * 0.6, -r * 1.05, r * 1.06, -r * 0.1, r, r * 0.95);
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.45, r * 0.1, 0, 0, r * 1.5);
    g.addColorStop(0, '#ffd3c0');
    g.addColorStop(0.4, '#e2634f');
    g.addColorStop(1, '#a32c22');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,28,22,.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.2, r * 0.12, -0.5, 0, TAU);
    ctx.fill();

    // 角つきの兜
    [-1, 1].forEach(function (d) {
      const hg = ctx.createLinearGradient(d * r * 0.8, -r * 1.5, d * r * 1.6, -r * 0.4);
      hg.addColorStop(0, '#fbf4e2');
      hg.addColorStop(1, '#bfae8c');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.moveTo(d * r * 0.74, -r * 0.92);
      ctx.quadraticCurveTo(d * r * 1.9, -r * 1.62, d * r * 1.62, -r * 0.46);
      ctx.quadraticCurveTo(d * r * 1.42, -r * 1.04, d * r * 0.68, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,100,70,.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    const hm = ctx.createLinearGradient(0, -r * 1.3, 0, -r * 0.5);
    hm.addColorStop(0, '#d7dee4');
    hm.addColorStop(0.5, '#9aa3ab');
    hm.addColorStop(1, '#6f787f');
    ctx.fillStyle = hm;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.7, r * 0.98, r * 0.66, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#5d666d';
    ctx.fillRect(-r * 1.02, -r * 0.78, r * 2.04, r * 0.16);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 1.02, r * 0.22, r * 0.1, -0.35, 0, TAU);
    ctx.fill();

    // 顔（おこりぎみ）
    ctx.fillStyle = '#3c1410';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.05, r * 0.1, r * 0.14, 0.2, 0, TAU);
    ctx.ellipse(r * 0.3, -r * 0.05, r * 0.1, r * 0.14, -0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3c1410';
    ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.3); ctx.lineTo(-r * 0.16, -r * 0.16);
    ctx.moveTo(r * 0.5, -r * 0.3); ctx.lineTo(r * 0.16, -r * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.22, r * 0.4);
    ctx.quadraticCurveTo(0, r * 0.22, r * 0.22, r * 0.4);
    ctx.stroke();

    ctx.restore();
    void t;
  }

  function drawBat(ctx, e, t) {
    const s = e.scale || 1;
    const flap = Math.sin(t * 11 + e.phase);
    ctx.save();
    ctx.translate(e.x, e.y - 24);
    ctx.scale(e.dir * s, s);

    // 翼
    ctx.fillStyle = '#5b4a78';
    [-1, 1].forEach(function (d) {
      ctx.save();
      ctx.scale(d, 1);
      ctx.rotate(flap * 0.45 * d * -1);
      ctx.beginPath();
      ctx.moveTo(10, -6);
      ctx.quadraticCurveTo(42, -26, 52, -2);
      ctx.quadraticCurveTo(40, -6, 36, 6);
      ctx.quadraticCurveTo(28, -2, 22, 10);
      ctx.quadraticCurveTo(18, 2, 10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    // 体
    const g = ctx.createRadialGradient(-4, -8, 2, 0, 0, 22);
    g.addColorStop(0, '#8a79ad');
    g.addColorStop(1, '#473864');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 15, 0, 0, TAU);
    ctx.fill();
    // 耳
    ctx.fillStyle = '#56456f';
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.lineTo(-14, -26); ctx.lineTo(-2, -15); ctx.closePath();
    ctx.moveTo(10, -12); ctx.lineTo(14, -26); ctx.lineTo(2, -15); ctx.closePath();
    ctx.fill();
    // 目
    ctx.fillStyle = '#f7e9a0';
    ctx.beginPath();
    ctx.ellipse(-5.5, -2, 3, 3.6, 0, 0, TAU);
    ctx.ellipse(5.5, -2, 3, 3.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2b2140';
    ctx.beginPath();
    ctx.ellipse(-5.5, -1.6, 1.2, 2.2, 0, 0, TAU);
    ctx.ellipse(5.5, -1.6, 1.2, 2.2, 0, 0, TAU);
    ctx.fill();
    // きば
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-3.5, 7); ctx.lineTo(-1.5, 12); ctx.lineTo(-5.5, 9); ctx.closePath();
    ctx.moveTo(3.5, 7); ctx.lineTo(1.5, 12); ctx.lineTo(5.5, 9); ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawBoss(ctx, e, t) {
    const s = (e.scale || 1);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(s, s);
    const squash = e.squash || 0;
    ctx.scale(1 + squash, 1 - squash * 0.8);
    ctx.translate(0, -52);
    const r = 52;
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.95);
    ctx.bezierCurveTo(-r * 1.08, -r * 0.1, -r * 0.6, -r * 1.08, 0, -r * 1.08);
    ctx.bezierCurveTo(r * 0.6, -r * 1.08, r * 1.08, -r * 0.1, r, r * 0.95);
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.45, r * 0.1, 0, 0, r * 1.5);
    g.addColorStop(0, '#e6c9f3');
    g.addColorStop(0.4, '#9b5bc4');
    g.addColorStop(1, '#4e2170');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,20,78,.7)';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.22, r * 0.13, -0.5, 0, TAU);
    ctx.fill();
    // 王冠
    ctx.fillStyle = '#e4c061';
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.78);
    ctx.lineTo(-r * 0.5, -r * 1.22);
    ctx.lineTo(-r * 0.22, -r * 0.92);
    ctx.lineTo(0, -r * 1.34);
    ctx.lineTo(r * 0.22, -r * 0.92);
    ctx.lineTo(r * 0.5, -r * 1.22);
    ctx.lineTo(r * 0.7, -r * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8d6a1c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 顔
    ctx.fillStyle = '#2b1138';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.1, r * 0.11, r * 0.16, 0.2, 0, TAU);
    ctx.ellipse(r * 0.3, -r * 0.1, r * 0.11, r * 0.16, -0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2b1138';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.52, -r * 0.38); ctx.lineTo(-r * 0.16, -r * 0.22);
    ctx.moveTo(r * 0.52, -r * 0.38); ctx.lineTo(r * 0.16, -r * 0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, r * 0.42);
    ctx.quadraticCurveTo(0, r * 0.14, r * 0.3, r * 0.42);
    ctx.stroke();
    ctx.restore();
    void t;
  }

  const enemyPainter = {
    goblin: drawGoblin,
    redslime: drawRedSlime,
    bat: drawBat,
    boss: drawBoss
  };

  /* ===========================================================
     演出
     =========================================================== */

  function drawShadow(ctx, x, y, r, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(18,30,22,' + (0.42 * alpha) + ')');
    g.addColorStop(1, 'rgba(18,30,22,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.34, 0, 0, TAU);
    ctx.fill();
  }


  function drawTrajectory(ctx, pts, power) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i += 3) {
      const a = pts[i], b = pts[Math.min(pts.length - 1, i + 2)];
      const t = i / pts.length;
      ctx.globalAlpha = (1 - t * 0.7) * (0.6 + power * 0.4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lerp(9, 4.5, t);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    const n = pts.length;
    const p1 = pts[n - 1], p0 = pts[Math.max(0, n - 4)];
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(p1[0], p1[1]);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-9, -13);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-9, 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawAimGauge(ctx, x, y, r, power) {
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = power > 0.92 ? '#ffd98a' : 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * power);
    ctx.stroke();
    ctx.restore();
  }

  function drawShockwave(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(190,230,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r * 0.96, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawVignette(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95);
    g.addColorStop(0, 'rgba(6,16,28,0)');
    g.addColorStop(1, 'rgba(6,16,28,.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  return {
    rngFrom: rngFrom, clamp: clamp, lerp: lerp, makeCanvas: makeCanvas, rr: rr,
    buildFar: buildFar, buildMid: buildMid, buildStageLayer: buildStageLayer, buildFore: buildFore,
    drawWaterfall: drawWaterfall,
    drawSlime: drawSlime, drawSlimeTail: drawSlimeTail,
    enemyPainter: enemyPainter, drawEnemyHp: drawEnemyHp,
    drawShadow: drawShadow, drawTrajectory: drawTrajectory, drawAimGauge: drawAimGauge,
    drawShockwave: drawShockwave, drawVignette: drawVignette, drawCloud: drawCloud
  };
})();

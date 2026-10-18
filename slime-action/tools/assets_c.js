/* ===========================================================
   assets_c.js — 敵キャラクター（1 作目の描画コードを素材として書き出す）
   =========================================================== */
'use strict';
/* global A, def */

const TAU = Math.PI * 2;
function rr(ctx, x, y, w, h, r) { A.rr(ctx, x, y, w, h, r); }

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

/* ---------------- 書き出し ---------------- */
function enemyFrame(name, w, h, baseX, baseY, painter, e) {
  def(name, 'sprites/enemies', w, h, function (ctx) {
    const o = Object.assign({ x: baseX, y: baseY, dir: 1, scale: 1, phase: 0, squash: 0, attack: 0, walking: false }, e);
    painter(ctx, o, o.time || 0);
  });
}

enemyFrame('enemy_goblin_idle',   192, 192, 96, 182, drawGoblin,   { walking: false, time: 0 });
enemyFrame('enemy_goblin_walk',   192, 192, 96, 182, drawGoblin,   { walking: true, time: 0.23 });
enemyFrame('enemy_goblin_attack', 192, 192, 96, 182, drawGoblin,   { walking: false, attack: 0.9, time: 0.5 });
enemyFrame('enemy_redslime_idle', 160, 160, 80, 150, drawRedSlime, {});
enemyFrame('enemy_redslime_squash', 160, 160, 80, 150, drawRedSlime, { squash: 0.26 });
enemyFrame('enemy_bat_up',        176, 128, 88, 96,  drawBat,      { time: 0.14 });
enemyFrame('enemy_bat_down',      176, 128, 88, 96,  drawBat,      { time: 0.43 });
enemyFrame('enemy_boss_idle',     288, 288, 144, 276, drawBoss,    {});
enemyFrame('enemy_boss_squash',   288, 288, 144, 276, drawBoss,    { squash: 0.22 });

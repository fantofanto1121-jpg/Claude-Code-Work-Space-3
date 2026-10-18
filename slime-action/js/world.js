/* ===========================================================
   world.js — 足場・敵の仕様とステージ定義（横スクロール）
   絵は配布された素材シートのものをそのまま使い、
   当たり判定だけをここで数値として持つ。
   =========================================================== */
'use strict';

const VIEW_W = 1280;
const VIEW_H = 720;
const ART = 1.8;             // シートの素材をゲーム画面で使うときの倍率

/* 足場: 画像名と、ふるまい（当たり判定の寸法は画像から自動計測した
   PLATFORM_METRICS を使う） */
const PLATFORM_IMG = {
  wide: 'island_wide',
  fence: 'island_fence',
  medium: 'island_medium',
  small: 'island_small',
  tiny: 'island_tiny',
  rock: 'island_rock',
  mini: 'island_mini'
};

/* 敵: フレーム画像と当たり判定 */
const ENEMY_SPECS = {
  goblin: {
    frames: ['goblin_1', 'goblin_2', 'goblin_3', 'goblin_4'],
    w: 56, h: 112, hp: 3, exp: 16, speed: 76, barW: 64, scale: 1, anim: 5
  },
  redslime: {
    frames: ['redslime_1', 'redslime_2', 'redslime_3', 'redslime_4'],
    w: 62, h: 86, hp: 4, exp: 18, speed: 58, barW: 64, scale: 1, anim: 4
  },
  purple: {
    frames: ['purple_1', 'purple_2', 'purple_3', 'purple_4'],
    w: 64, h: 88, hp: 6, exp: 26, speed: 66, barW: 70, scale: 1, anim: 4
  },
  boss: {
    frames: ['purple_3', 'purple_4', 'purple_1', 'purple_2'],
    w: 112, h: 150, hp: 20, exp: 90, speed: 48, barW: 120, scale: 1.75, anim: 3
  }
};

function makePlatform(type, cx, surfaceY, opt) {
  const img = PLATFORM_IMG[type];
  const m = PLATFORM_METRICS[img];
  const a = ASSET_FILES[img];
  const o = opt || {};
  const colW = (m.right - m.left) * ART;
  const ccx = (m.left + m.right) / 2;          // 画像の中での上面の中心
  return Object.assign({
    type: type, img: img,
    cx: cx, y: surfaceY,
    x: cx - colW / 2, w: colW,
    h: o.ground ? 560 : Math.min(190, (a.h - m.surface) * ART),
    drawDx: -ccx * ART,
    drawDy: -m.surface * ART,
    drawW: a.w * ART,
    drawH: a.h * ART,
    alive: true
  }, o);
}

function P(t, cx, y, o) { return { t: t, cx: cx, y: y, o: o || null }; }
function E(t, x, y, a, b) { return { t: t, x: x, y: y, patrol: [a, b] }; }
function D(img, x, y, s) { return { img: img, x: x, y: y, s: s === undefined ? 1 : s }; }

const STAGES = [
  {
    no: '1-1', name: 'はじまりの森', seed: 11,
    width: 4200, deathY: 1020, spawn: { x: 200, y: 460 },
    hint: 'スライムを引っ張って、はなそう',
    platforms: [
      P('wide', 230, 560, { ground: true }),
      P('medium', 700, 500),
      P('small', 960, 395),
      P('wide', 1340, 560, { ground: true }),
      P('fence', 1660, 440),
      P('fence', 1980, 520, { checkpoint: true }),
      P('rock', 2230, 465, { bouncy: true }),
      P('wide', 2600, 560, { ground: true }),
      P('medium', 2940, 450),
      P('small', 3270, 530),
      P('wide', 3720, 560, { ground: true })
    ],
    enemies: [
      E('goblin', 320, 560, 120, 430),
      E('redslime', 700, 500, 620, 790),
      E('goblin', 1400, 560, 1180, 1540),
      E('redslime', 2940, 450, 2870, 3020),
      E('goblin', 2700, 560, 2420, 2800)
    ],
    props: [
      D('sign', 140, 560, 1), D('bush_big', 420, 560, 1),
      D('plant', 520, 560, 0.9), D('rock_small', 620, 500, 1),
      D('lantern', 1210, 560, 1), D('bush_small', 1500, 560, 1),
      D('plant', 2050, 520, 0.9), D('banner', 2520, 560, 1),
      D('bush_big', 2860, 560, 0.9), D('barrel', 3340, 530, 1),
      D('rock_grass', 3620, 560, 1), D('fence', 3480, 560, 1),
      D('flagpole', 1980, 520, 0.8)
    ],
    chests: [[3840, 560]],
    potions: [[2230, 330]],
    keys: [[1680, 330]],
    coins: [[700, 420], [740, 395], [960, 300], [1680, 350], [2230, 360], [2250, 330], [2950, 355], [3280, 440]],
    crystals: [[1000, 300], [2240, 310], [3300, 430]]
  },

  {
    no: '1-2', name: 'たきのかけ橋', seed: 22,
    width: 4600, deathY: 1020, spawn: { x: 200, y: 450 },
    hint: 'むらさきスライムは かたい',
    platforms: [
      P('wide', 220, 550, { ground: true }),
      P('fence', 620, 465),
      P('small', 900, 380),
      P('fence', 1180, 465),
      P('fence', 1520, 545, { checkpoint: true }),
      P('medium', 1860, 455, { fragile: true }),
      P('medium', 2180, 540),
      P('rock', 2440, 475, { bouncy: true }),
      P('small', 2740, 360),
      P('fence', 3060, 530, { checkpoint: true }),
      P('small', 3380, 430, { moveAmp: 90, moveSpd: 0.6 }),
      P('wide', 3800, 550, { ground: true }),
      P('medium', 4240, 470)
    ],
    enemies: [
      E('goblin', 300, 550, 110, 420),
      E('purple', 900, 380, 830, 970),
      E('redslime', 1520, 545, 1430, 1610),
      E('goblin', 2180, 540, 2080, 2280),
      E('purple', 2740, 360, 2670, 2810),
      E('redslime', 3060, 530, 2980, 3140),
      E('goblin', 3880, 550, 3600, 4020)
    ],
    props: [
      D('sign', 130, 550, 1), D('bush_big', 400, 550, 1),
      D('lantern', 650, 465, 0.9), D('plant', 1550, 545, 0.9),
      D('rocks', 2200, 540, 1), D('barrel', 2420, 475, 0.9),
      D('banner', 3090, 530, 1), D('bush_small', 3760, 550, 1),
      D('fence', 1180, 465, 0.9), D('flagpole', 1520, 545, 0.8),
      D('flagpole', 3060, 530, 0.8), D('log', 3860, 550, 1)
    ],
    chests: [[4280, 470]],
    potions: [[1860, 390]],
    keys: [[2440, 360]],
    coins: [[620, 390], [900, 290], [1180, 390], [1880, 370], [2440, 380], [2740, 270], [3380, 350], [3900, 460]],
    crystals: [[1200, 360], [2460, 340], [3400, 330]]
  },

  {
    no: '1-3', name: 'そらの城門', seed: 33,
    width: 4800, deathY: 1020, spawn: { x: 210, y: 480 },
    hint: 'ボスは かたい。スペシャルで ねらおう',
    platforms: [
      P('wide', 230, 580, { ground: true }),
      P('medium', 620, 490),
      P('small', 900, 380),
      P('medium', 1220, 490, { fragile: true }),
      P('small', 1520, 400, { moveAmp: 110, moveSpd: 0.7 }),
      P('fence', 1860, 530, { checkpoint: true }),
      P('rock', 2120, 465, { bouncy: true }),
      P('small', 2420, 360),
      P('medium', 2720, 500, { fragile: true }),
      P('small', 3020, 430, { moveAmp: 130, moveSpd: 0.55 }),
      P('fence', 3340, 540, { checkpoint: true }),
      P('wide', 3900, 570, { ground: true }),
      P('wide', 4400, 570, { ground: true })
    ],
    enemies: [
      E('goblin', 300, 580, 110, 430),
      E('purple', 900, 380, 830, 970),
      E('redslime', 1220, 490, 1150, 1290),
      E('goblin', 1860, 530, 1760, 1960),
      E('purple', 2420, 360, 2350, 2490),
      E('redslime', 3340, 540, 3260, 3420),
      E('boss', 4200, 570, 3800, 4600)
    ],
    props: [
      D('sign', 140, 580, 1), D('banner', 420, 580, 1),
      D('lantern', 650, 490, 0.9), D('rocks', 1890, 530, 1),
      D('barrel', 2140, 465, 0.9), D('bush_big', 3370, 540, 1),
      D('banner', 3920, 570, 1.1), D('rock_grass', 2440, 360, 0.9),
      D('plant', 4480, 570, 0.9), D('flagpole', 1860, 530, 0.8),
      D('flagpole', 3340, 540, 0.8), D('log', 2700, 500, 0.9)
    ],
    chests: [[4620, 570]],
    potions: [[2720, 430]],
    keys: [[2120, 340]],
    coins: [[620, 400], [900, 290], [1520, 310], [2120, 370], [2420, 270], [3020, 340], [3360, 450], [4000, 480]],
    crystals: [[1540, 280], [2440, 250], [3040, 310]]
  }
];

function buildStage(index) {
  const st = STAGES[index];
  const platforms = st.platforms.map(function (p) { return makePlatform(p.t, p.cx, p.y, p.o || {}); });
  platforms.forEach(function (p) {
    if (p.moveAmp) { p.baseCx = p.cx; p.movePhase = (p.cx % 7) * 0.9; p.dx = 0; }
  });
  const enemies = st.enemies.map(function (e, i) {
    const spec = ENEMY_SPECS[e.t];
    return {
      type: e.t, spec: spec,
      x: e.x, y: e.y, baseY: e.y,
      hp: spec.hp, maxHp: spec.hp,
      dir: i % 2 ? -1 : 1, phase: i * 1.6,
      patrol: e.patrol, alive: true,
      vy: 0, hopT: 0.6 + i * 0.25, squashT: 0, attack: 0, hitT: 0, hitCd: 0
    };
  });
  let groundY = 0;
  platforms.forEach(function (p) { if (p.ground) groundY = Math.max(groundY, p.y); });
  if (!groundY) groundY = 560;

  const chests = (st.chests || []).map(function (c) { return { x: c[0], y: c[1], opened: false }; });

  return {
    no: st.no, name: st.name, width: st.width, deathY: st.deathY, groundY: groundY,
    chests: chests,
    keys: (st.keys || []).map(function (k) { return { x: k[0], y: k[1], got: false }; }),
    potions: (st.potions || []).map(function (k) { return { x: k[0], y: k[1], got: false }; }),
    spawn: st.spawn, hint: st.hint, seed: st.seed,
    platforms: platforms, enemies: enemies,
    props: st.props.slice(),
    coins: st.coins.map(function (c) { return { x: c[0], y: c[1], got: false, ph: c[0] % 6 }; }),
    crystals: st.crystals.map(function (c) { return { x: c[0], y: c[1], got: false, ph: c[1] % 6 }; })
  };
}

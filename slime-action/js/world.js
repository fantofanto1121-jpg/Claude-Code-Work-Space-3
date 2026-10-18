/* ===========================================================
   world.js — 足場・敵の仕様とステージ定義（横スクロール）
   当たり判定は画像の見た目とは別に、ここで数値として持つ
   =========================================================== */
'use strict';

const VIEW_W = 1280;
const VIEW_H = 720;

/* 画像内の着地面と当たり判定の範囲（原寸） */
const PLATFORM_SPECS = {
  grass_small:   { img: 'platform_grass_small',   surface: 33, left: 14, right: 178, body: 86 },
  grass_medium:  { img: 'platform_grass_medium',  surface: 37, left: 16, right: 304, body: 96 },
  grass_wide:    { img: 'platform_grass_wide',    surface: 39, left: 18, right: 462, body: 104 },
  stone:         { img: 'platform_stone',         surface: 24, left: 16, right: 304, body: 88 },
  wood:          { img: 'platform_wood',          surface: 22, left: 14, right: 274, body: 56 },
  floating_rock: { img: 'platform_floating_rock', surface: 44, left: 26, right: 230, body: 120 },
  broken_ruin:   { img: 'platform_broken_ruin',   surface: 32, left: 18, right: 304, body: 78 },
  mushroom:      { img: 'platform_mushroom',      surface: 42, left: 34, right: 190, body: 60 },
  moving:        { img: 'platform_moving',        surface: 26, left: 16, right: 240, body: 56 },
  checkpoint:    { img: 'platform_checkpoint',    surface: 75, left: 24, right: 264, body: 90 }
};

/* 敵の仕様。frames は状態ごとの画像名 */
const ENEMY_SPECS = {
  goblin: {
    frames: { idle: 'enemy_goblin_idle', walk: 'enemy_goblin_walk', attack: 'enemy_goblin_attack' },
    baseX: 96, baseY: 182, scale: 1.04, w: 60, h: 116,
    hp: 3, exp: 16, speed: 76, barW: 58
  },
  redslime: {
    frames: { idle: 'enemy_redslime_idle', squash: 'enemy_redslime_squash' },
    baseX: 80, baseY: 150, scale: 1.05, w: 64, h: 72,
    hp: 4, exp: 18, speed: 58, barW: 58
  },
  bat: {
    frames: { up: 'enemy_bat_up', down: 'enemy_bat_down' },
    baseX: 88, baseY: 96, scale: 0.95, w: 58, h: 56,
    hp: 2, exp: 14, speed: 96, barW: 52
  },
  boss: {
    frames: { idle: 'enemy_boss_idle', squash: 'enemy_boss_squash' },
    baseX: 144, baseY: 276, scale: 1.45, w: 158, h: 180,
    hp: 18, exp: 90, speed: 48, barW: 130
  }
};

function makePlatform(type, cx, surfaceY, opt) {
  const s = PLATFORM_SPECS[type];
  const colW = s.right - s.left;
  const o = opt || {};
  return Object.assign({
    type: type, img: s.img,
    cx: cx, y: surfaceY,
    x: cx - colW / 2, w: colW,
    h: o.ground ? 520 : s.body,
    drawDx: -(s.left) - colW / 2,
    drawDy: -s.surface,
    drawW: ASSET_FILES[s.img].w,
    drawH: ASSET_FILES[s.img].h,
    alive: true
  }, o);
}

/* P: 足場 / E: 敵 / D: 飾り / C: コイン */
function P(t, cx, y, o) { return { t: t, cx: cx, y: y, o: o || null }; }
function E(t, x, y, a, b) { return { t: t, x: x, y: y, patrol: [a, b] }; }
function D(img, x, y, s) { return { img: img, x: x, y: y, s: s === undefined ? 1 : s }; }

const STAGES = [
  {
    no: '1-1', name: 'はじまりの森', seed: 11,
    width: 4200, deathY: 1020, spawn: { x: 200, y: 480 },
    hint: 'スライムを引っ張って、はなそう',
    platforms: [
      P('grass_wide', 230, 560, { ground: true }),
      P('grass_medium', 690, 505),
      P('floating_rock', 960, 395),
      P('grass_wide', 1340, 560, { ground: true }),
      P('wood', 1660, 440),
      P('grass_medium', 1980, 520),
      P('mushroom', 2230, 470),
      P('grass_wide', 2600, 560, { ground: true }),
      P('stone', 2940, 450),
      P('grass_medium', 3270, 535),
      P('grass_wide', 3720, 560, { ground: true })
    ],
    enemies: [
      E('goblin', 320, 560, 120, 430),
      E('redslime', 690, 505, 580, 800),
      E('goblin', 1400, 560, 1180, 1540),
      E('redslime', 1980, 520, 1870, 2090),
      E('goblin', 2700, 560, 2420, 2800)
    ],
    props: [
      D('prop_wood_sign', 140, 560, 0.9), D('prop_bush', 420, 560, 0.9),
      D('prop_flower', 520, 560, 1), D('prop_rock', 600, 505, 1),
      D('prop_lantern', 1230, 560, 0.9), D('prop_bush', 1500, 560, 0.85),
      D('prop_flower', 2060, 520, 1), D('prop_flag', 2520, 560, 0.9),
      D('prop_bush', 2860, 560, 0.9), D('prop_vine', 3300, 535, 0.5),
      D('prop_chest', 3820, 560, 0.8), D('prop_bush', 3620, 560, 0.9)
    ],
    coins: [[700, 420], [740, 400], [960, 300], [1680, 350], [2230, 370], [2250, 340], [2950, 360], [3280, 440]],
    crystals: [[1000, 300], [2240, 320], [3300, 430]]
  },

  {
    no: '1-2', name: 'たきのかけ橋', seed: 22,
    width: 4600, deathY: 1020, spawn: { x: 200, y: 470 },
    hint: 'こうもりは 空中でも 当たる',
    platforms: [
      P('grass_wide', 220, 550, { ground: true }),
      P('wood', 620, 470),
      P('floating_rock', 900, 380),
      P('wood', 1180, 470),
      P('grass_medium', 1520, 545),
      P('broken_ruin', 1860, 455),
      P('stone', 2180, 540),
      P('mushroom', 2440, 480),
      P('floating_rock', 2740, 360),
      P('grass_medium', 3060, 530),
      P('wood', 3380, 430),
      P('grass_wide', 3800, 550, { ground: true }),
      P('stone', 4240, 470)
    ],
    enemies: [
      E('goblin', 300, 550, 110, 420),
      E('bat', 900, 300, 760, 1120),
      E('redslime', 1520, 545, 1400, 1650),
      E('goblin', 2180, 540, 2050, 2310),
      E('bat', 2740, 280, 2560, 2980),
      E('redslime', 3060, 530, 2940, 3180),
      E('goblin', 3880, 550, 3600, 4020)
    ],
    props: [
      D('prop_wood_sign', 130, 550, 0.9), D('prop_bush', 400, 550, 0.9),
      D('prop_lantern', 640, 470, 0.85), D('prop_flower', 1540, 545, 1),
      D('prop_vine', 1880, 455, 0.5), D('prop_rock', 2200, 540, 1),
      D('prop_flag', 3080, 530, 0.9), D('prop_bush', 3760, 550, 0.9),
      D('prop_chest', 4280, 470, 0.8), D('prop_crystal', 2760, 360, 0.6)
    ],
    coins: [[620, 390], [900, 290], [1180, 390], [1880, 370], [2440, 390], [2760, 270], [3380, 350], [3900, 460]],
    crystals: [[1200, 360], [2460, 350], [3400, 330]]
  },

  {
    no: '1-3', name: 'そらの城門', seed: 33,
    width: 4800, deathY: 1020, spawn: { x: 210, y: 500 },
    hint: 'ボスは かたい。スペシャルで ねらおう',
    platforms: [
      P('grass_wide', 230, 580, { ground: true }),
      P('stone', 620, 490),
      P('floating_rock', 900, 380),
      P('broken_ruin', 1220, 490),
      P('moving', 1520, 400, { moveAmp: 110, moveSpd: 0.7 }),
      P('stone', 1860, 530),
      P('mushroom', 2120, 470),
      P('floating_rock', 2420, 360),
      P('broken_ruin', 2720, 500),
      P('moving', 3020, 430, { moveAmp: 130, moveSpd: 0.55 }),
      P('grass_medium', 3340, 540),
      P('grass_wide', 3900, 570, { ground: true }),
      P('grass_wide', 4400, 570, { ground: true })
    ],
    enemies: [
      E('goblin', 300, 580, 110, 430),
      E('bat', 900, 300, 760, 1080),
      E('redslime', 1220, 490, 1110, 1330),
      E('goblin', 1860, 530, 1740, 1980),
      E('bat', 2420, 280, 2260, 2600),
      E('redslime', 3340, 540, 3230, 3450),
      E('boss', 4200, 570, 3760, 4600)
    ],
    props: [
      D('prop_wood_sign', 140, 580, 0.9), D('prop_flag', 420, 580, 0.95),
      D('prop_lantern', 640, 490, 0.85), D('prop_vine', 1240, 490, 0.5),
      D('prop_bush', 1880, 530, 0.9), D('prop_crystal', 2440, 360, 0.6),
      D('prop_flag', 3920, 570, 1.05), D('prop_chest', 4620, 570, 0.85),
      D('prop_bush', 3360, 540, 0.85), D('prop_flower', 4480, 570, 1)
    ],
    coins: [[620, 400], [900, 290], [1520, 310], [2120, 380], [2420, 270], [3020, 340], [3360, 450], [4000, 480]],
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
  return {
    no: st.no, name: st.name, width: st.width, deathY: st.deathY,
    spawn: st.spawn, hint: st.hint, seed: st.seed,
    platforms: platforms, enemies: enemies,
    props: st.props.slice(),
    coins: st.coins.map(function (c) { return { x: c[0], y: c[1], got: false, ph: c[0] % 6 }; }),
    crystals: st.crystals.map(function (c) { return { x: c[0], y: c[1], got: false, ph: c[1] % 6 }; })
  };
}

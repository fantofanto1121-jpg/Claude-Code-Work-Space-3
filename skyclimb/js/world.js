/* ===========================================================
   world.js — 足場の仕様とステージ生成
   当たり判定は画像の見た目とは別に、ここで数値として持つ
   =========================================================== */
'use strict';

const VIEW_W = 720;
const VIEW_H = 1280;
const PX_PER_M = 48;        // 高さ表示の換算
const GOAL_M = 300;

/* 画像ごとの着地面と当たり判定の範囲（画像内の座標・原寸）
   surface: 着地する高さ / left,right: 当たり判定の左右 */
const PLATFORM_SPECS = {
  grass_small:   { img: 'platform_grass_small',   surface: 33, left: 14, right: 178, scale: 1.0 },
  grass_medium:  { img: 'platform_grass_medium',  surface: 37, left: 16, right: 304, scale: 1.0 },
  grass_wide:    { img: 'platform_grass_wide',    surface: 39, left: 18, right: 462, scale: 1.0 },
  stone:         { img: 'platform_stone',         surface: 24, left: 16, right: 304, scale: 1.0 },
  wood:          { img: 'platform_wood',          surface: 22, left: 14, right: 274, scale: 1.0 },
  floating_rock: { img: 'platform_floating_rock', surface: 44, left: 26, right: 230, scale: 1.0 },
  broken_ruin:   { img: 'platform_broken_ruin',   surface: 32, left: 18, right: 304, scale: 1.0 },
  mushroom:      { img: 'platform_mushroom',      surface: 42, left: 34, right: 190, scale: 1.0 },
  moving:        { img: 'platform_moving',        surface: 26, left: 16, right: 240, scale: 1.0 },
  checkpoint:    { img: 'platform_checkpoint',    surface: 75, left: 24, right: 264, scale: 1.0 }
};

function makePlatform(type, cx, surfaceY, extra) {
  const s = PLATFORM_SPECS[type];
  const sc = s.scale;
  const colW = (s.right - s.left) * sc;
  const p = Object.assign({
    type: type,
    img: s.img,
    x: cx - colW / 2,             // 当たり判定の左端
    y: surfaceY,                  // 着地面
    w: colW,
    drawDx: -(s.left * sc) - colW / 2,   // 中心からの描画ずれ
    drawDy: -s.surface * sc,
    drawW: ASSET_FILES[s.img].w * sc,
    drawH: ASSET_FILES[s.img].h * sc,
    cx: cx,
    alive: true,
    fallT: 0
  }, extra || {});
  return p;
}

/* 乱数（シード固定） */
function mkRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWorld(seed) {
  const rnd = mkRng(seed);
  const platforms = [];
  const props = [];
  const coins = [];
  const crystals = [];
  const chests = [];

  const topY = -GOAL_M * PX_PER_M;

  // 地上（画面いっぱいの床。ここまで落ちても世界の外には出ない）
  const ground = makePlatform('grass_wide', VIEW_W / 2, 0, { ground: true });
  ground.x = -60; ground.w = VIEW_W + 120;
  platforms.push(ground);
  props.push({ img: 'prop_wood_sign', x: 150, y: 0, s: 0.8 });
  props.push({ img: 'prop_bush', x: 548, y: 0, s: 0.9 });
  props.push({ img: 'prop_flower', x: 470, y: 0, s: 1 });
  props.push({ img: 'prop_rock', x: 250, y: 0, s: 1 });

  let y = -150;
  let band = 0;
  while (y > topY + 240) {
    band++;
    const prog = Math.min(1, (-y) / (-topY));     // 0=地上 1=頂上
    const isCp = band % 9 === 0;
    let type;
    if (isCp) {
      type = 'checkpoint';
    } else {
      const roll = rnd();
      if (prog < 0.25) {
        type = roll < 0.4 ? 'grass_medium' : (roll < 0.62 ? 'grass_small' : (roll < 0.82 ? 'wood' : 'floating_rock'));
      } else if (prog < 0.55) {
        type = roll < 0.3 ? 'wood' : (roll < 0.52 ? 'floating_rock' : (roll < 0.7 ? 'grass_small' : (roll < 0.86 ? 'mushroom' : 'moving')));
      } else if (prog < 0.8) {
        type = roll < 0.28 ? 'stone' : (roll < 0.5 ? 'broken_ruin' : (roll < 0.72 ? 'moving' : (roll < 0.88 ? 'floating_rock' : 'mushroom')));
      } else {
        type = roll < 0.3 ? 'stone' : (roll < 0.55 ? 'moving' : (roll < 0.74 ? 'floating_rock' : (roll < 0.9 ? 'broken_ruin' : 'mushroom')));
      }
    }
    const spec = PLATFORM_SPECS[type];
    const colW = (spec.right - spec.left) * spec.scale;
    const half = colW / 2;
    const cx = 60 + half + rnd() * (VIEW_W - 120 - colW);

    const extra = {};
    if (type === 'moving') {
      extra.moveAmp = 70 + rnd() * 90;
      extra.moveSpd = 0.5 + rnd() * 0.5;
      extra.movePhase = rnd() * 6.28;
      extra.baseCx = cx;
    }
    if (type === 'broken_ruin') extra.fragile = true;
    if (type === 'mushroom') extra.bouncy = true;
    if (type === 'checkpoint') extra.checkpoint = true;

    const p = makePlatform(type, cx, y, extra);
    platforms.push(p);

    // 飾り
    if (type !== 'moving' && type !== 'mushroom' && rnd() < 0.5) {
      const kinds = ['prop_bush', 'prop_flower', 'prop_rock', 'prop_lantern', 'prop_flag', 'prop_vine'];
      const k = kinds[Math.floor(rnd() * kinds.length)];
      props.push({
        img: k, x: cx + (rnd() - 0.5) * colW * 0.6, y: y,
        s: k === 'prop_vine' ? 0.5 : (0.6 + rnd() * 0.35),
        behind: k === 'prop_vine'
      });
    }
    if (type === 'checkpoint') {
      props.push({ img: 'prop_checkpoint_flag', x: cx, y: y - 22, s: 0.9 });
    }

    // 収集物
    if (rnd() < 0.55) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        coins.push({ x: cx - (n - 1) * 26 + i * 52, y: y - 70 - rnd() * 60, got: false, ph: rnd() * 6.28 });
      }
    }
    if (rnd() < 0.18) {
      crystals.push({ x: 70 + rnd() * (VIEW_W - 140), y: y - 90 - rnd() * 90, got: false, ph: rnd() * 6.28 });
    }
    if (!isCp && rnd() < 0.07 && colW > 180) {
      chests.push({ x: cx, y: y, opened: false });
    }

    y -= 190 + rnd() * 120;
  }

  // 頂上
  const goalY = topY;
  platforms.push(makePlatform('grass_wide', VIEW_W / 2, goalY, { goal: true }));
  props.push({ img: 'prop_flag', x: VIEW_W / 2 - 40, y: goalY, s: 1.1 });
  props.push({ img: 'prop_checkpoint_flag', x: VIEW_W / 2 + 70, y: goalY - 20, s: 1 });
  props.push({ img: 'prop_chest', x: VIEW_W / 2 + 160, y: goalY, s: 0.8 });

  // 背景装飾の配置（視差レイヤーに載せる）
  const scenery = [];
  for (let i = 0; i < 7; i++) {
    scenery.push({ img: 'bg_waterfall', x: 60 + rnd() * (VIEW_W - 120), y: topY * (0.1 + rnd() * 0.85), s: 0.7 + rnd() * 0.5, par: 0.5 });
  }
  for (let i = 0; i < 5; i++) {
    scenery.push({ img: 'bg_ruins_decoration', x: rnd() * VIEW_W, y: topY * (0.5 + rnd() * 0.45), s: 0.7, par: 0.8 });
  }
  for (let i = 0; i < 8; i++) {
    scenery.push({ img: 'bg_vines', x: rnd() * VIEW_W, y: topY * (0.15 + rnd() * 0.8), s: 0.8, par: 0.9 });
  }

  return {
    platforms: platforms, props: props, coins: coins, crystals: crystals,
    chests: chests, scenery: scenery,
    goalY: goalY, topY: topY,
    spawn: { x: VIEW_W / 2, y: -60 }
  };
}

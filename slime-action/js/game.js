/* ===========================================================
   game.js — スライム・スリング アドベンチャー
   配布された素材シートの絵をそのまま使って描画し、
   物理と当たり判定だけをここで扱う。
   =========================================================== */
'use strict';

(function () {

  const W = VIEW_W, H = VIEW_H;
  const GRAV = 2200;
  const MAX_PULL = 250;
  const MIN_PULL = 24;
  const LAUNCH_MIN = 420;
  const LAUNCH_MAX = 1620;
  const HIT_SPEED = 320;
  const R = 36;                       // スライムの当たり判定の半径

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- 効果音（音声ファイルは使わない） ---------------- */
  const Sfx = (function () {
    let ac = null, on = true;
    function ensure() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ac) ac = new AC();
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f0, f1, dur, type, vol) {
      if (!on) return;
      const a = ensure(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), a.currentTime + dur);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, a.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    return {
      launch: p => tone(250 + p * 210, 640 + p * 330, 0.2, 'sine', 0.09),
      land: v => tone(170, 80, 0.12, 'sine', Math.min(0.09, v / 14000)),
      hit: () => tone(230, 90, 0.16, 'triangle', 0.13),
      defeat: () => { tone(520, 880, 0.24, 'sine', 0.09); setTimeout(() => tone(760, 1150, 0.2, 'sine', 0.07), 90); },
      coin: () => tone(880, 1320, 0.14, 'sine', 0.07),
      crystal: () => tone(660, 1480, 0.26, 'sine', 0.07),
      hurt: () => tone(320, 110, 0.3, 'sawtooth', 0.08),
      special: () => tone(180, 820, 0.4, 'triangle', 0.1),
      heal: () => tone(520, 980, 0.24, 'sine', 0.08),
      clear: () => [0, 130, 260, 430].forEach((d, i) => setTimeout(() => tone(523 * Math.pow(1.12, i * 2), 1200, 0.3, 'sine', 0.08), d)),
      toggle: function () { on = !on; if (on) ensure(); return on; },
      isOn: () => on
    };
  })();

  /* ---------------- 画面 ---------------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.round(r.width * dpr));
    canvas.height = Math.max(2, Math.round(r.height * dpr));
    scale = canvas.width / W;
  }
  window.addEventListener('resize', resize);

  /* ---------------- 状態 ---------------- */
  const G = {
    mode: 'title',
    stageIndex: 0, stage: null,
    player: null,
    cam: { x: 0, y: 0 },
    fx: [], floaters: [], shocks: [], scenery: [],
    t: 0, shake: 0,
    hearts: 4, maxHearts: 4,
    coins: 0, crystals: 0,
    killed: 0, launches: 0,
    special: 0, specialArmed: false,
    aiming: false, aimPt: { x: 0, y: 0 },
    checkpoint: null, fallFxT: 0, hudT: 0, keys: 0, smileT: 0, trailT: 0,
    lastDir: { x: 0.8, y: -0.6 },
    castle: null
  };

  const el = {
    hud: document.getElementById('hud'),
    hearts: document.getElementById('hearts'),
    spFill: document.getElementById('spFill'),
    stageNo: document.getElementById('stageNo'),
    stageName: document.getElementById('stageName'),
    kill: document.getElementById('killCount'),
    killTotal: document.getElementById('killTotal'),
    coin: document.getElementById('coinCount'),
    crystal: document.getElementById('crystalCount'),
    height: document.getElementById('heightNow'),
    pull: document.getElementById('pullGauge'),
    pullFill: document.getElementById('pullFill'),
    btnSpecial: document.getElementById('btnSpecial'),
    btnHeal: document.getElementById('btnHeal'),
    btnLaunch: document.getElementById('btnLaunch'),
    keyChip: document.getElementById('keyChip'),
    keyCount: document.getElementById('keyCount'),
    chestCount: document.getElementById('chestCount'),
    chestTotal: document.getElementById('chestTotal'),
    stageProgress: document.getElementById('stageProgress'),
    btnPause: document.getElementById('btnPause'),
    btnSound: document.getElementById('btnSound'),
    toast: document.getElementById('toast'),
    intro: document.getElementById('intro'),
    mini: document.getElementById('minimap'),
    title: document.getElementById('titleScreen'),
    btnStart: document.getElementById('btnStart'),
    panel: document.getElementById('panelScreen'),
    panelTitle: document.getElementById('panelTitle'),
    panelStats: document.getElementById('panelStats'),
    btnPrimary: document.getElementById('btnPrimary'),
    btnSecondary: document.getElementById('btnSecondary'),
    loading: document.getElementById('loading'),
    loadBar: document.getElementById('loadBar')
  };
  const miniCtx = el.mini.getContext('2d');

  /* HUD のハートとゲージを、素材の板の絵に合わせて置く */
  function placeHudOverlays() {
    const a = UI_ANCHORS.status_panel;
    const hb = a.hearts, bar = BAR_STYLE.rect;
    const pc = function (v, total) { return (v / total * 100) + '%'; };
    el.hearts.style.left = pc(hb[0], a.w);
    el.hearts.style.top = pc(hb[1], a.h);
    el.hearts.style.width = pc(hb[2] - hb[0], a.w);
    el.hearts.style.height = pc(hb[3] - hb[1], a.h);
    const g = el.spFill.parentNode;
    g.style.left = pc(bar[0], a.w);
    g.style.top = pc(bar[1], a.h);
    g.style.width = pc(bar[2] - bar[0], a.w);
    g.style.height = pc(bar[3] - bar[1], a.h);
    g.style.background = BAR_STYLE.track;
    el.spFill.style.background = BAR_STYLE.fill;
  }

  function buildHearts() {
    el.hearts.innerHTML = '';
    for (let i = 0; i < G.maxHearts; i++) {
      const im = document.createElement('img');
      im.src = ASSET_FILES.ui_heart.src;
      im.alt = '';
      if (i >= G.hearts) im.className = 'lost';
      el.hearts.appendChild(im);
    }
  }
  function syncHud() {
    buildHearts();
    el.kill.textContent = String(G.killed);
    el.killTotal.textContent = '/' + G.stage.enemies.length;
    el.coin.textContent = String(G.coins);
    el.crystal.textContent = String(G.crystals);
    el.keyCount.textContent = String(G.keys);
    el.keyChip.classList.toggle('has', G.keys > 0);
    const chests = G.stage.chests || [];
    el.chestCount.textContent = String(chests.filter(function (c) { return c.opened; }).length);
    el.chestTotal.textContent = '/' + chests.length;
    el.spFill.style.width = G.special + '%';
    el.btnSpecial.classList.toggle('ready', G.special >= 100 || G.specialArmed);
    el.btnHeal.classList.toggle('ready', G.crystals >= 3 && G.hearts < G.maxHearts);
  }

  let toastT = 0;
  function toast(text, sec) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    toastT = sec || 2.2;
  }
  let introT = 0;
  function showIntro(sec) {
    el.intro.classList.add('show');
    introT = sec;
  }

  /* ---------------- ステージ ---------------- */
  function loadStage(index) {
    G.stageIndex = index;
    G.stage = buildStage(index);
    G.killed = 0; G.launches = 0;
    G.fx.length = 0; G.floaters.length = 0; G.shocks.length = 0;
    G.specialArmed = false;
    G.player = {
      x: G.stage.spawn.x, y: G.stage.spawn.y, vx: 0, vy: 0,
      grounded: false, stand: null, restT: 0, invT: 0,
      sprite: 'slime_idle', landT: 0, launchT: 0, blinkT: 2.4
    };
    G.cam.x = clamp(G.player.x - W * 0.4, 0, G.stage.width - W);
    G.cam.y = 0;
    G.mode = 'play';
    G.checkpoint = { x: G.stage.spawn.x, y: G.stage.spawn.y };

    const camEnd = Math.max(0, G.stage.width - W);
    G.castle = { x: W * 0.5 + camEnd * 0.42, y: 20, par: 0.42, s: 1.25 };

    const rnd = (function (seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })(G.stage.seed * 977);
    G.scenery = [];
    const farIslands = ['island_far_1', 'island_far_2', 'island_far_3', 'island_far_4'];
    for (let i = 0; i < 16; i++) {
      G.scenery.push({
        img: farIslands[Math.floor(rnd() * farIslands.length)],
        x: rnd() * G.stage.width, y: 60 + rnd() * 240,
        s: 1.1 + rnd() * 1.6, par: 0.22 + rnd() * 0.16
      });
    }
    const falls = ['waterfall_big', 'waterfall_mid', 'waterfall_small'];
    for (let i = 0; i < 7; i++) {
      G.scenery.push({
        img: falls[Math.floor(rnd() * falls.length)],
        x: rnd() * G.stage.width, y: 180 + rnd() * 120,
        s: 1.2 + rnd() * 1.1, par: 0.5
      });
    }
    G.scenery.sort(function (a, b) { return a.par - b.par; });

    el.stageNo.textContent = 'ステージ ' + G.stage.no;
    el.stageName.textContent = G.stage.name;
    el.title.classList.add('hidden');
    el.panel.classList.add('hidden');
    el.hud.classList.remove('hidden');
    syncHud();
    showIntro(2.6);
    toast(G.stage.hint, 3);
  }

  function newGame() {
    G.hearts = G.maxHearts;
    G.coins = 0; G.crystals = 0; G.special = 0; G.keys = 0;
    loadStage(0);
  }

  /* ---------------- エフェクト ---------------- */
  function addFx(img, x, y, opt) {
    const o = opt || {};
    G.fx.push({
      img: img, x: x, y: y, t: 0, life: o.life || 0.5,
      s0: o.s0 === undefined ? 0.8 : o.s0, s1: o.s1 === undefined ? 1.3 : o.s1,
      rot: o.rot || 0, alpha: o.alpha === undefined ? 1 : o.alpha,
      vx: o.vx || 0, vy: o.vy || 0
    });
  }
  function addFloater(x, y, text, color) {
    G.floaters.push({ x: x, y: y, text: text, color: color || '#ffffff', t: 0, life: 0.9 });
  }

  /* ---------------- 入力 ---------------- */
  function toWorld(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * W + G.cam.x,
      y: ((ev.clientY - r.top) / r.height) * H + G.cam.y
    };
  }
  function canAim() {
    return G.mode === 'play' && G.player.grounded && G.player.restT > 0.06;
  }
  function pull() {
    const p = G.player;
    let dx = p.x - G.aimPt.x, dy = p.y - G.aimPt.y;
    let len = Math.hypot(dx, dy);
    if (len < 0.001) { dx = 1; dy = 0; len = 0.001; }
    const power = clamp(len / MAX_PULL, 0, 1);
    return { dx: dx / len, dy: dy / len, len: len, power: power, speed: lerp(LAUNCH_MIN, LAUNCH_MAX, power) };
  }
  canvas.addEventListener('pointerdown', function (ev) {
    if (!canAim()) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    G.aiming = true;
    G.aimPt = toWorld(ev);
    el.pull.classList.add('active');
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (G.aiming) G.aimPt = toWorld(ev);
  });
  function release(ev) {
    if (!G.aiming) return;
    G.aiming = false;
    el.pull.classList.remove('active');
    const q = pull();
    if (q.len > MIN_PULL) {
      const p = G.player;
      const boost = G.specialArmed ? 1.25 : 1;
      p.vx = q.dx * q.speed * boost;
      p.vy = q.dy * q.speed * boost;
      p.grounded = false; p.stand = null;
      p.launchT = 0.3; p.restT = 0;
      G.lastDir = { x: q.dx, y: q.dy };
      G.launches++;
      if (!G.specialArmed) gainSpecial(5);
      addFx('fx_swoosh', p.x, p.y, { life: 0.3, s0: 0.8, s1: 1.4, rot: Math.atan2(p.vy, p.vx) + Math.PI });
      Sfx.launch(q.power);
    }
    if (ev && ev.pointerId !== undefined && canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------------- 物理 ---------------- */
  function collidePlatforms(p, dt) {
    p.grounded = false;
    const ps = G.stage.platforms;
    for (let i = 0; i < ps.length; i++) {
      const pl = ps[i];
      if (p.x + R < pl.x || p.x - R > pl.x + pl.w) continue;
      if (p.y + R < pl.y || p.y - R > pl.y + pl.h) continue;
      const cx = clamp(p.x, pl.x, pl.x + pl.w);
      const cy = clamp(p.y, pl.y, pl.y + pl.h);
      let dx = p.x - cx, dy = p.y - cy;
      let d = Math.hypot(dx, dy);
      let nx, ny, push;
      if (d > 0.0001) { nx = dx / d; ny = dy / d; push = R - d; }
      else {
        const toL = p.x - pl.x, toR = pl.x + pl.w - p.x, toT = p.y - pl.y, toB = pl.y + pl.h - p.y;
        const m = Math.min(toL, toR, toT, toB);
        if (m === toT) { nx = 0; ny = -1; push = R + toT; }
        else if (m === toB) { nx = 0; ny = 1; push = R + toB; }
        else if (m === toL) { nx = -1; ny = 0; push = R + toL; }
        else { nx = 1; ny = 0; push = R + toR; }
      }
      p.x += nx * push; p.y += ny * push;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        const rest = pl.bouncy ? 1.05 : (Math.abs(vn) > 160 ? 0.44 : 0.16);
        const tvx = p.vx - vn * nx, tvy = p.vy - vn * ny;
        p.vx = tvx * 0.9 - vn * nx * rest;
        p.vy = tvy * 0.9 - vn * ny * rest;
        if (Math.abs(vn) > 230) {
          p.landT = 0.22;
          if (Math.abs(vn) > 760) {
            addFx('fx_splash', p.x, pl.y, { life: 0.45, s0: 0.5, s1: 1.1 });
            addFx('fx_ripple', p.x, pl.y + 6, { life: 0.5, s0: 0.6, s1: 1.3, alpha: 0.8 });
            G.shake = Math.min(12, Math.abs(vn) / 150);
          } else {
            addFx('fx_star', p.x + 24, pl.y - 14, { life: 0.4, s0: 0.5, s1: 1 });
            addFx('fx_ripple_s', p.x, pl.y + 4, { life: 0.4, s0: 0.6, s1: 1.2, alpha: 0.7 });
          }
          if (pl.bouncy) addFx('fx_water', p.x, pl.y, { life: 0.5, s0: 0.5, s1: 1.2, alpha: 0.9 });
          Sfx.land(Math.abs(vn));
        }
      }
      if (ny < -0.5) {
        p.grounded = true; p.stand = pl;
        if (pl.checkpoint && (!G.checkpoint || G.checkpoint.y !== pl.y - R)) {
          G.checkpoint = { x: pl.cx, y: pl.y - R - 2 };
          addFx('fx_star', pl.cx, pl.y - 70, { life: 0.9, s0: 0.6, s1: 1.6 });
          toast('チェックポイント！', 1.6);
          Sfx.heal();
        }
      }
    }
    if (p.grounded) p.vx -= p.vx * Math.min(1, 2.4 * dt);
  }

  function updatePlatforms() {
    const ps = G.stage.platforms;
    for (let i = 0; i < ps.length; i++) {
      const pl = ps[i];
      if (!pl.moveAmp) continue;
      const nx = pl.baseCx + Math.sin(G.t * pl.moveSpd + pl.movePhase) * pl.moveAmp;
      pl.dx = nx - pl.cx;
      pl.cx = nx;
      pl.x += pl.dx;
      if (G.player.grounded && G.player.stand === pl) G.player.x += pl.dx;
    }
  }

  /* ---------------- 敵 ---------------- */
  function enemyRect(e) {
    const s = e.spec, sc = s.scale;
    return { x: e.x - s.w * sc / 2, y: e.y - s.h * sc, w: s.w * sc, h: s.h * sc };
  }
  function circleHitsRect(cx, cy, r, R2) {
    const px = clamp(cx, R2.x, R2.x + R2.w);
    const py = clamp(cy, R2.y, R2.y + R2.h);
    const dx = cx - px, dy = cy - py;
    return dx * dx + dy * dy < r * r;
  }
  function damageEnemy(e, dmg, fromX) {
    e.hp -= dmg;
    e.hitT = 0.2; e.hitCd = 0.22;
    e.x += (e.x > fromX ? 1 : -1) * (e.type === 'boss' ? 6 : 16);
    addFloater(e.x, e.y - e.spec.h * e.spec.scale - 26, String(dmg), dmg >= 4 ? '#ffd98a' : '#ffffff');
    addFx('fx_star', e.x, e.y - e.spec.h * e.spec.scale * 0.5, { life: 0.4, s0: 0.5, s1: 1.1 });
    G.shake = Math.min(16, G.shake + 4 + dmg);
    Sfx.hit();
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      G.killed++;
      gainSpecial(18);
      addFx('fx_splash', e.x, e.y - e.spec.h * e.spec.scale * 0.4, { life: 0.6, s0: 0.6, s1: 1.5 });
      addFloater(e.x, e.y - e.spec.h * e.spec.scale - 56, '+' + e.spec.exp, '#aee0ff');
      Sfx.defeat();
      syncHud();
      if (G.killed >= G.stage.enemies.length) setTimeout(stageClear, 650);
    }
  }
  function hurtPlayer(fromX) {
    const p = G.player;
    if (p.invT > 0 || G.mode !== 'play') return;
    G.hearts--;
    p.invT = 1.5;
    p.vx = (p.x > fromX ? 1 : -1) * 420;
    p.vy = -360;
    p.grounded = false; p.stand = null;
    G.shake = 12;
    Sfx.hurt();
    syncHud();
    if (G.hearts <= 0) gameOver();
  }

  function updateEnemies(dt) {
    const p = G.player;
    const es = G.stage.enemies;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.alive) continue;
      if (e.hitT > 0) e.hitT -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;
      if (e.squashT > 0) e.squashT -= dt;

      if (e.type === 'goblin') {
        const near = Math.abs(p.x - e.x) < 190 && Math.abs(p.y - e.y) < 170;
        e.attack = near ? 1 : 0;
        if (near) e.dir = p.x > e.x ? 1 : -1;
        else {
          e.x += e.dir * e.spec.speed * dt;
          if (e.x < e.patrol[0]) { e.x = e.patrol[0]; e.dir = 1; }
          if (e.x > e.patrol[1]) { e.x = e.patrol[1]; e.dir = -1; }
        }
      } else {
        e.hopT -= dt;
        if (e.hopT <= 0 && e.y >= e.baseY - 0.5) {
          e.vy = e.type === 'boss' ? -540 : -600;
          e.hopT = e.type === 'boss' ? 2.0 : 1.5;
          e.dir = p.x > e.x ? 1 : -1;
        }
        e.vy += GRAV * 0.8 * dt;
        e.y += e.vy * dt;
        if (e.y < e.baseY) e.x += e.dir * e.spec.speed * dt;
        if (e.y >= e.baseY) {
          if (e.vy > 200) e.squashT = 0.18;
          e.y = e.baseY; e.vy = 0;
        }
        if (e.x < e.patrol[0]) { e.x = e.patrol[0]; e.dir = 1; }
        if (e.x > e.patrol[1]) { e.x = e.patrol[1]; e.dir = -1; }
      }

      if (e.hitCd <= 0 && circleHitsRect(p.x, p.y, R, enemyRect(e))) {
        const sp = Math.hypot(p.vx, p.vy);
        if (G.specialArmed || sp > HIT_SPEED) {
          let dmg;
          if (G.specialArmed) {
            dmg = 9;
            G.specialArmed = false;
            G.shocks.push({ x: p.x, y: p.y, r: 30, max: 300, t: 0 });
            es.forEach(function (o) {
              if (o !== e && o.alive && Math.hypot(o.x - p.x, (o.y - o.spec.h * 0.5) - p.y) < 300) damageEnemy(o, 4, p.x);
            });
            syncHud();
          } else {
            dmg = 1 + Math.floor((sp - HIT_SPEED) / 380);
          }
          damageEnemy(e, dmg, p.x);
          const sgn = (p.x - e.x) > 0 ? 1 : -1;
          p.vx = sgn * Math.max(250, Math.abs(p.vx) * 0.5);
          p.vy = -Math.max(280, Math.abs(p.vy) * 0.45);
          p.grounded = false; p.stand = null;
        } else if (p.invT <= 0) {
          hurtPlayer(e.x);
        }
      }
    }
  }

  /* ---------------- 収集 ---------------- */
  function collect() {
    const p = G.player, st = G.stage;
    for (let i = 0; i < st.keys.length; i++) {
      const k = st.keys[i];
      if (k.got) continue;
      if (Math.hypot(k.x - p.x, k.y - p.y) < R + 26) {
        k.got = true; G.keys++;
        G.smileT = 0.6;
        addFx('fx_star', k.x, k.y, { life: 0.5, s0: 0.4, s1: 1.2 });
        toast('鍵を 手に入れた！ 宝箱を さがそう', 2.2);
        Sfx.coin(); syncHud();
      }
    }
    for (let i = 0; i < st.potions.length; i++) {
      const o = st.potions[i];
      if (o.got) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < R + 26) {
        o.got = true;
        G.smileT = 0.6;
        if (G.hearts < G.maxHearts) { G.hearts++; addFloater(o.x, o.y - 30, '+1', '#9fe7a0'); }
        else { G.crystals++; addFloater(o.x, o.y - 30, '+1', '#aee0ff'); }
        addFx('fx_star', o.x, o.y, { life: 0.5, s0: 0.4, s1: 1.2 });
        Sfx.heal(); syncHud();
      }
    }
    for (let i = 0; i < st.chests.length; i++) {
      const c = st.chests[i];
      if (c.opened) continue;
      if (Math.abs(c.x - p.x) < 70 && Math.abs(c.y - 40 - p.y) < 80 && G.keys > 0) {
        c.opened = true; G.keys--; G.crystals += 3;
        G.smileT = 0.8;
        addFx('fx_star', c.x, c.y - 50, { life: 0.8, s0: 0.5, s1: 1.6 });
        addFx('fx_splash', c.x, c.y - 20, { life: 0.6, s0: 0.5, s1: 1.2, alpha: 0.8 });
        toast('宝箱から 結晶を 3つ 見つけた！', 2.2);
        Sfx.crystal(); syncHud();
      }
    }
    for (let i = 0; i < st.coins.length; i++) {
      const c = st.coins[i];
      if (c.got) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < R + 26) {
        c.got = true; G.coins++; G.smileT = 0.35;
        addFx('fx_star', c.x, c.y, { life: 0.35, s0: 0.4, s1: 0.9 });
        Sfx.coin(); syncHud();
      }
    }
    for (let i = 0; i < st.crystals.length; i++) {
      const c = st.crystals[i];
      if (c.got) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < R + 28) {
        c.got = true; G.crystals++;
        addFx('fx_star', c.x, c.y, { life: 0.5, s0: 0.4, s1: 1.2 });
        Sfx.crystal(); syncHud();
      }
    }
  }
  function gainSpecial(v) {
    if (G.specialArmed) return;
    G.special = clamp(G.special + v, 0, 100);
    syncHud();
  }
  function armSpecial() {
    if (G.special < 100 || G.specialArmed || G.mode !== 'play') return;
    G.specialArmed = true;
    G.special = 0;
    toast('スペシャル！ つぎの一撃が 強くなる', 2.2);
    Sfx.special();
    syncHud();
  }
  function heal() {
    if (G.mode !== 'play' || G.crystals < 3 || G.hearts >= G.maxHearts) return;
    G.crystals -= 3;
    G.hearts++;
    addFloater(G.player.x, G.player.y - 60, '+1', '#9fe7a0');
    addFx('fx_star', G.player.x, G.player.y, { life: 0.6, s0: 0.4, s1: 1.2 });
    Sfx.heal();
    syncHud();
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('show'); }
    if (introT > 0) { introT -= dt; if (introT <= 0) el.intro.classList.remove('show'); }

    if (G.mode === 'play') {
      const p = G.player;
      updatePlatforms();
      if (!G.aiming) {
        p.vy += GRAV * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        collidePlatforms(p, dt);
      }
      p.x = clamp(p.x, R, G.stage.width - R);

      const sp = Math.hypot(p.vx, p.vy);
      if (p.grounded && sp < 48) p.restT += dt; else p.restT = 0;
      if (p.invT > 0) p.invT -= dt;
      if (p.landT > 0) p.landT -= dt;
      if (p.launchT > 0) p.launchT -= dt;
      p.blinkT -= dt;
      if (p.blinkT < -0.16) p.blinkT = 2.4 + Math.random() * 2;

      if (G.smileT > 0) G.smileT -= dt;
      let s = 'slime_idle';
      if (G.aiming) s = 'slime_drag';
      else if (G.smileT > 0 && p.grounded) s = 'slime_happy';
      else if (p.launchT > 0) s = 'slime_launch';
      else if (p.landT > 0) s = 'slime_stretch';
      else if (!p.grounded && p.vy < -140) s = (sp > 900 ? 'slime_fly_long' : 'slime_fly');
      else if (!p.grounded && p.vy > 280) s = 'slime_fall';
      else if (p.grounded && p.blinkT < 0) s = 'slime_blink';
      else if (p.grounded && G.specialArmed) s = 'slime_laugh';
      else if (p.grounded && Math.sin(G.t * 0.7) > 0.86) s = 'slime_smile';
      p.sprite = s;

      if (!p.grounded && sp > 1150) {
        G.trailT -= dt;
        if (G.trailT <= 0) {
          G.trailT = 0.055;
          addFx('fx_comet', p.x - p.vx * 0.02, p.y - p.vy * 0.02, {
            life: 0.26, s0: 0.7, s1: 0.95, alpha: 0.5, rot: Math.atan2(p.vy, p.vx)
          });
        }
      }
      if (!p.grounded && p.vy > 650) {
        G.fallFxT -= dt;
        if (G.fallFxT <= 0) {
          G.fallFxT = 0.1;
          addFx('fx_swoosh_s', p.x + (Math.random() - 0.5) * 30, p.y - 60, {
            life: 0.3, s0: 0.7, s1: 1, alpha: 0.6, rot: Math.PI / 2
          });
        }
      }

      G.hudT -= dt;
      if (G.hudT <= 0) {
        G.hudT = 0.08;
        el.height.textContent = String(Math.max(0, Math.round((G.stage.groundY - p.y) / 48)));
      }

      updateEnemies(dt);
      collect();

      if (p.y > G.stage.deathY) {
        G.hearts--;
        Sfx.hurt();
        syncHud();
        if (G.hearts <= 0) gameOver();
        else {
          toast('落ちてしまった…', 1.6);
          const cp = G.checkpoint || G.stage.spawn;
          p.x = cp.x; p.y = cp.y;
          p.vx = 0; p.vy = 0; p.invT = 1.3;
          p.grounded = false; p.stand = null;
        }
      }
    }

    const tx = clamp(G.player.x - W * 0.42, 0, Math.max(0, G.stage.width - W));
    const ty = clamp((G.player.y - 420) * 0.45, -180, 150);
    G.cam.x = lerp(G.cam.x, tx, Math.min(1, dt * 4.6));
    G.cam.y = lerp(G.cam.y, ty, Math.min(1, dt * 3.4));
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);

    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.t >= f.life) G.fx.splice(i, 1);
    }
    for (let i = G.floaters.length - 1; i >= 0; i--) {
      const f = G.floaters[i];
      f.t += dt; f.y -= 44 * dt;
      if (f.t >= f.life) G.floaters.splice(i, 1);
    }
    for (let i = G.shocks.length - 1; i >= 0; i--) {
      const s = G.shocks[i];
      s.t += dt;
      s.r = lerp(30, s.max, Math.min(1, s.t / 0.4));
      if (s.t > 0.45) G.shocks.splice(i, 1);
    }

    el.pullFill.style.width = (G.aiming ? pull().power * 100 : 0) + '%';
  }

  /* ---------------- 描画 ---------------- */
  function img(name) {
    const im = IMG[name];
    return (im && im.width) ? im : null;
  }

  /* 画像を置く。anchor: 'bottom'（足元中央） / 'center' / 'head'（頭の位置） */
  function put(name, x, y, opt) {
    const im = img(name);
    if (!im) return;
    const a = ASSET_FILES[name];
    const o = opt || {};
    const s = (o.scale === undefined ? ART : o.scale);
    const dw = a.w * s, dh = a.h * s;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    let ax = dw / 2, ay = dh;                      // bottom
    if (o.anchor === 'center') { ay = dh / 2; }
    else if (o.anchor === 'head') {
      const an = SPRITE_ANCHORS[name];
      if (an) { ax = an.head[0] * s; ay = an.head[1] * s; }
      else ay = dh / 2;
    }
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.flipX) ctx.scale(-1, 1);
    if (o.flipY) ctx.scale(1, -1);
    ctx.drawImage(im, -ax, -ay, dw, dh);
    ctx.restore();
  }

  let skyTile = null;
  function buildSkyTile() {
    const im = img('sky_strip');
    if (!im) return;
    const a = ASSET_FILES.sky_strip;
    const s = 3.6;
    const w = Math.round(a.w * s), h = Math.round(a.h * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0, w, h);
    x.globalCompositeOperation = 'destination-in';
    const grad = x.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.28, 'rgba(0,0,0,1)');
    grad.addColorStop(0.72, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, w, h);
    skyTile = c;
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, SKY_COLORS[0]);
    g.addColorStop(0.45, SKY_COLORS[1]);
    g.addColorStop(0.75, SKY_COLORS[2]);
    g.addColorStop(1, SKY_COLORS[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 遠景の空の帯（素材シートの空の絵。上下をぼかして継ぎ目を消す）
    if (!skyTile) buildSkyTile();
    if (skyTile) {
      const sw = skyTile.width, sh = skyTile.height;
      const off = -(G.cam.x * 0.08) % sw;
      const y = 120 - G.cam.y * 0.05;
      ctx.save();
      ctx.globalAlpha = 0.8;
      for (let x = off - sw; x < W + sw; x += sw) {
        ctx.drawImage(skyTile, x, y - sh / 2);
      }
      ctx.restore();
    }

    // 浮島・滝
    for (let i = 0; i < G.scenery.length; i++) {
      const s = G.scenery[i];
      const a = ASSET_FILES[s.img];
      const x = s.x - G.cam.x * s.par;
      if (x < -200 || x > W + 200) continue;
      put(s.img, x, s.y - G.cam.y * s.par, {
        anchor: 'center', scale: s.s, alpha: 0.55 + s.par * 0.6
      });
    }

    // 遠景の城
    if (G.castle) {
      const x = G.castle.x - G.cam.x * G.castle.par;
      if (x > -520 && x < W + 520) {
        put('castle_island', x, G.castle.y - G.cam.y * G.castle.par, {
          anchor: 'center', scale: G.castle.s, alpha: 0.95
        });
      }
    }
  }

  function drawStage() {
    const st = G.stage;
    for (let i = 0; i < st.platforms.length; i++) {
      const pl = st.platforms[i];
      const x = pl.cx + pl.drawDx;
      if (x > G.cam.x + W + 260 || x + pl.drawW < G.cam.x - 260) continue;
      let alpha = 1;
      if (pl.fragile && pl.fallT > 0) alpha = 0.5 + 0.5 * Math.abs(Math.sin(pl.fallT * 26));
      const im = img(pl.img);
      if (im) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(im, x, pl.y + pl.drawDy, pl.drawW, pl.drawH);
        ctx.restore();
      }
    }
    for (let i = 0; i < st.props.length; i++) {
      const d = st.props[i];
      if (d.x > G.cam.x + W + 240 || d.x < G.cam.x - 240) continue;
      put(d.img, d.x, d.y + 6, { scale: ART * d.s });
    }
    for (let i = 0; i < st.chests.length; i++) {
      const c = st.chests[i];
      put('chest', c.x, c.y + 6, { scale: ART, alpha: c.opened ? 0.45 : 1 });
      if (!c.opened && G.keys > 0) {
        put('ui_diamond', c.x, c.y - 90 + Math.sin(G.t * 3) * 6, { anchor: 'center', scale: ART * 1.1, alpha: 0.95 });
      }
    }
    for (let i = 0; i < st.keys.length; i++) {
      const k = st.keys[i];
      if (k.got) continue;
      put('ui_key', k.x, k.y + Math.sin(G.t * 2.6) * 6, { anchor: 'center', scale: ART * 1.1 });
    }
    for (let i = 0; i < st.potions.length; i++) {
      const o = st.potions[i];
      if (o.got) continue;
      put('ui_potion', o.x, o.y + Math.sin(G.t * 2.9 + 1) * 6, { anchor: 'center', scale: ART * 1.1 });
    }
    for (let i = 0; i < st.coins.length; i++) {
      const c = st.coins[i];
      if (c.got) continue;
      put('ui_coin', c.x, c.y + Math.sin(G.t * 3 + c.ph) * 5, { anchor: 'center', scale: ART * 0.9 });
    }
    for (let i = 0; i < st.crystals.length; i++) {
      const c = st.crystals[i];
      if (c.got) continue;
      put('ui_gem', c.x, c.y + Math.sin(G.t * 2.4 + c.ph) * 6, { anchor: 'center', scale: ART * 0.95 });
    }
  }

  function drawEnemies() {
    const es = G.stage.enemies;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.alive) continue;
      if (e.x > G.cam.x + W + 240 || e.x < G.cam.x - 240) continue;
      const s = e.spec;
      const fi = Math.floor(G.t * s.anim + e.phase) % s.frames.length;
      const name = s.frames[e.attack ? (fi % 2 ? 0 : 3) : fi];
      ctx.save();
      if (e.hitT > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.hitT * 60);
      put(name, e.x, e.y + 4, { scale: ART * s.scale, flipX: e.dir < 0 });
      ctx.restore();
      if (e.attack) {
        put('ui_exclaim', e.x, e.y - s.h * s.scale - 48 + Math.sin(G.t * 9) * 4,
          { anchor: 'center', scale: ART * 0.9 });
      }

      // 体力バー（枠の色は素材のゲージに合わせる）
      const bw = s.barW * (s.scale > 1 ? 1.3 : 1), bh = 9;
      const by = e.y - s.h * s.scale - 20;
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,34,.8)';
      ctx.strokeStyle = 'rgba(190,220,250,.5)';
      ctx.lineWidth = 1.6;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(e.x - bw / 2, by, bw, bh, bh / 2); ctx.fill(); ctx.stroke(); }
      else ctx.fillRect(e.x - bw / 2, by, bw, bh);
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      if (ratio > 0) {
        const grad = ctx.createLinearGradient(0, by, 0, by + bh);
        grad.addColorStop(0, '#f78a7f');
        grad.addColorStop(1, '#c32f2c');
        ctx.fillStyle = grad;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(e.x - bw / 2 + 2, by + 2, Math.max(2, (bw - 4) * ratio), bh - 4, (bh - 4) / 2); ctx.fill(); }
        else ctx.fillRect(e.x - bw / 2 + 2, by + 2, Math.max(2, (bw - 4) * ratio), bh - 4);
      }
      ctx.restore();
    }
  }

  function drawAim() {
    if (!G.aiming) return;
    const p = G.player;
    const q = pull();
    if (q.len <= MIN_PULL) return;
    let px = p.x, py = p.y, vx = q.dx * q.speed, vy = q.dy * q.speed;
    const dt = 1 / 60;
    let last = null;
    for (let i = 0; i < 64; i++) {
      vy += GRAV * dt;
      px += vx * dt; py += vy * dt;
      if (i % 5 === 0) {
        const t = i / 64;
        put('fx_dash', px, py, {
          anchor: 'center', scale: ART * (1.25 - t * 0.5), alpha: (1 - t) * 0.95,
          rot: Math.atan2(vy, vx)
        });
        last = { x: px, y: py, rot: Math.atan2(vy, vx) };
      }
      let hit = false;
      const ps = G.stage.platforms;
      for (let k = 0; k < ps.length; k++) {
        const pl = ps[k];
        if (px > pl.x - 6 && px < pl.x + pl.w + 6 && py + R > pl.y && py < pl.y + pl.h) { hit = true; break; }
      }
      if (hit || py > G.stage.deathY) break;
    }
    if (last) put('fx_arrow', last.x, last.y, { anchor: 'center', scale: ART * 1.1, rot: last.rot, alpha: 0.95 });
  }

  function drawPlayer() {
    const p = G.player;
    const name = p.sprite;
    ctx.save();
    if (p.invT > 0) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(p.invT * 26));
    if (G.specialArmed) {
      const g = ctx.createRadialGradient(p.x, p.y, R * 0.5, p.x, p.y, R * 2.4);
      g.addColorStop(0, 'rgba(190,232,255,.5)');
      g.addColorStop(1, 'rgba(190,232,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    if (name === 'slime_drag') {
      const ang = Math.atan2(G.aimPt.y - p.y, G.aimPt.x - p.x);
      const flipY = Math.abs(ang) > Math.PI / 2;
      put(name, p.x, p.y, { anchor: 'head', rot: ang, flipY: flipY, scale: ART * 0.9 });
    } else if (name === 'slime_launch' || name === 'slime_fly' || name === 'slime_fly_long') {
      const ang = Math.atan2(p.vy, p.vx);
      const flipY = Math.abs(ang) > Math.PI / 2;
      put(name, p.x, p.y, { anchor: 'head', rot: ang, flipY: flipY, scale: ART * 0.95 });
    } else if (name === 'slime_fall') {
      put(name, p.x, p.y, { anchor: 'center', scale: ART });
    } else if (name === 'slime_stretch') {
      put(name, p.x, p.y + R, { anchor: 'bottom', scale: ART * 0.8 });
    } else {
      put(name, p.x, p.y + R, { anchor: 'bottom', scale: ART });
    }
    ctx.restore();
  }

  function drawFxLayer() {
    for (let i = 0; i < G.shocks.length; i++) {
      const s = G.shocks[i];
      const al = 1 - s.t / 0.45;
      put('fx_water', s.x, s.y, { anchor: 'center', scale: s.r / 60, alpha: al * 0.9 });
    }
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      const t = f.t / f.life;
      put(f.img, f.x, f.y, {
        anchor: 'center', scale: ART * lerp(f.s0, f.s1, t),
        alpha: (1 - t) * f.alpha, rot: f.rot
      });
    }
    ctx.textAlign = 'center';
    for (let i = 0; i < G.floaters.length; i++) {
      const f = G.floaters[i];
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - f.t / f.life) * 1.6);
      ctx.font = '700 28px "Hiragino Maru Gothic ProN", sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(12,28,48,.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  function drawMinimap() {
    const size = el.mini.width;
    miniCtx.clearRect(0, 0, size, size);
    const st = G.stage;
    const cx = size / 2, cy = size / 2, rad = size * 0.33;
    const half = W * 1.4;
    function place(wx, wy) {
      const dx = (wx - G.player.x) / half * rad;
      const dy = (wy - G.player.y) / (half * 0.55) * rad;
      return [cx + dx, cy + dy * 0.6];
    }
    st.enemies.forEach(function (e) {
      if (!e.alive) return;
      const q = place(e.x, e.y);
      if (Math.hypot(q[0] - cx, q[1] - cy) > rad * 1.15) return;
      miniCtx.fillStyle = e.type === 'boss' ? '#f0b24a' : '#e3564f';
      miniCtx.beginPath();
      miniCtx.arc(q[0], q[1], e.type === 'boss' ? 5 : 3.4, 0, Math.PI * 2);
      miniCtx.fill();
    });
    miniCtx.fillStyle = '#9fe0ff';
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, 4.4, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.strokeStyle = 'rgba(255,255,255,.85)';
    miniCtx.lineWidth = 1.5;
    miniCtx.stroke();
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    ctx.save();
    const sx = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    const sy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.translate(-G.cam.x + sx, -G.cam.y + sy);
    drawStage();
    drawEnemies();
    drawAim();
    drawFxLayer();
    drawPlayer();
    ctx.restore();
    if (G.mode === 'play') drawMinimap();
  }

  /* ---------------- 画面遷移 ---------------- */
  function stageClear() {
    if (G.mode !== 'play') return;
    G.mode = 'clear';
    const last = G.stageIndex >= STAGES.length - 1;
    el.panel.classList.remove('hidden');
    el.panelTitle.textContent = last ? 'ぜんステージ クリア！' : 'ステージクリア';
    el.panelStats.innerHTML =
      '<div>たおした数<b>' + G.killed + '</b></div>' +
      '<div>はじいた回数<b>' + G.launches + '</b></div>' +
      '<div>コイン<b>' + G.coins + '</b></div>' +
      '<div>結晶<b>' + G.crystals + '</b></div>';
    el.stageProgress.style.clipPath = 'inset(0 ' + (100 - (G.stageIndex + 1) / 4 * 100) + '% 0 0)';
    el.btnPrimary.querySelector('span').textContent = last ? 'はじめから' : 'つぎのステージへ';
    el.btnSecondary.querySelector('span').textContent = 'もう一度';
    Sfx.clear();
  }
  function gameOver() {
    if (G.mode !== 'play') return;
    G.mode = 'over';
    el.panel.classList.remove('hidden');
    el.panelTitle.textContent = 'ちからつきた…';
    el.panelStats.innerHTML =
      '<div>たおした数<b>' + G.killed + '</b></div>' +
      '<div>コイン<b>' + G.coins + '</b></div>' +
      '<div>結晶<b>' + G.crystals + '</b></div>';
    el.btnPrimary.querySelector('span').textContent = 'やり直す';
    el.btnSecondary.querySelector('span').textContent = 'タイトルへ';
  }
  function showPause() {
    G.mode = 'pause';
    el.panel.classList.remove('hidden');
    el.panelTitle.textContent = '一時停止';
    el.panelStats.innerHTML =
      '<div>たおした数<b>' + G.killed + ' / ' + G.stage.enemies.length + '</b></div>' +
      '<div>コイン<b>' + G.coins + '</b></div>' +
      '<div>結晶<b>' + G.crystals + '</b></div>';
    el.stageProgress.style.clipPath = 'inset(0 ' + (100 - (G.stageIndex + 1) / 4 * 100) + '% 0 0)';
    el.btnPrimary.querySelector('span').textContent = 'つづける';
    el.btnSecondary.querySelector('span').textContent = 'タイトルへ';
  }

  function quickLaunch() {
    if (!canAim()) return;
    const p = G.player;
    const sp = lerp(LAUNCH_MIN, LAUNCH_MAX, 0.68) * (G.specialArmed ? 1.25 : 1);
    p.vx = G.lastDir.x * sp;
    p.vy = G.lastDir.y * sp;
    p.grounded = false; p.stand = null;
    p.launchT = 0.3; p.restT = 0;
    G.launches++;
    if (!G.specialArmed) gainSpecial(5);
    addFx('fx_swoosh', p.x, p.y, { life: 0.3, s0: 0.8, s1: 1.4, rot: Math.atan2(p.vy, p.vx) + Math.PI });
    Sfx.launch(0.68);
  }
  el.btnLaunch.addEventListener('click', quickLaunch);
  el.btnStart.addEventListener('click', newGame);
  el.btnSpecial.addEventListener('click', armSpecial);
  el.btnHeal.addEventListener('click', heal);
  el.btnPause.addEventListener('click', function () { if (G.mode === 'play') showPause(); });
  el.btnSound.addEventListener('click', function () {
    const on = Sfx.toggle();
    el.btnSound.textContent = on ? '音 ON' : '音 OFF';
    toast(on ? '効果音を ONにした' : '効果音を OFFにした', 1.4);
  });
  el.btnPrimary.addEventListener('click', function () {
    el.panel.classList.add('hidden');
    if (G.mode === 'pause') { G.mode = 'play'; return; }
    if (G.mode === 'clear') {
      if (G.stageIndex >= STAGES.length - 1) newGame();
      else { G.hearts = G.maxHearts; loadStage(G.stageIndex + 1); }
    } else {
      G.hearts = G.maxHearts;
      loadStage(G.stageIndex);
    }
  });
  el.btnSecondary.addEventListener('click', function () {
    el.panel.classList.add('hidden');
    if (G.mode === 'clear') { G.hearts = G.maxHearts; loadStage(G.stageIndex); }
    else {
      G.mode = 'title';
      el.title.classList.remove('hidden');
      el.hud.classList.add('hidden');
    }
  });
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && G.mode === 'play') showPause();
    if (ev.key === 'e' || ev.key === 'E') armSpecial();
    if (ev.key === 'q' || ev.key === 'Q') heal();
  });

  /* ---------------- ループ ---------------- */
  let last = 0, acc = 0;
  const STEP = 1 / 120;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;
    if (G.mode === 'play') {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard < 12) { update(STEP); acc -= STEP; guard++; }
      if (guard >= 12) acc = 0;
    } else {
      G.t += dt;
      update(0);
    }
    render();
    requestAnimationFrame(frame);
  }

  /* ---------------- 起動 ---------------- */
  resize();
  placeHudOverlays();
  loadAssets(function (p) {
    el.loadBar.style.setProperty('--p', Math.round(p * 100) + '%');
  }).then(function () {
    el.loading.classList.add('done');
    el.hud.classList.add('hidden');
    G.stage = buildStage(0);
    G.player = { x: G.stage.spawn.x, y: G.stage.spawn.y, vx: 0, vy: 0, grounded: true, stand: null, restT: 1, sprite: 'slime_idle', landT: 0, launchT: 0, blinkT: 2, invT: 0 };
    G.scenery = [];
    G.cam.x = 0; G.cam.y = 0;
    buildHearts();
    requestAnimationFrame(frame);
  });

  window.__slimeAction = { G: G, newGame: newGame, loadStage: loadStage };
})();

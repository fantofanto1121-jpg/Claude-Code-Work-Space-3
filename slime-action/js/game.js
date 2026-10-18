/* ===========================================================
   game.js — スライム・スリング アドベンチャー（横スクロール）
   画像素材を読み込んで描画し、当たり判定と物理はここで管理する
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
  const SPR = 0.74;                 // スライム画像の表示倍率
  const R = 34;                     // スライムの当たり判定の半径

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- 効果音 ---------------- */
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
    fx: [], floaters: [], shocks: [],
    scenery: [],
    t: 0, shake: 0,
    hearts: 4, maxHearts: 4,
    coins: 0, crystals: 0,
    killed: 0, launches: 0,
    special: 0, specialArmed: false,
    aiming: false, aimPt: { x: 0, y: 0 }
  };

  const el = {
    hud: document.getElementById('hud'),
    hearts: document.getElementById('hearts'),
    spFill: document.querySelector('#spGauge .fillbox'),
    stageNo: document.getElementById('stageNo'),
    stageName: document.getElementById('stageName'),
    kill: document.getElementById('killCount'),
    killTotal: document.getElementById('killTotal'),
    coin: document.getElementById('coinCount'),
    crystal: document.getElementById('crystalCount'),
    pullFill: document.querySelector('#pullGauge .fillbox'),
    pullGauge: document.getElementById('pullGauge'),
    btnSpecial: document.getElementById('btnSpecial'),
    btnHeal: document.getElementById('btnHeal'),
    btnPause: document.getElementById('btnPause'),
    btnSettings: document.getElementById('btnSettings'),
    toast: document.getElementById('toast'),
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

  function buildHearts() {
    el.hearts.innerHTML = '';
    for (let i = 0; i < G.maxHearts; i++) {
      const im = document.createElement('img');
      im.src = ASSET_FILES[i < G.hearts ? 'ui_heart_full' : 'ui_heart_empty'].src;
      im.alt = '';
      el.hearts.appendChild(im);
    }
  }
  function syncHud() {
    buildHearts();
    el.kill.textContent = String(G.killed);
    el.killTotal.textContent = '/' + G.stage.enemies.length;
    el.coin.textContent = String(G.coins);
    el.crystal.textContent = String(G.crystals);
    el.spFill.style.width = (G.special / 100 * 15.7) + 'cqw';
    el.btnSpecial.classList.toggle('ready', G.special >= 100 || G.specialArmed);
    el.btnHeal.classList.toggle('ready', G.crystals >= 3 && G.hearts < G.maxHearts);
  }

  let toastT = 0;
  function toast(text, sec) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    toastT = sec || 2.2;
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
      sprite: 'slime_idle', ang: 0, landT: 0, launchT: 0, blinkT: 2.4
    };
    G.cam.x = clamp(G.player.x - W * 0.4, 0, G.stage.width - W);
    G.cam.y = 0;
    G.mode = 'play';

    // 背景装飾をステージごとに配置
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
    for (let i = 0; i < 6; i++) {
      G.scenery.push({ img: 'bg_waterfall', x: rnd() * G.stage.width, y: 150 + rnd() * 90, s: 0.5 + rnd() * 0.4, par: 0.55 });
    }
    for (let i = 0; i < 4; i++) {
      G.scenery.push({ img: 'bg_ruins_decoration', x: rnd() * G.stage.width, y: 360 + rnd() * 70, s: 0.55, par: 0.68 });
    }
    for (let i = 0; i < 5; i++) {
      G.scenery.push({ img: 'bg_vines', x: rnd() * G.stage.width, y: -40, s: 0.55, par: 0.82 });
    }

    el.stageNo.textContent = 'ステージ ' + G.stage.no;
    el.stageName.textContent = G.stage.name;
    el.title.classList.add('hidden');
    el.panel.classList.add('hidden');
    el.hud.classList.remove('hidden');
    syncHud();
    toast(G.stage.hint, 3);
  }

  function newGame() {
    G.hearts = G.maxHearts;
    G.coins = 0; G.crystals = 0; G.special = 0;
    loadStage(0);
  }

  /* ---------------- エフェクト ---------------- */
  function addFx(img, x, y, opt) {
    const o = opt || {};
    G.fx.push({
      img: img, x: x, y: y, t: 0, life: o.life || 0.5,
      s0: o.s0 === undefined ? 0.6 : o.s0, s1: o.s1 === undefined ? 1.1 : o.s1,
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
    el.pullGauge.classList.add('active');
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (G.aiming) G.aimPt = toWorld(ev);
  });
  function release(ev) {
    if (!G.aiming) return;
    G.aiming = false;
    el.pullGauge.classList.remove('active');
    const q = pull();
    if (q.len > MIN_PULL) {
      const p = G.player;
      const boost = G.specialArmed ? 1.25 : 1;
      p.vx = q.dx * q.speed * boost;
      p.vy = q.dy * q.speed * boost;
      p.grounded = false; p.stand = null;
      p.launchT = 0.26; p.restT = 0;
      G.launches++;
      if (!G.specialArmed) gainSpecial(5);
      addFx('fx_launch_streak', p.x, p.y, { life: 0.3, s0: 0.6, s1: 1.1, rot: Math.atan2(p.vy, p.vx) + Math.PI });
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
        const tvx = p.vx - vn * nx, tvy = p.vy - vn * ny;
        const bouncy = pl.type === 'mushroom';
        const rest = bouncy ? 1.05 : (Math.abs(vn) > 160 ? 0.44 : 0.16);
        p.vx = tvx * 0.9 - vn * nx * rest;
        p.vy = tvy * 0.9 - vn * ny * rest;
        if (Math.abs(vn) > 230) {
          p.landT = 0.2;
          addFx(Math.abs(vn) > 760 ? 'fx_land_dust' : 'fx_land_star',
            p.x - nx * R, p.y - ny * R + 10, { life: 0.45, s0: 0.45, s1: 1.05 });
          if (bouncy) addFx('fx_splash', p.x, pl.y, { life: 0.45, s0: 0.5, s1: 1.2 });
          Sfx.land(Math.abs(vn));
          if (Math.abs(vn) > 900) G.shake = Math.min(12, Math.abs(vn) / 150);
        }
      }
      if (ny < -0.5) { p.grounded = true; p.stand = pl; }
    }
    if (p.grounded) p.vx -= p.vx * Math.min(1, 2.4 * dt);
  }

  function updatePlatforms(dt) {
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
    void dt;
  }

  /* ---------------- 敵 ---------------- */
  function enemyRect(e) {
    const s = e.spec;
    if (e.type === 'bat') return { x: e.x - s.w / 2, y: e.y - s.h, w: s.w, h: s.h };
    return { x: e.x - s.w / 2, y: e.y - s.h, w: s.w, h: s.h };
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
    addFloater(e.x, e.y - e.spec.h - 30, String(dmg), dmg >= 4 ? '#ffd98a' : '#ffffff');
    addFx('fx_land_star', e.x, e.y - e.spec.h * 0.5, { life: 0.4, s0: 0.5, s1: 1.1 });
    G.shake = Math.min(16, G.shake + 4 + dmg);
    Sfx.hit();
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      G.killed++;
      gainSpecial(18);
      addFx('fx_splash', e.x, e.y - e.spec.h * 0.4, { life: 0.6, s0: 0.6, s1: 1.5 });
      addFx('fx_land_dust', e.x, e.y, { life: 0.6, s0: 0.5, s1: 1.3 });
      addFloater(e.x, e.y - e.spec.h - 60, '+' + e.spec.exp, '#aee0ff');
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
        const near = Math.abs(p.x - e.x) < 180 && Math.abs(p.y - e.y) < 160;
        e.attack = near ? 1 : 0;
        if (near) e.dir = p.x > e.x ? 1 : -1;
        else {
          e.x += e.dir * e.spec.speed * dt;
          if (e.x < e.patrol[0]) { e.x = e.patrol[0]; e.dir = 1; }
          if (e.x > e.patrol[1]) { e.x = e.patrol[1]; e.dir = -1; }
        }
      } else if (e.type === 'redslime' || e.type === 'boss') {
        e.hopT -= dt;
        if (e.hopT <= 0 && e.y >= e.baseY - 0.5) {
          e.vy = e.type === 'boss' ? -540 : -620;
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
      } else if (e.type === 'bat') {
        const span = e.patrol[1] - e.patrol[0];
        const u = Math.sin(G.t * 0.7 + e.phase) * 0.5 + 0.5;
        const prev = e.x;
        e.x = e.patrol[0] + span * u;
        e.y = e.baseY + Math.sin(G.t * 1.9 + e.phase * 1.3) * 70;
        e.dir = e.x >= prev ? 1 : -1;
      }

      if (e.hitCd <= 0 && circleHitsRect(p.x, p.y, R, enemyRect(e))) {
        const sp = Math.hypot(p.vx, p.vy);
        if (G.specialArmed || sp > HIT_SPEED) {
          let dmg;
          if (G.specialArmed) {
            dmg = 9;
            G.specialArmed = false;
            G.shocks.push({ x: p.x, y: p.y, r: 20, max: 300, t: 0 });
            es.forEach(function (o) {
              if (o !== e && o.alive && Math.hypot(o.x - p.x, (o.y - o.spec.h / 2) - p.y) < 300) damageEnemy(o, 4, p.x);
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
    for (let i = 0; i < st.coins.length; i++) {
      const c = st.coins[i];
      if (c.got) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < R + 24) {
        c.got = true; G.coins++;
        addFx('fx_land_star', c.x, c.y, { life: 0.35, s0: 0.5, s1: 1 });
        Sfx.coin(); syncHud();
      }
    }
    for (let i = 0; i < st.crystals.length; i++) {
      const c = st.crystals[i];
      if (c.got) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < R + 28) {
        c.got = true; G.crystals++;
        addFx('fx_checkpoint', c.x, c.y, { life: 0.5, s0: 0.3, s1: 0.8 });
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
    addFx('fx_checkpoint', G.player.x, G.player.y, { life: 0.6, s0: 0.3, s1: 1 });
    Sfx.heal();
    syncHud();
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('show'); }

    if (G.mode === 'play') {
      const p = G.player;
      updatePlatforms(dt);
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
      if (p.blinkT < -0.14) p.blinkT = 2.4 + Math.random() * 2;

      let s = 'slime_idle';
      if (p.invT > 0) s = 'slime_damage';
      else if (G.aiming) s = 'slime_drag';
      else if (p.launchT > 0) s = 'slime_launch';
      else if (p.landT > 0) s = 'slime_land';
      else if (!p.grounded && p.vy < -130) s = 'slime_fly';
      else if (!p.grounded && p.vy > 260) s = 'slime_fall';
      else if (p.grounded && p.blinkT < 0) s = 'slime_blink';
      p.sprite = s;
      p.ang = (s === 'slime_fly' || s === 'slime_launch')
        ? clamp(Math.atan2(p.vy, Math.abs(p.vx) + 1) * 0.5, -0.5, 0.5) * (p.vx < 0 ? -1 : 1)
        : lerp(p.ang, 0, Math.min(1, dt * 8));

      updateEnemies(dt);
      collect();

      if (p.y > G.stage.deathY) {
        G.hearts--;
        Sfx.hurt();
        syncHud();
        if (G.hearts <= 0) gameOver();
        else {
          toast('落ちてしまった…', 1.6);
          p.x = G.stage.spawn.x; p.y = G.stage.spawn.y;
          p.vx = 0; p.vy = 0; p.invT = 1.3;
          p.grounded = false; p.stand = null;
        }
      }
    }

    // カメラ
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
      s.r = lerp(20, s.max, Math.min(1, s.t / 0.4));
      if (s.t > 0.45) G.shocks.splice(i, 1);
    }

    if (G.aiming) {
      const q = pull();
      el.pullFill.style.width = (q.power * 15.7) + 'cqw';
    } else {
      el.pullFill.style.width = '0cqw';
    }
  }

  /* ---------------- 描画 ---------------- */
  function drawImg(name, x, y, w, h, alpha, rot, flip) {
    const im = IMG[name];
    if (!im || !im.width) return;
    const a = ASSET_FILES[name];
    const dw = w === undefined ? a.w : w;
    const dh = h === undefined ? a.h : h;
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (rot || flip) {
      ctx.translate(x + dw / 2, y + dh / 2);
      if (rot) ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.drawImage(im, x, y, dw, dh);
    }
    ctx.restore();
  }

  function tileH(name, par, y, s, alpha) {
    const a = ASSET_FILES[name];
    const dw = a.w * s, dh = a.h * s;
    const off = -(G.cam.x * par) % dw;
    for (let x = off - dw; x < W + dw; x += dw) {
      drawImg(name, x, y - G.cam.y * par * 0.4, dw, dh, alpha);
    }
  }

  function drawBackground() {
    const sky = IMG.bg_sky;
    if (sky && sky.width) ctx.drawImage(sky, 0, 0, W, H);
    tileH('bg_floating_islands_far', 0.14, -120, 0.5, 0.5);
    tileH('bg_far_mountains', 0.1, 330, 0.8, 0.95);
    tileH('bg_clouds_mid', 0.26, -30, 0.7, 0.45);
    tileH('bg_floating_islands_mid', 0.4, -150, 0.58, 0.55);

    // 配置した滝・遺跡・ツタ
    for (let i = 0; i < G.scenery.length; i++) {
      const s = G.scenery[i];
      const a = ASSET_FILES[s.img];
      const dw = a.w * s.s, dh = a.h * s.s;
      const x = s.x - G.cam.x * s.par;
      if (x > W + dw || x < -dw) continue;
      drawImg(s.img, x - dw / 2, s.y - G.cam.y * s.par, dw, dh, 0.55);
    }
    tileH('bg_forest_decoration', 0.62, 430, 0.85, 0.9);
  }

  function drawStage() {
    const st = G.stage;

    for (let i = 0; i < st.platforms.length; i++) {
      const pl = st.platforms[i];
      const x = pl.cx + pl.drawDx;
      if (x > G.cam.x + W + 200 || x + pl.drawW < G.cam.x - 200) continue;
      drawImg(pl.img, x, pl.y + pl.drawDy, pl.drawW, pl.drawH);
    }

    for (let i = 0; i < st.props.length; i++) {
      const d = st.props[i];
      const a = ASSET_FILES[d.img];
      const dw = a.w * d.s, dh = a.h * d.s;
      if (d.x > G.cam.x + W + 200 || d.x < G.cam.x - 200) continue;
      drawImg(d.img, d.x - dw / 2, d.y - dh + 8, dw, dh);
    }

    for (let i = 0; i < st.coins.length; i++) {
      const c = st.coins[i];
      if (c.got) continue;
      drawImg('ui_coin', c.x - 20, c.y - 20 + Math.sin(G.t * 3 + c.ph) * 5, 40, 40);
    }
    for (let i = 0; i < st.crystals.length; i++) {
      const c = st.crystals[i];
      if (c.got) continue;
      drawImg('prop_crystal', c.x - 20, c.y - 28 + Math.sin(G.t * 2.4 + c.ph) * 6, 40, 54);
    }
  }

  function enemyFrameName(e) {
    const f = e.spec.frames;
    if (e.type === 'goblin') {
      if (e.attack) return f.attack;
      return (Math.floor(G.t * 6 + e.phase) % 2) ? f.walk : f.idle;
    }
    if (e.type === 'bat') return (Math.floor(G.t * 8 + e.phase) % 2) ? f.up : f.down;
    return e.squashT > 0 ? f.squash : f.idle;
  }

  function drawEnemies() {
    const es = G.stage.enemies;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.alive) continue;
      if (e.x > G.cam.x + W + 220 || e.x < G.cam.x - 220) continue;
      const s = e.spec;
      const name = enemyFrameName(e);
      const a = ASSET_FILES[name];
      const dw = a.w * s.scale, dh = a.h * s.scale;
      const x = e.x - s.baseX * s.scale;
      const y = e.y - s.baseY * s.scale;
      ctx.save();
      if (e.hitT > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.hitT * 60);
      if (e.dir < 0) {
        ctx.translate(e.x, 0); ctx.scale(-1, 1); ctx.translate(-e.x, 0);
        drawImg(name, 2 * e.x - x - dw, y, dw, dh);
      } else {
        drawImg(name, x, y, dw, dh);
      }
      ctx.restore();

      // 体力バー（枠は UI 素材、中身は赤で描く）
      const bw = s.barW, bh = bw * 0.15, by = e.y - s.h - 16;
      drawImg('ui_energy_bar', e.x - bw / 2, by, bw, bh);
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      if (ratio > 0) {
        const ix = e.x - bw / 2 + bw * 0.037, iy = by + bh * 0.25;
        const iw = (bw * 0.925) * ratio, ih = bh * 0.5;
        const grad = ctx.createLinearGradient(0, iy, 0, iy + ih);
        grad.addColorStop(0, '#f78a7f');
        grad.addColorStop(1, '#c32f2c');
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(ix, iy, Math.max(2, iw), ih, ih / 2);
        else ctx.rect(ix, iy, Math.max(2, iw), ih);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawAim() {
    if (!G.aiming) return;
    const p = G.player;
    const q = pull();
    if (q.len <= MIN_PULL) return;
    const ang = Math.atan2(G.aimPt.y - p.y, G.aimPt.x - p.x);
    const len = Math.min(q.len, MAX_PULL);
    const im = IMG.fx_drag_line;
    if (im && im.width) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.5 + q.power * 0.45;
      ctx.drawImage(im, 12, -11, len, 22);
      ctx.restore();
    }
    let px = p.x, py = p.y, vx = q.dx * q.speed, vy = q.dy * q.speed;
    const dt = 1 / 60;
    for (let i = 0; i < 64; i++) {
      vy += GRAV * dt;
      px += vx * dt; py += vy * dt;
      if (i % 4 === 0) {
        const t = i / 64;
        const sz = 26 - t * 11;
        drawImg('fx_trajectory_dot', px - sz / 2, py - sz / 2, sz, sz, (1 - t) * 0.95);
      }
      let hit = false;
      const ps = G.stage.platforms;
      for (let k = 0; k < ps.length; k++) {
        const pl = ps[k];
        if (px > pl.x - 6 && px < pl.x + pl.w + 6 && py + R > pl.y && py < pl.y + pl.h) { hit = true; break; }
      }
      if (hit || py > G.stage.deathY) break;
    }
  }

  function drawPlayer() {
    const p = G.player;
    const a = ASSET_FILES[p.sprite];
    const dw = a.w * SPR, dh = a.h * SPR;
    const bx = p.x - 96 * SPR;
    const by = (p.y + R) - 168 * SPR;
    ctx.save();
    if (G.specialArmed) {
      const g = ctx.createRadialGradient(p.x, p.y, R * 0.5, p.x, p.y, R * 2.2);
      g.addColorStop(0, 'rgba(190,232,255,.5)');
      g.addColorStop(1, 'rgba(190,232,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    if (p.invT > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(p.invT * 26));
    if (p.ang) {
      ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.translate(-p.x, -p.y);
    }
    const flip = p.vx < -30 && (p.sprite === 'slime_fly' || p.sprite === 'slime_launch');
    const im = IMG[p.sprite];
    if (im && im.width) {
      if (flip) {
        ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.translate(-p.x, 0);
        ctx.drawImage(im, 2 * p.x - bx - dw, by, dw, dh);
      } else {
        ctx.drawImage(im, bx, by, dw, dh);
      }
    }
    ctx.restore();
  }

  function drawFxLayer() {
    for (let i = 0; i < G.shocks.length; i++) {
      const s = G.shocks[i];
      const al = 1 - s.t / 0.45;
      drawImg('fx_checkpoint', s.x - s.r, s.y - s.r, s.r * 2, s.r * 2, al * 0.9);
    }
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      const a = ASSET_FILES[f.img];
      const t = f.t / f.life;
      const sc = lerp(f.s0, f.s1, t);
      drawImg(f.img, f.x - a.w * sc / 2, f.y - a.h * sc / 2, a.w * sc, a.h * sc, (1 - t) * f.alpha, f.rot);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i < G.floaters.length; i++) {
      const f = G.floaters[i];
      const al = Math.min(1, (1 - f.t / f.life) * 1.6);
      ctx.save();
      ctx.globalAlpha = al;
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
    el.btnPrimary.querySelector('span').textContent = 'つづける';
    el.btnSecondary.querySelector('span').textContent = 'タイトルへ';
  }

  el.btnStart.addEventListener('click', newGame);
  el.btnSpecial.addEventListener('click', armSpecial);
  el.btnHeal.addEventListener('click', heal);
  el.btnPause.addEventListener('click', function () { if (G.mode === 'play') showPause(); });
  el.btnSettings.addEventListener('click', function () {
    toast(Sfx.toggle() ? '効果音を ONにした' : '効果音を OFFにした', 1.6);
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
  loadAssets(function (p) {
    el.loadBar.style.setProperty('--p', Math.round(p * 100) + '%');
  }).then(function () {
    el.loading.classList.add('done');
    el.hud.classList.add('hidden');
    G.stage = buildStage(0);
    G.player = { x: G.stage.spawn.x, y: G.stage.spawn.y, vx: 0, vy: 0, grounded: true, stand: null, restT: 1, sprite: 'slime_idle', ang: 0, landT: 0, launchT: 0, blinkT: 2, invT: 0 };
    G.scenery = [];
    G.cam.x = 0; G.cam.y = 0;
    buildHearts();
    requestAnimationFrame(frame);
  });

  window.__slimeAction = { G: G, newGame: newGame, loadStage: loadStage };
})();

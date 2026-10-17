/* ===========================================================
   game.js  —  スライム・スリング 本体
   =========================================================== */
'use strict';

(function () {

  const W = 1536;          // 画面の論理幅
  const H = 1024;          // 画面の論理高さ
  const LAYER_H = 1224;    // 地形レイヤーの高さ（下方向に余裕）

  const GRAVITY = 2100;
  const MAX_PULL = 240;
  const MIN_PULL = 26;
  const LAUNCH_MIN = 380;
  const LAUNCH_MAX = 1560;
  const HIT_SPEED = 300;

  const clamp = Art.clamp, lerp = Art.lerp;

  /* ---------------- 効果音（WebAudio・画像素材なし） ---------------- */
  const Sfx = (function () {
    let ac = null, enabled = true;
    function ensure() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f0, f1, dur, type, vol) {
      if (!enabled) return;
      const a = ensure(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), a.currentTime + dur);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, a.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    return {
      launch: function (p) { tone(260 + p * 220, 620 + p * 360, 0.22, 'sine', 0.1); },
      hit: function () { tone(220, 90, 0.16, 'triangle', 0.14); },
      defeat: function () { tone(520, 880, 0.26, 'sine', 0.1); setTimeout(function () { tone(760, 1120, 0.22, 'sine', 0.08); }, 90); },
      hurt: function () { tone(300, 110, 0.3, 'sawtooth', 0.08); },
      land: function (v) { tone(150, 70, 0.1, 'sine', Math.min(0.1, v / 12000)); },
      potion: function () { tone(440, 880, 0.2, 'sine', 0.09); },
      special: function () { tone(180, 760, 0.4, 'triangle', 0.1); },
      clear: function () {
        [0, 120, 240, 420].forEach(function (d, i) {
          setTimeout(function () { tone(523 * Math.pow(1.122, i * 2), 1046, 0.3, 'sine', 0.09); }, d);
        });
      },
      setEnabled: function (v) { enabled = v; if (v) ensure(); },
      isEnabled: function () { return enabled; }
    };
  })();

  /* ---------------- 敵の種類 ---------------- */
  const ENEMY_DEF = {
    goblin: { hp: 3, w: 62, h: 120, speed: 72, exp: 16, barW: 82, scale: 1.18 },
    redslime: { hp: 4, w: 68, h: 84, speed: 54, exp: 18, barW: 82, scale: 1.16 },
    bat: { hp: 2, w: 64, h: 60, speed: 96, exp: 14, barW: 72, scale: 1.12 },
    boss: { hp: 16, w: 126, h: 144, speed: 46, exp: 90, barW: 150, scale: 1.08 }
  };

  /* ---------------- 画面 ---------------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let viewScale = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.round(r.width * dpr));
    canvas.height = Math.max(2, Math.round(r.height * dpr));
    viewScale = canvas.width / W;
  }
  window.addEventListener('resize', resize);

  /* ---------------- 状態 ---------------- */
  const G = {
    stageIndex: 0,
    stage: null,
    far: null, mid: null, layer: null, fore: null,
    cam: { x: 0, y: 0 },
    player: null,
    enemies: [],
    particles: [],
    floaters: [],
    shocks: [],
    motes: [],
    t: 0,
    shake: 0,
    state: 'play',
    killed: 0,
    launches: 0,
    aiming: false,
    aimStart: { x: 0, y: 0 },
    aimNow: { x: 0, y: 0 },
    lastDir: { x: 0.82, y: -0.57 },
    lv: 1, exp: 0, expNeed: 60,
    hearts: 4, maxHearts: 4,
    potions: 3,
    special: 0, specialArmed: false,
    totalKills: 0
  };

  /* ---------------- HUD 要素 ---------------- */
  const el = {
    hearts: document.getElementById('hearts'),
    lv: document.getElementById('lvText'),
    xpFill: document.getElementById('xpFill'),
    xpText: document.getElementById('xpText'),
    stageNo: document.getElementById('stageNo'),
    stageName: document.getElementById('stageName'),
    kill: document.getElementById('killCount'),
    killTotal: document.getElementById('killTotal'),
    tutorial: document.getElementById('tutorial'),
    spFill: document.getElementById('spFill'),
    btnSpecial: document.getElementById('btnSpecial'),
    btnMain: document.getElementById('btnMain'),
    btnPotion: document.getElementById('btnPotion'),
    potionCount: document.getElementById('potionCount'),
    hint: document.getElementById('hint'),
    overlay: document.getElementById('overlay'),
    ovTitle: document.getElementById('ovTitle'),
    ovBody: document.getElementById('ovBody'),
    ovStats: document.getElementById('ovStats'),
    ovPrimary: document.getElementById('ovPrimary'),
    ovSecondary: document.getElementById('ovSecondary'),
    btnSound: document.getElementById('btnSound'),
    btnRestart: document.getElementById('btnRestart'),
    mini: document.getElementById('minimap')
  };
  const miniCtx = el.mini.getContext('2d');

  const HEART_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path class="fill" d="M12 21s-7.8-4.7-9.6-9.2C1 8.2 3.2 4.8 6.6 4.8c2 0 3.6 1.1 4.4 2.6.8-1.5 2.4-2.6 4.4-2.6 3.4 0 5.6 3.4 4.2 7-1.8 4.5-7.6 9.2-7.6 9.2z" ' +
    'fill="#e0524f" stroke="#7d2422" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path class="fill" d="M8 8.2c-1.3 0-2.2 1-2.1 2.3" fill="none" stroke="#ff9d93" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>';

  function buildHearts() {
    el.hearts.innerHTML = '';
    for (let i = 0; i < G.maxHearts; i++) {
      const span = document.createElement('span');
      span.innerHTML = HEART_SVG;
      el.hearts.appendChild(span.firstChild);
    }
  }

  function syncHud() {
    const hs = el.hearts.children;
    if (hs.length !== G.maxHearts) buildHearts();
    for (let i = 0; i < el.hearts.children.length; i++) {
      el.hearts.children[i].classList.toggle('empty', i >= G.hearts);
    }
    el.lv.textContent = 'Lv.' + G.lv;
    el.xpFill.style.width = clamp(G.exp / G.expNeed, 0, 1) * 100 + '%';
    el.xpText.textContent = G.exp + ' / ' + G.expNeed;
    el.kill.textContent = String(G.killed);
    el.killTotal.textContent = '/' + G.enemies.length;
    el.spFill.style.height = G.special + '%';
    el.btnSpecial.classList.toggle('ready', G.special >= 100 || G.specialArmed);
    el.potionCount.textContent = '×' + G.potions;
    el.btnPotion.classList.toggle('empty', G.potions <= 0);
  }

  let hintTimer = 0;
  function showHint(text, sec) {
    el.hint.textContent = text;
    el.hint.classList.add('show');
    hintTimer = sec || 2.6;
  }

  /* ---------------- ステージ読み込み ---------------- */
  function loadStage(index) {
    const st = STAGES[index];
    G.stageIndex = index;
    G.stage = st;
    G.killed = 0;
    G.launches = 0;
    G.particles.length = 0;
    G.floaters.length = 0;
    G.shocks.length = 0;
    G.specialArmed = false;
    G.state = 'play';

    const maxCam = Math.max(1, st.width - W);
    G.far = Art.buildFar(W + maxCam * 0.18 + 40, H, st.seed);
    G.mid = Art.buildMid(W + maxCam * 0.45 + 40, H, st.seed);
    G.layer = Art.buildStageLayer(st, W, LAYER_H);
    G.fore = Art.buildFore(W + maxCam * 1.15 + 40, 190, st.seed);

    G.player = {
      x: st.spawn.x, y: st.spawn.y, vx: 0, vy: 0, r: 36,
      grounded: false, restT: 0, invT: 0, flash: 0,
      sx: 1, sy: 1, ang: 0, dir: 1, face: 'normal', faceT: 0,
      squash: 0
    };

    G.enemies = st.enemies.map(function (src, i) {
      const def = ENEMY_DEF[src.type];
      const e = {
        type: src.type, x: src.x, y: src.y, baseY: src.y,
        w: def.w, h: def.h, hp: def.hp, maxHp: def.hp, speed: def.speed,
        exp: def.exp, barW: def.barW, scale: def.scale,
        dir: i % 2 ? -1 : 1, phase: i * 1.7, alive: true,
        patrol: src.patrol || [src.x - 120, src.x + 120],
        path: src.path || null,
        vy: 0, squash: 0, hopT: 0.5 + i * 0.3, attack: 0, hitT: 0, hitCd: 0,
        walking: true, deadT: 0
      };
      if (e.type === 'boss') { e.scale = 1; }
      return e;
    });

    // 浮遊するほこり
    G.motes.length = 0;
    const rng = Art.rngFrom(st.seed + 9);
    for (let i = 0; i < 46; i++) {
      G.motes.push({ x: rng() * st.width, y: rng() * H, r: 1 + rng() * 2.6, s: 8 + rng() * 22, p: rng() * 6.28 });
    }

    G.cam.x = clamp(G.player.x - W * 0.42, 0, maxCam);
    G.cam.y = 0;

    el.stageNo.textContent = 'ステージ ' + st.no;
    el.stageName.textContent = st.name;
    el.tutorial.classList.toggle('hide', index !== 0);
    syncHud();
    showHint(st.hint, 3.2);
  }

  function resetRun() {
    G.lv = 1; G.exp = 0; G.expNeed = 60;
    G.maxHearts = 4; G.hearts = 4;
    G.potions = 3; G.special = 0;
    G.totalKills = 0;
    buildHearts();
    loadStage(0);
  }

  /* ---------------- 便利関数 ---------------- */
  function spawnParticles(x, y, n, opt) {
    const o = opt || {};
    for (let i = 0; i < n; i++) {
      const a = (o.angle === undefined ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.spread || 2));
      const sp = (o.speed || 240) * (0.35 + Math.random() * 0.9);
      G.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0),
        r: (o.r || 5) * (0.5 + Math.random()),
        life: 0, max: (o.life || 0.6) * (0.6 + Math.random() * 0.7),
        color: o.color || '#bfe9ff',
        grav: o.grav === undefined ? 1 : o.grav
      });
    }
  }

  function addFloater(x, y, text, color) {
    G.floaters.push({ x: x, y: y, text: text, color: color || '#ffffff', life: 0, max: 0.9 });
  }

  function enemyRect(e) {
    if (e.type === 'bat') return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
    return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
  }

  function circleHitsRect(cx, cy, r, R) {
    const px = clamp(cx, R.x, R.x + R.w);
    const py = clamp(cy, R.y, R.y + R.h);
    const dx = cx - px, dy = cy - py;
    return dx * dx + dy * dy < r * r;
  }

  /* ---------------- 物理 ---------------- */
  function collidePlatforms(p, dt) {
    p.grounded = false;
    const pls = G.stage.platforms;
    for (let i = 0; i < pls.length; i++) {
      const pl = pls[i];
      if (p.x + p.r < pl.x || p.x - p.r > pl.x + pl.w) continue;
      if (p.y + p.r < pl.y || p.y - p.r > pl.y + pl.h) continue;
      const cx = clamp(p.x, pl.x, pl.x + pl.w);
      const cy = clamp(p.y, pl.y, pl.y + pl.h);
      let dx = p.x - cx, dy = p.y - cy;
      let d = Math.hypot(dx, dy);
      let nx, ny, push;
      if (d > 0.0001) {
        nx = dx / d; ny = dy / d; push = p.r - d;
      } else {
        const toL = p.x - pl.x, toR = pl.x + pl.w - p.x, toT = p.y - pl.y, toB = pl.y + pl.h - p.y;
        const m = Math.min(toL, toR, toT, toB);
        if (m === toT) { nx = 0; ny = -1; push = p.r + toT; }
        else if (m === toB) { nx = 0; ny = 1; push = p.r + toB; }
        else if (m === toL) { nx = -1; ny = 0; push = p.r + toL; }
        else { nx = 1; ny = 0; push = p.r + toR; }
      }
      p.x += nx * push;
      p.y += ny * push;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        const tvx = p.vx - vn * nx, tvy = p.vy - vn * ny;
        const rest = Math.abs(vn) > 160 ? 0.46 : 0.18;
        p.vx = tvx * 0.9 - vn * nx * rest;
        p.vy = tvy * 0.9 - vn * ny * rest;
        if (Math.abs(vn) > 240) {
          p.squash = Math.min(0.42, Math.abs(vn) / 2600);
          spawnParticles(p.x - nx * p.r, p.y - ny * p.r, 6, {
            angle: Math.atan2(ny, nx), spread: 1.8, speed: 160, r: 4,
            color: 'rgba(214,244,255,.9)', life: 0.45
          });
          Sfx.land(Math.abs(vn));
        }
      }
      if (ny < -0.5) p.grounded = true;
    }
    if (p.grounded) {
      p.vx -= p.vx * Math.min(1, 2.2 * dt);
    }
  }

  function predictPath(x, y, vx, vy) {
    const pts = [];
    let px = x, py = y, pvx = vx, pvy = vy;
    const dt = 1 / 60;
    for (let i = 0; i < 46; i++) {
      pvy += GRAVITY * dt;
      px += pvx * dt;
      py += pvy * dt;
      pts.push([px, py]);
      let hit = false;
      for (let k = 0; k < G.stage.platforms.length; k++) {
        const pl = G.stage.platforms[k];
        if (px > pl.x - 10 && px < pl.x + pl.w + 10 && py > pl.y - 10 && py < pl.y + pl.h) { hit = true; break; }
      }
      if (hit || py > G.stage.deathY) break;
    }
    return pts;
  }

  /* ---------------- 発射 ---------------- */
  function launch(dirX, dirY, power) {
    const p = G.player;
    const sp = lerp(LAUNCH_MIN, LAUNCH_MAX, power) * (G.specialArmed ? 1.32 : 1);
    p.vx = dirX * sp;
    p.vy = dirY * sp;
    p.restT = 0;
    p.face = 'normal';
    G.lastDir.x = dirX; G.lastDir.y = dirY;
    G.launches++;
    if (!G.specialArmed) gainSpecial(5);
    spawnParticles(p.x, p.y, 10, {
      angle: Math.atan2(-dirY, -dirX), spread: 1.3, speed: 260, r: 5,
      color: 'rgba(200,238,255,.95)', life: 0.5
    });
    Sfx.launch(power);
    if (G.launches >= 2 && G.stageIndex === 0) el.tutorial.classList.add('hide');
  }

  function gainSpecial(v) {
    if (G.specialArmed) return;
    G.special = clamp(G.special + v, 0, 100);
    syncHud();
  }

  function armSpecial() {
    if (G.special < 100 || G.specialArmed || G.state !== 'play') return;
    G.specialArmed = true;
    G.special = 0;
    showHint('スペシャル発動！ つぎの一撃が 強くなる', 2.2);
    Sfx.special();
    syncHud();
  }

  function usePotion() {
    if (G.potions <= 0 || G.hearts >= G.maxHearts || G.state !== 'play') return;
    G.potions--;
    G.hearts = Math.min(G.maxHearts, G.hearts + 2);
    addFloater(G.player.x, G.player.y - 50, '+2', '#9fe7a0');
    spawnParticles(G.player.x, G.player.y, 16, { speed: 200, r: 4, color: 'rgba(170,240,180,.95)', life: 0.7, lift: 80 });
    Sfx.potion();
    syncHud();
  }

  /* ---------------- ダメージ処理 ---------------- */
  function damageEnemy(e, dmg, fromX) {
    e.hp -= dmg;
    e.hitT = 0.2;
    e.hitCd = 0.22;
    const kb = (e.x > fromX ? 1 : -1);
    e.x += kb * (e.type === 'boss' ? 6 : 16);
    addFloater(e.x, e.y - e.h - 44, String(dmg), dmg >= 4 ? '#ffd98a' : '#ffffff');
    spawnParticles(e.x, e.y - e.h * 0.5, 12, { speed: 300, r: 5, color: 'rgba(255,236,190,.95)', life: 0.5 });
    G.shake = Math.min(18, G.shake + 5 + dmg);
    Sfx.hit();
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      e.deadT = 0;
      G.killed++;
      G.totalKills++;
      gainExp(e.exp);
      gainSpecial(18);
      spawnParticles(e.x, e.y - e.h * 0.5, 26, {
        speed: 360, r: 6, color: e.type === 'goblin' ? 'rgba(150,215,110,.95)' :
          (e.type === 'bat' ? 'rgba(170,150,215,.95)' : 'rgba(240,130,110,.95)'), life: 0.8, lift: 60
      });
      addFloater(e.x, e.y - e.h - 70, '+' + e.exp + ' EXP', '#aee0ff');
      Sfx.defeat();
      syncHud();
      if (G.killed >= G.enemies.length) setTimeout(stageClear, 700);
    }
  }

  function gainExp(v) {
    G.exp += v;
    while (G.exp >= G.expNeed) {
      G.exp -= G.expNeed;
      G.lv++;
      G.expNeed = Math.round(G.expNeed * 1.45);
      if (G.lv % 2 === 0) { G.maxHearts++; buildHearts(); }
      G.hearts = G.maxHearts;
      addFloater(G.player.x, G.player.y - 70, 'レベルアップ！', '#ffe49a');
      spawnParticles(G.player.x, G.player.y, 24, { speed: 260, r: 5, color: 'rgba(255,228,160,.95)', life: 0.9, lift: 90 });
    }
    syncHud();
  }

  function hurtPlayer(fromX) {
    const p = G.player;
    if (p.invT > 0 || G.state !== 'play') return;
    G.hearts--;
    p.invT = 1.5;
    p.flash = 1.5;
    p.face = 'hurt'; p.faceT = 1.1;
    const kb = p.x > fromX ? 1 : -1;
    p.vx = kb * 420;
    p.vy = -380;
    G.shake = 14;
    Sfx.hurt();
    syncHud();
    if (G.hearts <= 0) gameOver();
  }

  /* ---------------- 敵の更新 ---------------- */
  function updateEnemies(dt) {
    const p = G.player;
    for (let i = 0; i < G.enemies.length; i++) {
      const e = G.enemies[i];
      if (!e.alive) { e.deadT += dt; continue; }
      if (e.hitT > 0) e.hitT -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;

      if (e.type === 'goblin') {
        e.walking = true;
        e.x += e.dir * e.speed * dt;
        if (e.x < e.patrol[0]) { e.x = e.patrol[0]; e.dir = 1; }
        if (e.x > e.patrol[1]) { e.x = e.patrol[1]; e.dir = -1; }
        const near = Math.abs(p.x - e.x) < 170 && Math.abs(p.y - e.y) < 150;
        e.attack = near ? (Math.sin(G.t * 9 + e.phase) * 0.5 + 0.5) : 0;
        if (near) e.dir = p.x > e.x ? 1 : -1;
      } else if (e.type === 'redslime' || e.type === 'boss') {
        e.hopT -= dt;
        if (e.hopT <= 0 && e.y >= e.baseY - 0.5) {
          e.vy = e.type === 'boss' ? -560 : -640;
          e.hopT = e.type === 'boss' ? 2.1 : 1.5;
          e.dir = (p.x > e.x ? 1 : -1);
        }
        e.vy += GRAVITY * 0.72 * dt;
        e.y += e.vy * dt;
        if (e.y < e.baseY) e.x += e.dir * e.speed * dt;
        if (e.y >= e.baseY) {
          if (e.vy > 200) { e.squash = Math.min(0.3, e.vy / 2600); }
          e.y = e.baseY; e.vy = 0;
        }
        if (e.x < e.patrol[0]) { e.x = e.patrol[0]; e.dir = 1; }
        if (e.x > e.patrol[1]) { e.x = e.patrol[1]; e.dir = -1; }
        e.squash = Math.max(0, e.squash - dt * 1.4);
      } else if (e.type === 'bat') {
        const pa = e.path;
        const span = pa.x1 - pa.x0;
        const u = (Math.sin(G.t * (e.speed / 260) + e.phase) * 0.5 + 0.5);
        const prev = e.x;
        e.x = pa.x0 + span * u;
        e.y = pa.y + Math.sin(G.t * 1.9 + e.phase * 1.3) * pa.amp;
        e.dir = e.x >= prev ? 1 : -1;
      }

      // プレイヤーとの接触
      if (e.hitCd <= 0 && circleHitsRect(p.x, p.y, p.r, enemyRect(e))) {
        const sp = Math.hypot(p.vx, p.vy);
        if (G.specialArmed || sp > HIT_SPEED) {
          let dmg;
          if (G.specialArmed) {
            dmg = 8;
            G.shocks.push({ x: p.x, y: p.y, r: 10, max: 300, life: 0 });
            G.specialArmed = false;
            G.enemies.forEach(function (o) {
              if (o !== e && o.alive && Math.hypot(o.x - p.x, o.y - e.h / 2 - p.y) < 300) {
                damageEnemy(o, 4, p.x);
              }
            });
            syncHud();
          } else {
            dmg = 1 + Math.floor((sp - HIT_SPEED) / 380);
          }
          damageEnemy(e, dmg, p.x);
          // はね返り
          const nx = (p.x - e.x) || 1;
          const sgn = nx > 0 ? 1 : -1;
          p.vx = sgn * Math.max(260, Math.abs(p.vx) * 0.55);
          p.vy = -Math.max(300, Math.abs(p.vy) * 0.5);
          p.restT = 0;
        } else if (p.invT <= 0) {
          hurtPlayer(e.x);
        }
      }
    }
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) el.hint.classList.remove('show');
    }

    const p = G.player;
    if (G.state === 'play') {
      if (!G.aiming) {
        p.vy += GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        collidePlatforms(p, dt);
      }
      p.x = clamp(p.x, p.r, G.stage.width - p.r);

      const sp = Math.hypot(p.vx, p.vy);
      if (p.grounded && sp < 52) p.restT += dt; else p.restT = 0;
      if (p.invT > 0) p.invT -= dt;
      if (p.flash > 0) p.flash -= dt;
      if (p.faceT > 0) { p.faceT -= dt; if (p.faceT <= 0) p.face = 'normal'; }
      if (Math.abs(p.vx) > 40) p.dir = p.vx > 0 ? 1 : -1;
      p.squash = Math.max(0, p.squash - dt * 2.2);

      // 見た目のつぶれ・のび
      if (G.aiming) {
        p.ang = 0; p.sx = 1; p.sy = 1;
      } else if (sp > 120) {
        const st = clamp(sp / 2400, 0, 0.4);
        p.ang = Math.atan2(p.vy, p.vx);
        p.sx = 1 + st; p.sy = 1 - st * 0.72;
      } else {
        const wob = Math.sin(G.t * 3.4) * 0.05 + p.squash * 0.6;
        p.ang = 0;
        p.sx = 1 + wob; p.sy = 1 - wob;
      }

      if (p.y > G.stage.deathY) {
        G.hearts--;
        syncHud();
        if (G.hearts <= 0) { gameOver(); }
        else {
          showHint('落ちてしまった…', 1.6);
          Sfx.hurt();
          p.x = G.stage.spawn.x; p.y = G.stage.spawn.y;
          p.vx = 0; p.vy = 0; p.invT = 1.4; p.flash = 1.4;
        }
      }

      updateEnemies(dt);
    }

    // カメラ
    const maxCam = Math.max(0, G.stage.width - W);
    const tx = clamp(p.x - W * 0.42, 0, maxCam);
    const ty = clamp((p.y - 600) * 0.4, -150, 90);
    G.cam.x = lerp(G.cam.x, tx, Math.min(1, dt * 4.6));
    G.cam.y = lerp(G.cam.y, ty, Math.min(1, dt * 3.4));
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 36);

    // パーティクル
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const q = G.particles[i];
      q.life += dt;
      if (q.life >= q.max) { G.particles.splice(i, 1); continue; }
      q.vy += GRAVITY * 0.42 * q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    for (let i = G.floaters.length - 1; i >= 0; i--) {
      const f = G.floaters[i];
      f.life += dt;
      f.y -= 46 * dt;
      if (f.life >= f.max) G.floaters.splice(i, 1);
    }
    for (let i = G.shocks.length - 1; i >= 0; i--) {
      const s = G.shocks[i];
      s.life += dt;
      s.r = lerp(10, s.max, Math.min(1, s.life / 0.4));
      if (s.life > 0.45) G.shocks.splice(i, 1);
    }
  }

  /* ---------------- 描画 ---------------- */
  function render() {
    const sc = viewScale;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shakeX = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    const shakeY = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    const cx = G.cam.x, cy = G.cam.y;

    // --- 遠景 ---
    ctx.drawImage(G.far.canvas, -cx * 0.18, -cy * 0.12 - 10);
    G.far.falls.forEach(function (f) {
      Art.drawWaterfall(ctx, f.x - cx * 0.18, f.y - cy * 0.12 - 10, f.w, f.h, G.t, 0.38);
    });

    // --- 中景 ---
    ctx.drawImage(G.mid.canvas, -cx * 0.45, -cy * 0.3);
    G.mid.falls.forEach(function (f) {
      Art.drawWaterfall(ctx, f.x - cx * 0.45, f.y - cy * 0.3, f.w, f.h, G.t, 0.52);
    });

    // --- プレイ面 ---
    ctx.save();
    ctx.translate(-cx, -cy);

    ctx.drawImage(G.layer, 0, 0);

    // 影
    const p = G.player;
    const groundY = shadowGround(p.x, p.y);
    if (groundY !== null) {
      const d = clamp(1 - (groundY - p.y) / 420, 0.15, 1);
      Art.drawShadow(ctx, p.x, groundY + 4, p.r * (0.9 + d * 0.8), d);
    }
    G.enemies.forEach(function (e) {
      if (!e.alive) return;
      const gy = e.type === 'bat' ? shadowGround(e.x, e.y) : e.baseY;
      if (gy !== null) {
        const d = clamp(1 - (gy - e.y) / 420, 0.15, 1);
        Art.drawShadow(ctx, e.x, gy + 4, e.w * 0.62 * (0.8 + d * 0.5), d * 0.9);
      }
    });

    // 敵
    G.enemies.forEach(function (e) {
      if (!e.alive) return;
      ctx.save();
      if (e.hitT > 0) {
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(e.hitT * 60);
      }
      Art.enemyPainter[e.type](ctx, e, G.t);
      ctx.restore();
      Art.drawEnemyHp(ctx, e);
    });

    // 照準
    if (G.aiming && G.state === 'play') {
      const pull = pullVector();
      if (pull.len > MIN_PULL) {
        const pts = predictPath(p.x, p.y, pull.dx * pull.speed, pull.dy * pull.speed);
        Art.drawTrajectory(ctx, pts, pull.power);
      }
      Art.drawSlimeTail(ctx, p, G.aimNow.x, G.aimNow.y);
      Art.drawAimGauge(ctx, p.x, p.y, p.r + 22, pull.power);
    }

    // プレイヤー
    if (G.specialArmed) {
      const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.6, p.x, p.y, p.r * 2.4);
      g.addColorStop(0, 'rgba(190,230,255,.45)');
      g.addColorStop(1, 'rgba(190,230,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    Art.drawSlime(ctx, p);

    // 衝撃波
    G.shocks.forEach(function (s) {
      Art.drawShockwave(ctx, s.x, s.y, s.r, 1 - s.life / 0.45);
    });

    // パーティクル
    G.particles.forEach(function (q) {
      const a = 1 - q.life / q.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (0.5 + a * 0.7), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // ダメージ表示
    ctx.textAlign = 'center';
    G.floaters.forEach(function (f) {
      const a = 1 - f.life / f.max;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = '700 30px "Hiragino Maru Gothic ProN", sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(12,28,48,.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // ほこり（前景）
    G.motes.forEach(function (m) {
      const mx = m.x + Math.sin(G.t * 0.4 + m.p) * m.s;
      const my = m.y + Math.cos(G.t * 0.32 + m.p) * m.s * 0.7;
      ctx.globalAlpha = 0.28 + 0.22 * Math.sin(G.t + m.p);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(mx, my, m.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.restore(); // camera

    // 前景（手前の草花）
    ctx.globalAlpha = 0.9;
    ctx.drawImage(G.fore, -cx * 1.15, H - 150 - cy * 0.25);
    ctx.globalAlpha = 1;

    ctx.restore(); // shake

    Art.drawVignette(ctx, W, H);
    drawMinimap();
  }

  function shadowGround(x, y) {
    let best = null;
    for (let i = 0; i < G.stage.platforms.length; i++) {
      const pl = G.stage.platforms[i];
      if (x >= pl.x - 10 && x <= pl.x + pl.w + 10 && pl.y >= y - 6) {
        if (best === null || pl.y < best) best = pl.y;
      }
    }
    return best;
  }

  function drawMinimap() {
    const m = miniCtx, size = el.mini.width;
    m.clearRect(0, 0, size, size);
    const st = G.stage;
    const pad = 18;
    const sx = (size - pad * 2) / st.width;
    const sy = (size - pad * 2) / (H + 120);
    m.save();
    m.translate(pad, pad + 10);

    m.fillStyle = 'rgba(150,200,240,.3)';
    st.platforms.forEach(function (pl) {
      m.fillRect(pl.x * sx, pl.y * sy, Math.max(2, pl.w * sx), Math.max(2, 10 * sy));
    });

    G.enemies.forEach(function (e) {
      if (!e.alive) return;
      m.fillStyle = e.type === 'boss' ? '#f0b24a' : '#e3564f';
      m.beginPath();
      m.arc(e.x * sx, e.y * sy - 3, e.type === 'boss' ? 5 : 3.4, 0, Math.PI * 2);
      m.fill();
    });

    const p = G.player;
    m.fillStyle = '#9fe0ff';
    m.beginPath();
    m.arc(p.x * sx, p.y * sy - 3, 4.6, 0, Math.PI * 2);
    m.fill();
    m.strokeStyle = 'rgba(255,255,255,.85)';
    m.lineWidth = 1.6;
    m.stroke();

    // カメラ枠
    m.strokeStyle = 'rgba(255,255,255,.3)';
    m.lineWidth = 1.2;
    m.strokeRect(G.cam.x * sx, 0, W * sx, H * sy);
    m.restore();
  }

  /* ---------------- 入力 ---------------- */
  function toWorld(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * W + G.cam.x,
      y: ((ev.clientY - r.top) / r.height) * H + G.cam.y
    };
  }

  function pullVector() {
    const p = G.player;
    let dx = p.x - G.aimNow.x;
    let dy = p.y - G.aimNow.y;
    let len = Math.hypot(dx, dy);
    if (len < 0.001) { dx = 1; dy = 0; len = 0.001; }
    const power = clamp(len / MAX_PULL, 0, 1);
    return { dx: dx / len, dy: dy / len, len: len, power: power, speed: lerp(LAUNCH_MIN, LAUNCH_MAX, power) };
  }

  function canAim() {
    return G.state === 'play' && G.player.restT > 0.08;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    Sfx.setEnabled(Sfx.isEnabled());
    if (!canAim()) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    G.aiming = true;
    const w = toWorld(ev);
    G.aimStart = w;
    G.aimNow = w;
    G.player.face = 'charge';
    G.player.faceT = 99;
    G.player.vx = 0; G.player.vy = 0;
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (!G.aiming) return;
    G.aimNow = toWorld(ev);
  });

  function releaseAim(ev) {
    if (!G.aiming) return;
    G.aiming = false;
    G.player.face = 'normal';
    G.player.faceT = 0;
    const pull = pullVector();
    if (pull.len > MIN_PULL) launch(pull.dx, pull.dy, pull.power);
    if (ev && ev.pointerId !== undefined && canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
  }
  canvas.addEventListener('pointerup', releaseAim);
  canvas.addEventListener('pointercancel', releaseAim);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  el.btnMain.addEventListener('click', function () {
    if (!canAim()) return;
    launch(G.lastDir.x, G.lastDir.y, 0.72);
  });
  el.btnSpecial.addEventListener('click', armSpecial);
  el.btnPotion.addEventListener('click', usePotion);
  el.btnSound.addEventListener('click', function () {
    const next = !Sfx.isEnabled();
    Sfx.setEnabled(next);
    el.btnSound.textContent = next ? '音 ON' : '音 OFF';
  });
  el.btnRestart.addEventListener('click', function () {
    el.overlay.hidden = true;
    loadStage(G.stageIndex);
  });

  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'q' || ev.key === 'Q') usePotion();
    if (ev.key === 'e' || ev.key === 'E') armSpecial();
    if (ev.key === 'r' || ev.key === 'R') { el.overlay.hidden = true; loadStage(G.stageIndex); }
    if (ev.key === ' ' && canAim()) { ev.preventDefault(); launch(G.lastDir.x, G.lastDir.y, 0.72); }
  });

  /* ---------------- クリア / ゲームオーバー ---------------- */
  function stageClear() {
    if (G.state !== 'play') return;
    G.state = 'clear';
    const last = G.stageIndex >= STAGES.length - 1;
    el.ovTitle.innerHTML = '<span class="sub">STAGE CLEAR</span>' + (last ? 'ぜんステージ クリア' : 'ステージクリア');
    el.ovBody.textContent = last
      ? 'スライムは 空の城門を こえた。おめでとう！'
      : G.stage.name + ' の モンスターを すべて倒した！';
    el.ovStats.innerHTML =
      '<div>たおした数<b>' + G.killed + '</b></div>' +
      '<div>はじいた回数<b>' + G.launches + '</b></div>' +
      '<div>レベル<b>' + G.lv + '</b></div>';
    el.ovPrimary.textContent = last ? 'はじめから' : 'つぎのステージへ';
    el.ovSecondary.textContent = 'このステージを もう一度';
    el.overlay.hidden = false;
    Sfx.clear();
  }

  function gameOver() {
    if (G.state !== 'play') return;
    G.state = 'over';
    el.ovTitle.innerHTML = '<span class="sub">GAME OVER</span>ちからつきた…';
    el.ovBody.textContent = 'ポーションを使いながら 進もう。';
    el.ovStats.innerHTML =
      '<div>たおした数<b>' + G.totalKills + '</b></div>' +
      '<div>レベル<b>' + G.lv + '</b></div>';
    el.ovPrimary.textContent = 'このステージを やり直す';
    el.ovSecondary.textContent = 'はじめから';
    el.overlay.hidden = false;
  }

  el.ovPrimary.addEventListener('click', function () {
    el.overlay.hidden = true;
    if (G.state === 'clear') {
      if (G.stageIndex >= STAGES.length - 1) resetRun();
      else {
        G.potions = Math.min(5, G.potions + 1);
        G.hearts = G.maxHearts;
        loadStage(G.stageIndex + 1);
      }
    } else {
      G.hearts = G.maxHearts;
      G.potions = Math.max(1, G.potions);
      loadStage(G.stageIndex);
    }
  });

  el.ovSecondary.addEventListener('click', function () {
    el.overlay.hidden = true;
    if (G.state === 'clear') {
      G.hearts = G.maxHearts;
      loadStage(G.stageIndex);
    } else {
      resetRun();
    }
  });

  /* ---------------- メインループ ---------------- */
  let last = 0, acc = 0;
  const STEP = 1 / 120;

  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 12) { update(STEP); acc -= STEP; guard++; }
    if (guard >= 12) acc = 0;
    render();
    requestAnimationFrame(frame);
  }

  /* 動作確認用（?debug 付きで開いたときだけ内部状態を公開） */
  if (window.location.search.indexOf('debug') >= 0) {
    window.__game = { G: G, loadStage: loadStage, STAGES: STAGES };
  }

  /* ---------------- 起動 ---------------- */
  resize();
  buildHearts();
  loadStage(0);
  requestAnimationFrame(frame);

})();

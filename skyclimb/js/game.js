/* ===========================================================
   game.js — スライム・スカイクライム 本体
   画像素材を読み込んで描画し、当たり判定と物理はここで管理する
   =========================================================== */
'use strict';

(function () {

  const W = VIEW_W, H = VIEW_H;
  const GRAV = 2600;
  const MAX_PULL = 260;
  const MIN_PULL = 22;
  const LAUNCH_MIN = 420;
  const LAUNCH_MAX = 1760;
  const SPR = 0.8;                   // スライム画像の表示倍率
  const R = 38;                      // 当たり判定の半径

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
      launch: p => tone(240 + p * 200, 620 + p * 320, 0.2, 'sine', 0.09),
      land: v => tone(170, 80, 0.12, 'sine', Math.min(0.09, v / 14000)),
      bounce: () => tone(300, 760, 0.2, 'triangle', 0.09),
      coin: () => tone(880, 1320, 0.14, 'sine', 0.07),
      crystal: () => tone(660, 1480, 0.26, 'sine', 0.07),
      check: () => { tone(523, 784, 0.22, 'sine', 0.08); setTimeout(() => tone(784, 1046, 0.26, 'sine', 0.07), 110); },
      hurt: () => tone(320, 110, 0.3, 'sawtooth', 0.08),
      goal: () => [0, 130, 260, 420].forEach((d, i) => setTimeout(() => tone(523 * Math.pow(1.12, i * 2), 1200, 0.3, 'sine', 0.08), d)),
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
    mode: 'title',          // title / play / pause / result
    world: null,
    player: null,
    cam: { y: 0 },
    fx: [],
    t: 0,
    hearts: 4, maxHearts: 4,
    coins: 0, crystals: 0, cps: 0,
    bestY: 0,
    checkpoint: null,
    aiming: false,
    aimPt: { x: 0, y: 0 },
    startTime: 0,
    clearTime: 0,
    shake: 0
  };

  const el = {
    hearts: document.getElementById('hearts'),
    heightNow: document.getElementById('heightNow'),
    heightBest: document.getElementById('heightBest'),
    coin: document.getElementById('coinCount'),
    crystal: document.getElementById('crystalCount'),
    cp: document.getElementById('cpCount'),
    energy: document.getElementById('energy'),
    energyFillBox: document.querySelector('.energy .fillbox'),
    toast: document.getElementById('toast'),
    title: document.getElementById('titleScreen'),
    panel: document.getElementById('panelScreen'),
    panelTitle: document.getElementById('panelTitle'),
    panelStats: document.getElementById('panelStats'),
    btnPrimary: document.getElementById('btnPrimary'),
    btnSecondary: document.getElementById('btnSecondary'),
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnSettings: document.getElementById('btnSettings'),
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
    const now = Math.max(0, Math.round(-G.player.y / PX_PER_M));
    const best = Math.max(0, Math.round(-G.bestY / PX_PER_M));
    el.heightNow.textContent = String(now);
    el.heightBest.textContent = String(best);
    el.coin.textContent = String(G.coins);
    el.crystal.textContent = String(G.crystals);
    el.cp.textContent = String(G.cps);
  }

  let toastT = 0;
  function toast(text, sec) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    toastT = sec || 2.2;
  }

  /* ---------------- ゲーム開始 ---------------- */
  function startGame() {
    G.world = buildWorld(20261018);
    G.player = {
      x: G.world.spawn.x, y: G.world.spawn.y, vx: 0, vy: 0,
      grounded: false, stand: null, restT: 0, peakY: 0,
      sprite: 'slime_idle', spriteT: 0, ang: 0,
      landT: 0, launchT: 0, blinkT: 2.5, invT: 0
    };
    G.hearts = G.maxHearts;
    G.coins = 0; G.crystals = 0; G.cps = 0;
    G.bestY = 0;
    G.checkpoint = { x: G.world.spawn.x, y: -60 };
    G.fx.length = 0;
    G.cam.y = -H + 300;
    G.mode = 'play';
    G.startTime = performance.now();
    el.title.classList.add('hidden');
    el.panel.classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    syncHud();
    toast('スライムを引っ張って はなそう', 3);
  }

  /* ---------------- エフェクト ---------------- */
  function addFx(img, x, y, opt) {
    const o = opt || {};
    G.fx.push({
      img: img, x: x, y: y, t: 0,
      life: o.life || 0.5,
      s0: o.s0 === undefined ? 0.6 : o.s0,
      s1: o.s1 === undefined ? 1.1 : o.s1,
      vy: o.vy || 0, vx: o.vx || 0,
      rot: o.rot || 0, alpha: o.alpha === undefined ? 1 : o.alpha,
      loop: !!o.loop
    });
  }

  /* ---------------- 入力 ---------------- */
  function toWorld(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * W,
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
    if (len < 0.001) { dx = 0; dy = -1; len = 0.001; }
    const power = clamp(len / MAX_PULL, 0, 1);
    return { dx: dx / len, dy: dy / len, len: len, power: power, speed: lerp(LAUNCH_MIN, LAUNCH_MAX, power) };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (!canAim()) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    G.aiming = true;
    G.aimPt = toWorld(ev);
    el.energy.classList.add('active');
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!G.aiming) return;
    G.aimPt = toWorld(ev);
  });
  function release(ev) {
    if (!G.aiming) return;
    G.aiming = false;
    el.energy.classList.remove('active');
    const q = pull();
    if (q.len > MIN_PULL) {
      const p = G.player;
      p.vx = q.dx * q.speed;
      p.vy = q.dy * q.speed;
      p.grounded = false;
      p.stand = null;
      p.launchT = 0.26;
      p.restT = 0;
      p.peakY = p.y;
      addFx('fx_launch_streak', p.x, p.y, { life: 0.3, s0: 0.7, s1: 1.2, rot: Math.atan2(p.vy, p.vx) + Math.PI });
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
  function updatePlatforms(dt) {
    const ps = G.world.platforms;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.moveAmp) {
        const nx = p.baseCx + Math.sin(G.t * p.moveSpd + p.movePhase) * p.moveAmp;
        p.dx = nx - p.cx;
        p.cx = nx;
        p.x += p.dx;
      } else {
        p.dx = 0;
      }
      if (p.fragile && p.fallT > 0) {
        p.fallT -= dt;
        if (p.fallT <= 0) {
          p.alive = false;
          if (G.player.stand === p) { G.player.grounded = false; G.player.stand = null; }
        }
      }
    }
  }

  function land(pl) {
    const player = G.player;
    const speed = player.vy;
    player.y = pl.y - R;
    player.landT = 0.22;
    player.sprite = 'slime_land';

    if (pl.bouncy) {
      player.vy = -1280;
      player.vx *= 0.8;
      player.grounded = false;
      player.stand = null;
      addFx('fx_splash', player.x, pl.y, { life: 0.45, s0: 0.6, s1: 1.25 });
      Sfx.bounce();
      return;
    }
    player.vy = 0;
    player.grounded = true;
    player.stand = pl;
    player.restT = 0;

    // 高いところから落ちるとダメージ
    const drop = player.y - player.peakY;
    if (drop > 860 && player.invT <= 0) {
      G.hearts--;
      player.invT = 1.3;
      G.shake = 12;
      Sfx.hurt();
      toast('高いところから 落ちてしまった！', 1.8);
      syncHud();
      if (G.hearts <= 0) {
        G.mode = 'result';
        showResult(false);
      }
    }
    player.peakY = player.y;

    if (speed > 900) {
      addFx('fx_land_dust', player.x, pl.y, { life: 0.5, s0: 0.5, s1: 1.15 });
      G.shake = Math.min(10, speed / 160);
    } else {
      addFx('fx_land_star', player.x + 26, pl.y - 18, { life: 0.4, s0: 0.4, s1: 1 });
    }
    Sfx.land(speed);

    if (pl.fragile && pl.fallT <= 0) {
      pl.fallT = 0.75;
      toast('この足場は くずれる！', 1.4);
    }
    if (pl.checkpoint && G.checkpoint.y !== pl.y) {
      G.checkpoint = { x: pl.cx, y: pl.y };
      G.cps++;
      if (G.hearts < G.maxHearts) G.hearts++;
      addFx('fx_checkpoint', pl.cx, pl.y - 40, { life: 0.9, s0: 0.5, s1: 1.3 });
      toast('チェックポイント！', 1.6);
      Sfx.check();
      syncHud();
    }
    if (pl.goal && G.mode === 'play') {
      G.mode = 'result';
      G.clearTime = (performance.now() - G.startTime) / 1000;
      Sfx.goal();
      showResult(true);
    }
  }

  function physics(dt) {
    const p = G.player;
    const prevBottom = p.y + R;

    if (p.grounded && p.stand) {
      if (p.stand.dx) p.x += p.stand.dx;
      p.vx -= p.vx * Math.min(1, 3.2 * dt);
      if (!p.stand.alive) { p.grounded = false; p.stand = null; }
      // 足場からはみ出したら落ちる
      if (p.stand && (p.x < p.stand.x - R * 0.5 || p.x > p.stand.x + p.stand.w + R * 0.5)) {
        p.grounded = false; p.stand = null;
      }
      if (p.stand) p.y = p.stand.y - R;
    }

    if (!p.grounded) {
      p.vy += GRAV * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    } else {
      p.x += p.vx * dt;
    }

    // 画面左右のかべ
    if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx) * 0.45; }
    if (p.x > W - R) { p.x = W - R; p.vx = -Math.abs(p.vx) * 0.45; }

    // 片側通行の足場（落下中だけ着地する）
    if (!p.grounded && p.vy >= 0) {
      const ps = G.world.platforms;
      for (let i = 0; i < ps.length; i++) {
        const pl = ps[i];
        if (!pl.alive) continue;
        if (p.x + R * 0.55 < pl.x || p.x - R * 0.55 > pl.x + pl.w) continue;
        const bottom = p.y + R;
        if (prevBottom <= pl.y + 8 && bottom >= pl.y) {
          land(pl);
          break;
        }
      }
    }

    if (p.grounded) {
      p.restT += Math.abs(p.vx) < 40 ? dt : 0;
      p.peakY = p.y;
    } else {
      p.restT = 0;
      if (p.y < p.peakY) p.peakY = p.y;
    }

    if (p.y < G.bestY) { G.bestY = p.y; }
  }

  function collect() {
    const p = G.player;
    const w = G.world;
    for (let i = 0; i < w.coins.length; i++) {
      const c = w.coins[i];
      if (c.got) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < R + 26) {
        c.got = true; G.coins++;
        addFx('fx_land_star', c.x, c.y, { life: 0.4, s0: 0.5, s1: 1 });
        Sfx.coin(); syncHud();
      }
    }
    for (let i = 0; i < w.crystals.length; i++) {
      const c = w.crystals[i];
      if (c.got) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < R + 30) {
        c.got = true; G.crystals++;
        addFx('fx_checkpoint', c.x, c.y, { life: 0.5, s0: 0.3, s1: 0.8 });
        Sfx.crystal(); syncHud();
      }
    }
    for (let i = 0; i < w.chests.length; i++) {
      const c = w.chests[i];
      if (c.opened) continue;
      if (Math.abs(c.x - p.x) < 70 && Math.abs(c.y - 40 - p.y) < 70) {
        c.opened = true; G.crystals += 3;
        addFx('fx_checkpoint', c.x, c.y - 40, { life: 0.8, s0: 0.4, s1: 1.2 });
        toast('結晶を 3 つ 見つけた！', 1.6);
        Sfx.crystal(); syncHud();
      }
    }
  }

  function fallOut() {
    // 画面いっぱいの床があるため通常は通らない。保険としてチェックポイントへ戻す
    const p = G.player;
    if (p.y > 600) {
      p.x = G.checkpoint.x; p.y = G.checkpoint.y - R - 2;
      p.vx = 0; p.vy = 0; p.grounded = false; p.stand = null; p.peakY = p.y;
      toast('チェックポイントへ もどった', 1.8);
    }
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('show'); }

    if (G.mode === 'play') {
      updatePlatforms(dt);
      physics(dt);
      collect();
      fallOut();

      const p = G.player;
      if (p.landT > 0) p.landT -= dt;
      if (p.launchT > 0) p.launchT -= dt;
      if (p.invT > 0) p.invT -= dt;
      p.blinkT -= dt;
      if (p.blinkT < -0.14) p.blinkT = 2.4 + Math.random() * 2.2;

      // 表示スプライトの切り替え
      let s = 'slime_idle';
      if (p.invT > 0) s = 'slime_damage';
      else if (G.aiming) s = 'slime_drag';
      else if (p.launchT > 0) s = 'slime_launch';
      else if (p.landT > 0) s = 'slime_land';
      else if (!p.grounded && p.vy < -140) s = 'slime_fly';
      else if (!p.grounded && p.vy > 260) s = 'slime_fall';
      else if (p.grounded && p.blinkT < 0) s = 'slime_blink';
      p.sprite = s;

      if (s === 'slime_fly' || s === 'slime_launch') {
        p.ang = clamp(Math.atan2(p.vy, Math.abs(p.vx) + 1) * 0.5, -0.5, 0.5) * (p.vx < 0 ? -1 : 1);
      } else if (s === 'slime_fall') {
        p.ang = 0;
      } else {
        p.ang = lerp(p.ang, 0, Math.min(1, dt * 8));
      }

      if (!p.grounded && p.vy > 700 && Math.random() < dt * 12) {
        addFx('fx_fall', p.x + (Math.random() - 0.5) * 30, p.y - 60, { life: 0.3, s0: 0.6, s1: 0.9, alpha: 0.6 });
      }

      syncHudLight();
    }

    // カメラ
    const target = clamp(G.player.y - H * 0.62, G.world.topY - 260, 300 - H);
    G.cam.y = lerp(G.cam.y, target, Math.min(1, dt * 4.2));
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 28);

    // エフェクト
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      f.t += dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.t >= f.life) G.fx.splice(i, 1);
    }

    // ゲージ
    if (G.aiming) {
      const q = pull();
      el.energyFillBox.style.width = (q.power * 55) + 'cqw';
    } else {
      el.energyFillBox.style.width = '0cqw';
    }
  }

  let hudTick = 0;
  function syncHudLight() {
    hudTick++;
    if (hudTick % 6 !== 0) return;
    const now = Math.max(0, Math.round(-G.player.y / PX_PER_M));
    const best = Math.max(0, Math.round(-G.bestY / PX_PER_M));
    el.heightNow.textContent = String(now);
    el.heightBest.textContent = String(best);
  }

  /* ---------------- 描画 ---------------- */
  function drawImg(name, x, y, w, h, alpha, rot) {
    const im = IMG[name];
    if (!im || !im.width) return;
    const a = ASSET_FILES[name];
    const dw = w === undefined ? a.w : w;
    const dh = h === undefined ? a.h : h;
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (rot) {
      ctx.translate(x + dw / 2, y + dh / 2);
      ctx.rotate(rot);
      ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.drawImage(im, x, y, dw, dh);
    }
    ctx.restore();
  }

  function tileVertical(name, par, spacing, alpha, scaleX) {
    const a = ASSET_FILES[name];
    const sx = scaleX || (W / a.w);
    const dw = a.w * sx, dh = a.h * sx;
    const camY = G.cam.y * par;
    const first = Math.floor((camY - dh) / spacing) * spacing;
    for (let y = first; y < camY + H + dh; y += spacing) {
      drawImg(name, (W - dw) / 2, y - camY, dw, dh, alpha);
    }
  }

  /* 視差つきの配置: par が 1 に近いほど実際の位置へ寄る */
  function parY(worldY, par) {
    return (worldY - G.cam.y) * par + H * (1 - par) * 0.72;
  }

  function drawBackground() {
    // 空（全画面）
    const sky = IMG.bg_sky;
    if (sky && sky.width) ctx.drawImage(sky, 0, 0, W, H);

    // 高度が上がるほど空を少し深くする
    const alt = clamp(-G.cam.y / (-G.world.topY), 0, 1);
    ctx.fillStyle = 'rgba(28,74,130,' + (alt * 0.3) + ')';
    ctx.fillRect(0, 0, W, H);

    // 遠景の山（地上付近に置き、登るほど下へ沈む）
    drawImg('bg_far_mountains', -80, parY(120, 0.08) - 150, 880, 293, 0.95);

    tileVertical('bg_floating_islands_far', 0.18, 980, 0.5);
    tileVertical('bg_clouds_mid', 0.3, 700, 0.42);

    // 城（頂上付近）
    drawImg('bg_castle', 40, parY(G.world.topY + 300, 0.3) - 420, 640, 426, 0.95);

    tileVertical('bg_floating_islands_mid', 0.45, 1120, 0.52);

    // 地上の樹林
    drawImg('bg_forest_decoration', -60, parY(60, 0.75) - 300, 840, 315, 0.95);

    // 配置済みの背景装飾（滝・遺跡・ツタ）
    const sc = G.world.scenery;
    for (let i = 0; i < sc.length; i++) {
      const s = sc[i];
      const a = ASSET_FILES[s.img];
      const dw = a.w * s.s * 0.55, dh = a.h * s.s * 0.55;
      const y = parY(s.y, s.par);
      if (y > H + 500 || y + dh < -500) continue;
      drawImg(s.img, s.x - dw / 2, y - dh * 0.5, dw, dh, 0.75);
    }
  }

  function drawWorld() {
    const w = G.world;

    // 背面の飾り
    for (let i = 0; i < w.props.length; i++) {
      const p = w.props[i];
      if (!p.behind) continue;
      const a = ASSET_FILES[p.img];
      drawImg(p.img, p.x - a.w * p.s / 2, p.y - a.h * p.s + a.h * p.s * 0.1, a.w * p.s, a.h * p.s, 0.9);
    }

    // 足場
    for (let i = 0; i < w.platforms.length; i++) {
      const pl = w.platforms[i];
      if (!pl.alive) continue;
      const y = pl.y + pl.drawDy;
      if (y > G.cam.y + H + 300 || y + pl.drawH < G.cam.y - 200) continue;
      let alpha = 1;
      if (pl.fragile && pl.fallT > 0) alpha = 0.5 + 0.5 * Math.abs(Math.sin(pl.fallT * 26));
      if (pl.ground) {
        drawImg(pl.img, -70, y, pl.drawW, pl.drawH, alpha);
        drawImg(pl.img, 310, y, pl.drawW, pl.drawH, alpha);
      } else {
        drawImg(pl.img, pl.cx + pl.drawDx, y, pl.drawW, pl.drawH, alpha);
      }
    }

    // 前面の飾り
    for (let i = 0; i < w.props.length; i++) {
      const p = w.props[i];
      if (p.behind) continue;
      const a = ASSET_FILES[p.img];
      const dw = a.w * p.s, dh = a.h * p.s;
      if (p.y - dh > G.cam.y + H + 200 || p.y < G.cam.y - 200) continue;
      drawImg(p.img, p.x - dw / 2, p.y - dh + 6, dw, dh);
    }

    // 宝箱
    for (let i = 0; i < w.chests.length; i++) {
      const c = w.chests[i];
      const a = ASSET_FILES.prop_chest;
      const dw = a.w * 0.8, dh = a.h * 0.8;
      drawImg('prop_chest', c.x - dw / 2, c.y - dh + 6, dw, dh, c.opened ? 0.35 : 1);
    }

    // コイン・結晶
    for (let i = 0; i < w.coins.length; i++) {
      const c = w.coins[i];
      if (c.got) continue;
      if (c.y > G.cam.y + H + 100 || c.y < G.cam.y - 100) continue;
      const bob = Math.sin(G.t * 3 + c.ph) * 5;
      drawImg('ui_coin', c.x - 22, c.y - 22 + bob, 44, 44);
    }
    for (let i = 0; i < w.crystals.length; i++) {
      const c = w.crystals[i];
      if (c.got) continue;
      if (c.y > G.cam.y + H + 100 || c.y < G.cam.y - 100) continue;
      const bob = Math.sin(G.t * 2.4 + c.ph) * 6;
      drawImg('prop_crystal', c.x - 22, c.y - 30 + bob, 44, 58);
    }
  }

  function drawAim() {
    if (!G.aiming) return;
    const p = G.player;
    const q = pull();
    if (q.len <= MIN_PULL) return;

    // 引っ張り線
    const ang = Math.atan2(G.aimPt.y - p.y, G.aimPt.x - p.x);
    const len = Math.min(q.len, MAX_PULL);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    const im = IMG.fx_drag_line;
    if (im && im.width) {
      ctx.globalAlpha = 0.55 + q.power * 0.4;
      ctx.drawImage(im, 10, -12, len, 24);
    }
    ctx.restore();

    // 軌道予測
    let px = p.x, py = p.y, vx = q.dx * q.speed, vy = q.dy * q.speed;
    const dt = 1 / 60;
    for (let i = 0; i < 70; i++) {
      vy += GRAV * dt;
      px += vx * dt; py += vy * dt;
      if (px < R || px > W - R) vx = -vx * 0.45;
      if (i % 4 === 0) {
        const t = i / 70;
        const s = 30 - t * 12;
        drawImg('fx_trajectory_dot', px - s / 2, py - s / 2, s, s, (1 - t) * 0.95);
      }
      let hit = false;
      const ps = G.world.platforms;
      for (let k = 0; k < ps.length; k++) {
        const pl = ps[k];
        if (!pl.alive) continue;
        if (px > pl.x && px < pl.x + pl.w && py + R > pl.y && py + R < pl.y + 30 && vy > 0) { hit = true; break; }
      }
      if (hit) break;
    }
  }

  function drawPlayer() {
    const p = G.player;
    const a = ASSET_FILES[p.sprite];
    const dw = a.w * SPR, dh = a.h * SPR;
    const bx = p.x - 96 * SPR;
    const by = (p.y + R) - 168 * SPR;
    ctx.save();
    if (p.invT > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(p.invT * 26));
    if (p.ang) {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      ctx.translate(-p.x, -p.y);
    }
    const im = IMG[p.sprite];
    if (im && im.width) ctx.drawImage(im, bx, by, dw, dh);
    ctx.restore();
  }

  function drawFx() {
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      const a = ASSET_FILES[f.img];
      const t = f.t / f.life;
      const s = lerp(f.s0, f.s1, t);
      const dw = a.w * s, dh = a.h * s;
      drawImg(f.img, f.x - dw / 2, f.y - dh / 2, dw, dh, (1 - t) * f.alpha, f.rot);
    }
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawBackground();

    ctx.save();
    const sx = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    const sy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.translate(sx, sy - G.cam.y);
    drawWorld();
    drawAim();
    drawFx();
    drawPlayer();
    ctx.restore();
  }

  /* ---------------- 画面遷移 ---------------- */
  function showResult(clear) {
    el.panel.classList.remove('hidden');
    el.panelTitle.textContent = clear ? 'いただきに とうちゃく！' : 'ちからつきた…';
    const m = Math.max(0, Math.round(-G.bestY / PX_PER_M));
    const time = clear ? (G.clearTime).toFixed(1) + '秒' : '—';
    el.panelStats.innerHTML =
      '<div>最高の高さ<b>' + m + 'm</b></div>' +
      '<div>コイン<b>' + G.coins + '</b></div>' +
      '<div>結晶<b>' + G.crystals + '</b></div>' +
      '<div>タイム<b>' + time + '</b></div>';
    el.btnPrimary.querySelector('span').textContent = 'もう一度';
    el.btnSecondary.querySelector('span').textContent = 'タイトルへ';
  }

  function showPause() {
    G.mode = 'pause';
    el.panel.classList.remove('hidden');
    el.panelTitle.textContent = '一時停止';
    const m = Math.max(0, Math.round(-G.bestY / PX_PER_M));
    el.panelStats.innerHTML =
      '<div>最高の高さ<b>' + m + 'm</b></div>' +
      '<div>コイン<b>' + G.coins + '</b></div>' +
      '<div>結晶<b>' + G.crystals + '</b></div>';
    el.btnPrimary.querySelector('span').textContent = 'つづける';
    el.btnSecondary.querySelector('span').textContent = 'さいしょから';
  }

  el.btnStart.addEventListener('click', startGame);
  el.btnPause.addEventListener('click', function () {
    if (G.mode === 'play') showPause();
  });
  el.btnSettings.addEventListener('click', function () {
    const on = Sfx.toggle();
    toast(on ? '効果音を ONにした' : '効果音を OFFにした', 1.6);
  });
  el.btnPrimary.addEventListener('click', function () {
    el.panel.classList.add('hidden');
    if (G.mode === 'pause') { G.mode = 'play'; }
    else startGame();
  });
  el.btnSecondary.addEventListener('click', function () {
    el.panel.classList.add('hidden');
    if (G.mode === 'pause') startGame();
    else {
      G.mode = 'title';
      el.title.classList.remove('hidden');
      document.getElementById('hud').classList.add('hidden');
    }
  });
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && G.mode === 'play') showPause();
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
    document.getElementById('hud').classList.add('hidden');
    // タイトル表示用に最低限の状態を用意する
    G.world = buildWorld(20261018);
    G.player = { x: W / 2, y: -60, vx: 0, vy: 0, grounded: true, stand: null, restT: 1, sprite: 'slime_idle', ang: 0, landT: 0, launchT: 0, blinkT: 2, invT: 0 };
    G.cam.y = -H + 300;
    buildHearts();
    requestAnimationFrame(frame);
  });

  window.__skyclimb = { G: G, start: startGame };
})();

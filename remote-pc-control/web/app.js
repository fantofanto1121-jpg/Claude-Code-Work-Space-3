/* Remote Pad - control client */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const gate = $('gate'), gateMsg = $('gate-msg'), gateHost = $('gate-host');
  const dot = $('dot'), hostEl = $('host'), latEl = $('lat');
  const pad = $('pad'), spot = $('spot');
  const shot = $('shot'), shotWrap = $('shot-wrap'), shotPh = $('shot-ph'), pingMark = $('ping-mark');
  const statsEl = $('stats'), ctx2d = shot.getContext('2d', { alpha: false });
  const strip = $('strip'), kb = $('kb'), typebox = $('typebox'), toastEl = $('toast');

  let ws = null, pin = '', ready = false, wantOpen = false, retry = 0, denied = false;
  /* ------------------------------------------------------------ settings */
  const SETTINGS_KEY = 'remotepad.settings';
  const DEFAULTS = {
    padSize: 100,     // trackpad height, percent of the available area
    gain: 1,          // cursor speed multiplier
    scroll: 1,        // scroll speed multiplier
    invert: false,    // reverse the scroll direction
    tapClick: true,   // a tap on the pad clicks
    shotWidth: 0,     // capture width in pixels, 0 picks it from the device
    monitor: -2,      // -2 follows the agent, -1 is every monitor, else an index
    quality: 78,      // jpeg quality for the screen view
    compact: false,   // hide the click row and scroll strip
    rotate: false,    // turn the capture 90 degrees to fill a portrait screen
    ovW: 44,          // overlay pad width, in vmin
    ovH: 38,          // overlay pad height, in vmin
    ovLeft: false,    // put the overlay pad on the left
    rotateSet: false, // true once the viewer has chosen a rotation themselves
    haptics: true
  };
  const S = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    Object.keys(DEFAULTS).forEach((k) => { if (k in saved) S[k] = saved[k]; });
  } catch (e) { /* defaults are fine */ }

  const saveSettings = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch (e) {}
  };

  let dragLocked = false;
  let streaming = false, awaiting = false, lastFrameAt = 0;
  let monitors = [], monIndex = -1;
  let tileQueue = [], frameTimes = [], bytesAcc = 0, statsAt = 0;

  /* ------------------------------------------------------------- utils */
  const buzz = (ms) => {
    if (!S.haptics) return;
    try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {}
  };
  let toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }
  const send = (obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  /* -------------------------------------------------------- connection */
  function setState(cls, label) {
    dot.className = 'dot' + (cls ? ' ' + cls : '');
    if (label) hostEl.textContent = label;
  }

  /* says which half of the connection is failing instead of hanging silently */
  async function diagnose(wsUrl) {
    gate.hidden = false;
    gateMsg.classList.add('err');
    gateMsg.textContent = '接続を確認しています…';
    if (location.protocol === 'https:') {
      gateMsg.textContent = 'https のページからは暗号化なしの LAN に繋げません。' +
                            'PC が表示している http:// の URL を直接開いてください。';
      return;
    }
    try {
      const r = await fetch('api/info', { cache: 'no-store' });
      const info = await r.json();
      gateMsg.textContent = 'ページは ' + info.host + ' から届いていますが、WebSocket (' +
                            wsUrl + ') が張れません。PC のウィンドウに connect と出るか確認してください。';
    } catch (e) {
      gateMsg.textContent = 'エージェントに届いていません。PC で起動しているか、' +
                            '同じ Wi-Fi か、アドレスが合っているか確認してください。';
    }
  }

  function connect(enteredPin) {
    pin = enteredPin;
    wantOpen = true; denied = false;
    setState('wait', '接続中…');
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => send({ t: 'auth', pin });
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') { tileQueue.push(ev.data); return; }
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'frame_end') { drawFrame(m); return; }
      if (m.t === 'monitor') {
        monIndex = m.i;
        if (m.monitors) monitors = m.monitors;
        renderMonitors();
        requestFrame(true);
        return;
      }
      if (m.t === 'ready') {
        ready = true; retry = 0;
        monitors = m.monitors || [];
        monIndex = typeof m.monitor === 'number' ? m.monitor : -1;
        const wanted = S.monitor;
        if (wanted >= -1 && wanted < monitors.length && wanted !== monIndex) {
          send({ t: 'monitor', i: wanted });
        }
        renderMonitors();
        localStorage.setItem('remotepad.pin', pin);
        gate.hidden = true;
        setState('on', m.host || 'PC');
        if (m.backend === 'stub') toast('シミュレーションモード（Windows 以外）');
      } else if (m.t === 'denied') {
        ready = false; wantOpen = false; denied = true;
        gate.hidden = false;
        gateMsg.textContent = 'PIN が違います';
        gateMsg.classList.add('err');
        setState('', '—');
      } else if (m.t === 'pong' && m.id) {
        latEl.textContent = Math.round(performance.now() - m.id) + ' ms';
      }
    };
    ws.onclose = () => {
      const was = ready;
      ready = false; ws = null; latEl.textContent = '';
      awaiting = false; tileQueue = [];
      setState('', was ? '切断されました' : '—');
      if (wantOpen && was) {
        retry = Math.min(retry + 1, 6);
        setState('wait', '再接続中…');
        setTimeout(() => wantOpen && connect(pin), 400 * retry);
      } else if (wantOpen && !denied) {
        diagnose(wsUrl);
      }
    };
    ws.onerror = () => { if (!ready) setState('', '—'); };
  }

  setInterval(() => {
    if (!ready) return;
    send({ t: 'ping', id: performance.now() });
    // a frame that never came back should not stall the stream
    if (streaming && awaiting && performance.now() - lastFrameAt > 3000) requestFrame(true);
  }, 2000);

  fetch('api/info').then((r) => r.json()).then((d) => {
    gateHost.textContent = d.host + ' / ' + d.screen.w + '×' + d.screen.h;
  }).catch(() => { gateHost.textContent = 'エージェントに接続できません'; });

  $('connect').onclick = () => {
    const v = $('pin').value.trim();
    if (v.length < 4) { gateMsg.textContent = '6 桁の PIN を入力'; return; }
    gateMsg.classList.remove('err');
    gateMsg.textContent = '接続中…';
    connect(v);
  };
  $('pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('connect').click(); });
  const qp = new URLSearchParams(location.search);
  const fromUrl = qp.get('pin');
  if (fromUrl) history.replaceState(null, '', location.pathname);   // keep the PIN out of the address bar
  const initialPin = fromUrl || localStorage.getItem('remotepad.pin');
  if (initialPin) { $('pin').value = initialPin; connect(initialPin); }

  $('disconnect').onclick = () => {
    wantOpen = false;
    if (ws) ws.close();
    gate.hidden = false;
    gateMsg.classList.remove('err');
    gateMsg.textContent = 'PC のウィンドウに表示された 6 桁を入力';
  };

  /* --------------------------------------------------------------- tabs */
  const views = { pad: $('view-pad'), screen: $('view-screen') };
  function showTab(name) {
    views.pad.hidden = name !== 'pad';
    views.screen.hidden = name !== 'screen';
    document.body.classList.toggle('tab-screen', name === 'screen');
    $('ov').hidden = name !== 'screen';
    $('tab-pad').setAttribute('aria-selected', String(name === 'pad'));
    $('tab-screen').setAttribute('aria-selected', String(name === 'screen'));
  }
  $('tab-pad').onclick = () => { setImmersive(false); showTab('pad'); };
  $('tab-screen').onclick = () => { showTab('screen'); setImmersive(true); };

  /* ------------------------------------------------------ motion queue */
  let qx = 0, qy = 0, queued = false;
  function pushMove(dx, dy) {
    qx += dx; qy += dy;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const ix = Math.round(qx), iy = Math.round(qy);
      if (ix || iy) { send({ t: 'rel', dx: ix, dy: iy }); qx -= ix; qy -= iy; }
    });
  }

  /* ---------------------------------------------------------- trackpad */
  /* the same gestures drive the solid pad and the see-through overlay */
  function attachPad(el, spotEl) {
    const pts = new Map();
    let startTime = 0, moved = 0, maxTouch = 0, pressTimer = null, scrollAcc = 0;

    const highlight = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', ((e.clientX - r.left) / r.width * 100) + '%');
      el.style.setProperty('--py', ((e.clientY - r.top) / r.height * 100) + '%');
      if (spotEl) {
        spotEl.style.left = (e.clientX - r.left) + 'px';
        spotEl.style.top = (e.clientY - r.top) + 'px';
      }
    };

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      maxTouch = Math.max(maxTouch, pts.size);
      if (pts.size === 1) {
        startTime = performance.now(); moved = 0; maxTouch = 1;
        el.classList.add('live');
        highlight(e);
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          if (pts.size === 1 && moved < 10 && !dragLocked) setDragLock(true);
        }, 520);
      }
    });

    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size >= 2) {
        const step = 26 / S.scroll;
        scrollAcc += S.invert ? -dy : dy;
        const notches = Math.trunc(scrollAcc / step);
        if (notches) { send({ t: 'scroll', dy: notches }); scrollAcc -= notches * step; }
        return;
      }
      highlight(e);
      const speed = Math.hypot(dx, dy);
      const gain = (1.1 + Math.min(speed / 6, 2.4)) * S.gain;
      pushMove(dx * gain, dy * gain);
    });

    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      clearTimeout(pressTimer);
      if (pts.size > 0) return;
      el.classList.remove('live');
      const quick = performance.now() - startTime < 260 && moved < 12;
      if (dragLocked) setDragLock(false);
      else if (quick && S.tapClick) {
        const which = maxTouch >= 3 ? 'middle' : maxTouch === 2 ? 'right' : 'left';
        send({ t: 'btn', b: which, s: 'click' });
        buzz(8);
      }
      maxTouch = 0; scrollAcc = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  attachPad(pad, spot);
  attachPad($('ov-pad'), $('ov-spot'));

  function setDragLock(on) {
    dragLocked = on;
    document.querySelectorAll('.padsurface').forEach((el) => el.classList.toggle('locked', on));
    $('drag-lock').setAttribute('aria-pressed', String(on));
    send({ t: 'btn', b: 'left', s: on ? 'down' : 'up' });
    buzz(on ? 18 : 8);
    toast(on ? 'ドラッグ固定: 左ボタンを押したまま' : 'ドラッグ固定を解除');
  }
  $('drag-lock').onclick = () => setDragLock(!dragLocked);

  /* ------------------------------------------------------ mouse buttons */
  document.querySelectorAll('[data-btn]').forEach((el) => {
    el.addEventListener('click', () => {
      send({ t: 'btn', b: el.dataset.btn, s: 'click' });
      buzz(8);
    });
  });

  /* ------------------------------------------------------ scroll strip */
  let stripY = null, stripAcc = 0;
  strip.addEventListener('pointerdown', (e) => {
    strip.setPointerCapture(e.pointerId);
    stripY = e.clientY; stripAcc = 0;
    strip.classList.add('live');
  });
  strip.addEventListener('pointermove', (e) => {
    if (stripY === null) return;
    const step = 18 / S.scroll;
    stripAcc += (S.invert ? -1 : 1) * (e.clientY - stripY);
    stripY = e.clientY;
    const notches = Math.trunc(stripAcc / step);
    if (notches) { send({ t: 'scroll', dy: notches }); stripAcc -= notches * step; }
  });
  const stripEnd = () => { stripY = null; strip.classList.remove('live'); };
  strip.addEventListener('pointerup', stripEnd);
  strip.addEventListener('pointercancel', stripEnd);

  /* ----------------------------------------------------------- screen */
  /* in automatic mode the width follows what the PC can actually keep up with */
  const AUTO_STEPS = [640, 768, 1024, 1280, 1440, 1920];
  let autoW = 0, slowRun = 0, fastRun = 0;

  function deviceTarget() {
    const px = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
    return Math.max(640, Math.min(1920, Math.round(px)));
  }

  function shotWidth() {
    if (S.shotWidth > 0) return Math.max(480, Math.min(2560, Math.round(S.shotWidth)));
    if (!autoW) {
      const target = deviceTarget();
      autoW = AUTO_STEPS.filter((w) => w <= target).pop() || AUTO_STEPS[0];
    }
    return autoW;
  }

  function adapt(ms) {
    if (S.shotWidth > 0 || typeof ms !== 'number') return;
    const at = AUTO_STEPS.indexOf(autoW);
    if (at < 0) return;
    if (ms > 130) { slowRun++; fastRun = 0; } else if (ms < 45) { fastRun++; slowRun = 0; }
    else { slowRun = 0; fastRun = 0; }
    if (slowRun >= 2 && at > 0) { autoW = AUTO_STEPS[at - 1]; slowRun = 0; requestFrame(true); }
    else if (fastRun >= 8 && at < AUTO_STEPS.length - 1 && AUTO_STEPS[at + 1] <= deviceTarget()) {
      autoW = AUTO_STEPS[at + 1]; fastRun = 0; requestFrame(true);
    }
  }

  function requestFrame(full) {
    if (!ready || views.screen.hidden) { awaiting = false; return; }
    awaiting = true;
    send({ t: 'frame', w: shotWidth(), q: S.quality, full: !!full });
  }

  async function drawFrame(m) {
    awaiting = false;
    lastFrameAt = performance.now();
    const items = tileQueue;
    tileQueue = [];

    let resized = false;
    if (shot.width !== m.w || shot.height !== m.h) {
      shot.width = m.w; shot.height = m.h;        // resizing clears the canvas
      shotWrap.style.setProperty('--shot-ar', m.w + ' / ' + m.h);
      resized = true;
    }

    const type = m.fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
    for (const buf of items) {
      const head = new DataView(buf);
      const x = head.getUint16(0), y = head.getUint16(2);
      try {
        const blob = new Blob([new Uint8Array(buf, 8)], { type: type });
        const bmp = await createImageBitmap(blob);
        ctx2d.drawImage(bmp, x, y);
        if (bmp.close) bmp.close();
      } catch (e) { /* skip a tile that failed to decode */ }
    }

    shot.hidden = false;
    shotPh.hidden = true;
    if (resized) layoutShot();

    const now = performance.now();
    frameTimes.push(now);
    if (frameTimes.length > 12) frameTimes.shift();
    bytesAcc += m.bytes || 0;
    if (now - statsAt > 700) {
      const span = (frameTimes[frameTimes.length - 1] - frameTimes[0]) / 1000;
      const fps = span > 0 ? (frameTimes.length - 1) / span : 0;
      const kbs = bytesAcc / ((now - statsAt) / 1000) / 1024;
      statsEl.textContent = streaming
        ? fps.toFixed(0) + ' fps · ' + kbs.toFixed(0) + ' KB/s · ' + m.w + '×' + m.h +
          (typeof m.ms === 'number' ? ' · ' + m.ms + ' ms' : '')
        : m.w + '×' + m.h + ' · ' + Math.round((m.bytes || 0) / 1024) + ' KB';
      bytesAcc = 0; statsAt = now;
    }

    // resizing cleared the canvas, so a partial frame has to be re-asked in full
    adapt(m.ms);
    if (resized && !m.full) { requestFrame(true); return; }
    if (streaming) setTimeout(() => requestFrame(false), 40);
  }

  function setLive(on) {
    streaming = on;
    statsEl.classList.toggle('live', on);
    $('imm-live').setAttribute('aria-pressed', String(on));
    if (on) {
      frameTimes = []; bytesAcc = 0; statsAt = performance.now();
      if (!awaiting) requestFrame(true);
    } else {
      statsEl.textContent = '停止中';
    }
  }

  /* size the canvas so its box is exactly the image, rotated 90 degrees when
     asked, and keep the touch mapping in step with it */
  function layoutShot() {
    const rotated = S.rotate && !views.screen.hidden;
    shot.classList.toggle('rot', rotated);
    if (!rotated) { shot.style.width = ''; shot.style.height = ''; return; }
    const r = shotWrap.getBoundingClientRect();
    const ar = shot.width / shot.height;
    // rotated, a w x h box covers h across and w down, so fit those instead
    const h = Math.max(1, Math.min(r.width, r.height / ar));
    shot.style.width = (h * ar) + 'px';
    shot.style.height = h + 'px';
  }

  function shotCoords(e) {
    if (!shot.width) return null;
    const r = shot.getBoundingClientRect();   // already includes the rotation
    if (!r.width || !r.height) return null;
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    // a quarter turn clockwise sends local (a,b) to (H-b, a) on screen
    const x = S.rotate ? v : u;
    const y = S.rotate ? 1 - u : v;
    return { x, y };
  }
  function markAt(e) {
    const r = shotWrap.getBoundingClientRect();
    pingMark.style.left = (e.clientX - r.left) + 'px';
    pingMark.style.top = (e.clientY - r.top) + 'px';
    pingMark.classList.remove('go');
    void pingMark.offsetWidth;
    pingMark.classList.add('go');
  }

  let shotPts = new Map(), shotStart = 0, shotMoved = 0, shotTimer = null, shotScroll = 0, shotLong = false;
  shotWrap.addEventListener('pointerdown', (e) => {
    shotWrap.setPointerCapture(e.pointerId);
    shotPts.set(e.pointerId, { y: e.clientY });
    if (shotPts.size !== 1) return;
    shotStart = performance.now(); shotMoved = 0; shotLong = false;
    const c = shotCoords(e);
    clearTimeout(shotTimer);
    shotTimer = setTimeout(() => {
      if (shotPts.size === 1 && shotMoved < 10 && c) {
        shotLong = true;
        send({ t: 'abs', x: c.x, y: c.y });
        send({ t: 'btn', b: 'right', s: 'click' });
        markAt(e); buzz(18); toast('右クリック');
        if (!streaming) setTimeout(() => requestFrame(false), 260);
      }
    }, 520);
  });
  shotWrap.addEventListener('pointermove', (e) => {
    const p = shotPts.get(e.pointerId);
    if (!p) return;
    const dy = e.clientY - p.y; p.y = e.clientY;
    shotMoved += Math.abs(dy) + 1;
    if (shotPts.size >= 2) {
      const step = 24 / S.scroll;
      shotScroll += S.invert ? -dy : dy;
      const notches = Math.trunc(shotScroll / step);
      if (notches) { send({ t: 'scroll', dy: notches }); shotScroll -= notches * step; }
      return;
    }
    const c = shotCoords(e);
    if (c) send({ t: 'abs', x: c.x, y: c.y });
  });
  function shotEnd(e) {
    if (!shotPts.has(e.pointerId)) return;
    shotPts.delete(e.pointerId);
    clearTimeout(shotTimer);
    if (shotPts.size > 0) return;
    const quick = performance.now() - shotStart < 300 && shotMoved < 14;
    if (!shotLong && quick) {
      const c = shotCoords(e);
      if (c) {
        send({ t: 'abs', x: c.x, y: c.y });
        send({ t: 'btn', b: 'left', s: 'click' });
        markAt(e); buzz(8);
        if (!streaming) setTimeout(() => requestFrame(false), 280);
      }
    }
    shotScroll = 0;
  }
  shotWrap.addEventListener('pointerup', shotEnd);
  shotWrap.addEventListener('pointercancel', shotEnd);

  /* --------------------------------------------------------- keyboard */
  const KEYS = [
    ['Esc', { k: 'escape' }], ['Tab', { k: 'tab' }], ['Enter', { k: 'enter' }], ['BS', { k: 'backspace' }],
    ['←', { k: 'left' }], ['↑', { k: 'up' }], ['↓', { k: 'down' }], ['→', { k: 'right' }],
    ['Ctrl+C', { k: 'c', mods: ['ctrl'] }], ['Ctrl+V', { k: 'v', mods: ['ctrl'] }],
    ['Ctrl+Z', { k: 'z', mods: ['ctrl'] }], ['Ctrl+A', { k: 'a', mods: ['ctrl'] }],
    ['Alt+Tab', { k: 'tab', mods: ['alt'] }], ['Win', { k: 'win' }], ['Del', { k: 'delete' }], ['F5', { k: 'f5' }],
    ['Home', { k: 'home' }], ['End', { k: 'end' }], ['PgUp', { k: 'pageup' }], ['PgDn', { k: 'pagedown' }]
  ];
  const keysBox = $('keys');
  KEYS.forEach(([label, msg]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { send(Object.assign({ t: 'key' }, msg)); buzz(8); };
    keysBox.appendChild(b);
  });
  /* ---- button keyboard: types without opening the device keyboard ---- */
  const kbKeys = $('kb-keys'), kbText = $('kb-text');
  const mods = { ctrl: false, alt: false, win: false, shift: false };
  let shiftLock = false, lastShiftTap = 0, symbolLayer = false;

  const DIGITS = '1234567890';
  const DIGITS_SHIFT = '!@#$%^&*()';
  const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const SYMBOL_ROWS = [
    ['-', '/', ':', ';', '(', ')', '¥', '&', '@', '"'],
    ['.', ',', '?', '!', "'", '`', '_', '+', '=', '*'],
    ['[', ']', '{', '}', '#', '%', '^', '\\', '|', '~']
  ];

  const activeMods = () => Object.keys(mods).filter((m) => mods[m]);

  function clearOneShot() {
    let changed = false;
    ['ctrl', 'alt', 'win'].forEach((m) => { if (mods[m]) { mods[m] = false; changed = true; } });
    if (mods.shift && !shiftLock) { mods.shift = false; changed = true; }
    if (changed) renderKeyboard();
  }

  function tapChar(ch, base) {
    const m = activeMods();
    // Shift alone is applied here, not on the PC: sending the literal character
    // keeps the key label honest whatever keyboard layout Windows is set to
    // (Shift+2 is @ on a US layout but " on a Japanese one).
    if (m.some((x) => x !== 'shift')) send({ t: 'key', k: base, mods: m });
    else send({ t: 'text', s: ch });
    buzz(6); clearOneShot();
  }

  function tapKey(name) {
    send({ t: 'key', k: name, mods: activeMods() });
    buzz(6); clearOneShot();
  }

  function toggleMod(name) {
    if (name === 'shift') {
      const now = performance.now();
      if (now - lastShiftTap < 420) { shiftLock = !shiftLock; mods.shift = shiftLock; }
      else { shiftLock = false; mods.shift = !mods.shift; }
      lastShiftTap = now;
    } else {
      mods[name] = !mods[name];
    }
    buzz(10); renderKeyboard();
  }

  function makeKey(spec) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = spec.label;
    if (spec.cls) b.className = spec.cls;
    if (spec.pressed !== undefined) b.setAttribute('aria-pressed', String(spec.pressed));
    if (spec.lock) b.dataset.lock = 'on';
    // pointerdown with preventDefault keeps focus where it is, so iOS never
    // slides its own keyboard up
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); spec.onTap(); });
    return b;
  }

  function renderKeyboard() {
    const rows = [[
      { label: 'Esc', cls: 'util', onTap: () => tapKey('escape') },
      { label: 'Tab', cls: 'util', onTap: () => tapKey('tab') },
      { label: 'Ctrl', cls: 'util', pressed: mods.ctrl, onTap: () => toggleMod('ctrl') },
      { label: 'Alt', cls: 'util', pressed: mods.alt, onTap: () => toggleMod('alt') },
      { label: 'Win', cls: 'util', pressed: mods.win, onTap: () => toggleMod('win') },
      { label: 'Del', cls: 'util', onTap: () => tapKey('delete') }
    ]];

    if (symbolLayer) {
      SYMBOL_ROWS.forEach((chars) => rows.push(
        chars.map((c) => ({ label: c, onTap: () => tapChar(c, c) }))));
    } else {
      const shown = mods.shift ? DIGITS_SHIFT : DIGITS;
      rows.push(DIGITS.split('').map((d, i) => ({
        label: shown[i], onTap: () => tapChar(shown[i], d)
      })));
      LETTER_ROWS.forEach((row, idx) => {
        const keys = row.split('').map((c) => {
          const ch = mods.shift ? c.toUpperCase() : c;
          return { label: ch, onTap: () => tapChar(ch, c) };
        });
        if (idx === 2) {
          keys.unshift({
            label: 'Shift', cls: 'util wide', pressed: mods.shift,
            lock: shiftLock, onTap: () => toggleMod('shift')
          });
        }
        rows.push(keys);
      });
    }

    rows.push([
      { label: symbolLayer ? 'abc' : '記号', cls: 'util wide',
        onTap: () => { symbolLayer = !symbolLayer; renderKeyboard(); } },
      { label: '←', onTap: () => tapKey('left') },
      { label: '↑', onTap: () => tapKey('up') },
      { label: '↓', onTap: () => tapKey('down') },
      { label: '→', onTap: () => tapKey('right') },
      { label: 'Space', cls: 'space', onTap: () => tapChar(' ', 'space') },
      { label: 'BS', onTap: () => tapKey('backspace') },
      { label: 'Enter', cls: 'wide', onTap: () => tapKey('enter') }
    ]);

    kbKeys.textContent = '';
    rows.forEach((row) => {
      const el = document.createElement('div');
      el.className = 'kbd-row';
      row.forEach((spec) => el.appendChild(makeKey(spec)));
      kbKeys.appendChild(el);
    });
    if (!kb.hidden) document.documentElement.style.setProperty('--kb-h', kb.offsetHeight + 'px');
  }

  function setKbMode(useText, focus) {
    kbText.hidden = !useText;
    kbKeys.hidden = useText;
    $('kb-mode-keys').setAttribute('aria-pressed', String(!useText));
    $('kb-mode-text').setAttribute('aria-pressed', String(useText));
    if (useText && focus) typebox.focus(); else typebox.blur();
    try { localStorage.setItem('remotepad.kbmode', useText ? 'text' : 'keys'); } catch (e) {}
  }
  $('kb-mode-keys').onclick = () => setKbMode(false, false);
  $('kb-mode-text').onclick = () => setKbMode(true, true);

  function setKbOpen(on) {
    kb.hidden = !on;
    document.body.classList.toggle('kb-open', on);
    $('ov-kb').setAttribute('aria-pressed', String(on));
    if (on) {
      // the overlay pad sits above the keyboard on narrow screens
      requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--kb-h', kb.offsetHeight + 'px');
      });
      if (!kbText.hidden) typebox.focus();
    } else {
      typebox.blur();
    }
  }
  $('kb-open').onclick = () => setKbOpen(true);
  $('kb-close').onclick = () => setKbOpen(false);
  $('ov-kb').onclick = () => setKbOpen(kb.hidden);

  renderKeyboard();
  let savedKbMode = null;
  try { savedKbMode = localStorage.getItem('remotepad.kbmode'); } catch (e) {}
  setKbMode(savedKbMode === 'text', false);

  let lastVal = '';
  typebox.addEventListener('input', () => {
    const v = typebox.value;
    if (v.startsWith(lastVal) && v.length > lastVal.length) {
      send({ t: 'text', s: v.slice(lastVal.length) });
    } else if (lastVal.startsWith(v) && v.length < lastVal.length) {
      for (let i = 0; i < lastVal.length - v.length; i++) send({ t: 'key', k: 'backspace' });
    } else if (v !== lastVal) {
      for (let i = 0; i < lastVal.length; i++) send({ t: 'key', k: 'backspace' });
      if (v) send({ t: 'text', s: v });
    }
    lastVal = v;
  });
  typebox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send({ t: 'key', k: 'enter' });
      typebox.value = ''; lastVal = '';
    }
  });

  /* --------------------------------------------------------- monitors */
  const monLabel = (i) => (i < 0 ? '全体' : '画面' + (i + 1));

  function chooseMonitor(i) {
    S.monitor = i; saveSettings();
    monIndex = i;
    renderMonitors();
    send({ t: 'monitor', i: i });
    buzz(8);
  }

  function renderMonitors() {
    const many = monitors.length > 1;
    $('monitor-row').hidden = !many;
    $('imm-mon').hidden = !many;
    $('imm-mon').textContent = monLabel(monIndex);

    const box = $('set-monitor');
    const want = monitors.map((m, i) => i).concat(many ? [-1] : []);
    if (box.dataset.built !== want.join(',')) {
      box.textContent = '';
      want.forEach((i) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = monLabel(i) + (i >= 0 ? ' · ' + monitors[i].w + '×' + monitors[i].h : '');
        b.onclick = () => chooseMonitor(i);
        box.appendChild(b);
      });
      box.dataset.built = want.join(',');
    }
    Array.from(box.children).forEach((b, n) => {
      b.setAttribute('aria-pressed', String(want[n] === monIndex));
    });
  }

  $('imm-mon').onclick = () => {
    if (monitors.length < 2) return;
    const order = monitors.map((m, i) => i).concat([-1]);
    const at = order.indexOf(monIndex);
    chooseMonitor(order[(at + 1) % order.length]);
  };

  /* --------------------------------------------------------- settings UI */
  const settingsSheet = $('settings');
  const RANGES = {
    padSize: (v) => Math.round(v) + '%',
    gain: (v) => Number(v).toFixed(1) + '倍',
    scroll: (v) => Number(v).toFixed(1) + '倍',
    ovW: (v) => Math.round(v) + '%',
    ovH: (v) => Math.round(v) + '%'
  };
  const TOGGLES = { invert: 'invert', tapClick: 'tapClick', compact: 'compact',
                    ovLeft: 'ovLeft', haptics: 'haptics' };

  function applySettings() {
    const root = document.documentElement.style;
    root.setProperty('--pad-size', S.padSize + '%');
    root.setProperty('--ovw', S.ovW);
    root.setProperty('--ovh', S.ovH);
    document.body.classList.toggle('compact', S.compact);
    document.body.classList.toggle('ov-left', S.ovLeft);
    $('ov').classList.toggle('left', S.ovLeft);

    Object.keys(RANGES).forEach((k) => {
      $('set-' + k).value = S[k];
      $('out-' + k).textContent = RANGES[k](S[k]);
    });
    Object.keys(TOGGLES).forEach((k) => {
      const el = $('set-' + k);
      el.setAttribute('aria-pressed', String(!!S[k]));
      el.textContent = S[k] ? 'オン' : 'オフ';
    });
    $('set-shotWidth').querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.w) === S.shotWidth));
    });
    $('set-quality').querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.q) === S.quality));
    });
    renderMonitors();
  }

  Object.keys(RANGES).forEach((k) => {
    $('set-' + k).addEventListener('input', (e) => {
      S[k] = Number(e.target.value);
      $('out-' + k).textContent = RANGES[k](S[k]);
      if (k === 'padSize') document.documentElement.style.setProperty('--pad-size', S.padSize + '%');
      if (k === 'ovW') document.documentElement.style.setProperty('--ovw', S.ovW);
      if (k === 'ovH') document.documentElement.style.setProperty('--ovh', S.ovH);
      saveSettings();
    });
  });

  Object.keys(TOGGLES).forEach((k) => {
    $('set-' + k).addEventListener('click', () => {
      S[k] = !S[k];
      saveSettings(); applySettings(); buzz(8);
    });
  });

  $('set-quality').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (!b) return;
    S.quality = Number(b.dataset.q);
    saveSettings(); applySettings(); buzz(8);
    if (!views.screen.hidden) requestFrame(true);
  });

  $('set-shotWidth').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-w]');
    if (!b) return;
    S.shotWidth = Number(b.dataset.w);
    autoW = 0; slowRun = 0; fastRun = 0;
    saveSettings(); applySettings(); buzz(8);
    if (!views.screen.hidden) requestFrame(true);
  });

  $('settings-open').onclick = () => { setKbOpen(false); settingsSheet.hidden = false; };
  $('settings-close').onclick = () => { settingsSheet.hidden = true; };
  $('settings-reset').onclick = () => {
    Object.assign(S, DEFAULTS);
    saveSettings(); applySettings(); toast('初期設定に戻しました');
  };
  $('kb-open').addEventListener('click', () => { settingsSheet.hidden = true; });

  applySettings();

  /* ------------------------------------------------- fullscreen / immersive */
  const immBar = $('imm-bar');
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;
  const canFullscreen = !!(document.documentElement.requestFullscreen ||
                           document.documentElement.webkitRequestFullscreen);

  async function enterFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return false;
    try { await fn.call(el, { navigationUI: 'hide' }); return true; } catch (e) { return false; }
  }
  async function leaveFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn || !(document.fullscreenElement || document.webkitFullscreenElement)) return;
    try { await fn.call(document); } catch (e) {}
  }
  const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  function homeScreenHint() {
    toast(standalone
      ? 'この端末では既にアドレスバーは出ていません'
      : 'iPhone は共有メニューの「ホーム画面に追加」で URL バーが消えます');
  }

  $('fs-toggle').onclick = async () => {
    if (inFullscreen()) { await leaveFullscreen(); return; }
    if (!await enterFullscreen()) homeScreenHint();
  };
  if (standalone && !canFullscreen) $('fs-toggle').hidden = true;

  async function setImmersive(on) {
    if (on === document.body.classList.contains('immersive')) return;
    document.body.classList.toggle('immersive', on);
    immBar.hidden = !on;
    if (on) {
      await enterFullscreen();
      try { await (screen.orientation && screen.orientation.lock('landscape')); } catch (e) {}
      if (!inFullscreen() && !standalone) homeScreenHint();
      autoRotate();
      $('imm-rotate').setAttribute('aria-pressed', String(S.rotate));
      layoutShot();
      setLive(true);
      if (S.rotate && !S.rotateSet) toast('縦画面に合わせて映像を回しました（「回転」で戻せます）');
    } else {
      setLive(false);
      try { screen.orientation && screen.orientation.unlock(); } catch (e) {}
      await leaveFullscreen();
      layoutShot();
    }
  }
  const immersive = () => document.body.classList.contains('immersive');

  $('imm-exit').onclick = () => { setImmersive(false); showTab('pad'); };
  // until the viewer picks for themselves, match the rotation to how the
  // device is being held, so the capture always fills as much as it can
  function autoRotate() {
    if (S.rotateSet) return;
    const want = window.innerHeight > window.innerWidth;
    if (S.rotate !== want) {
      S.rotate = want;
      $('imm-rotate').setAttribute('aria-pressed', String(want));
      layoutShot();
    }
  }

  $('imm-rotate').onclick = () => {
    S.rotateSet = true;
    S.rotate = !S.rotate;
    saveSettings(); layoutShot(); buzz(8);
    $('imm-rotate').setAttribute('aria-pressed', String(S.rotate));
    toast(S.rotate ? '映像を 90 度回転しました' : '回転を戻しました');
  };
  $('imm-kb').onclick = () => setKbOpen(kb.hidden);
  $('imm-live').onclick = () => setLive(!streaming);

  document.addEventListener('fullscreenchange', () => {
    $('fs-toggle').setAttribute('aria-pressed', String(inFullscreen()));
    // leaving fullscreen with a system gesture should leave the immersive view too
    if (!inFullscreen() && immersive()) { setImmersive(false); showTab('pad'); }
  });

  // the canvas keeps its pixel size, but its box changes on rotate
  window.addEventListener('resize', () => {
    if (!kb.hidden) document.documentElement.style.setProperty('--kb-h', kb.offsetHeight + 'px');
    if (immersive()) autoRotate();
    layoutShot();
    if (immersive()) requestFrame(false);
  });

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  showTab('pad');
})();

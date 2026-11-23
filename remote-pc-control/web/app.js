/* Remote Pad - control client */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const gate = $('gate'), gateMsg = $('gate-msg'), gateHost = $('gate-host');
  const dot = $('dot'), hostEl = $('host'), latEl = $('lat');
  const pad = $('pad'), spot = $('spot');
  const shot = $('shot'), shotWrap = $('shot-wrap'), shotPh = $('shot-ph'), pingMark = $('ping-mark');
  const strip = $('strip'), kb = $('kb'), typebox = $('typebox'), toastEl = $('toast');

  let ws = null, pin = '', ready = false, wantOpen = false, retry = 0;
  let dragLocked = false, autoMs = 0, autoTimer = null, shotBusy = false;

  /* ------------------------------------------------------------- utils */
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
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

  function connect(enteredPin) {
    pin = enteredPin;
    wantOpen = true;
    setState('wait', '接続中…');
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => send({ t: 'auth', pin });
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'ready') {
        ready = true; retry = 0;
        localStorage.setItem('remotepad.pin', pin);
        gate.hidden = true;
        setState('on', m.host || 'PC');
        if (m.backend === 'stub') toast('シミュレーションモード（Windows 以外）');
      } else if (m.t === 'denied') {
        ready = false; wantOpen = false;
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
      setState('', was ? '切断されました' : '—');
      if (wantOpen && was) {
        retry = Math.min(retry + 1, 6);
        setState('wait', '再接続中…');
        setTimeout(() => wantOpen && connect(pin), 400 * retry);
      }
    };
    ws.onerror = () => { if (!ready) { gateMsg.textContent = '接続できません'; gateMsg.classList.add('err'); } };
  }

  setInterval(() => ready && send({ t: 'ping', id: performance.now() }), 2000);

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
    $('tab-pad').setAttribute('aria-selected', String(name === 'pad'));
    $('tab-screen').setAttribute('aria-selected', String(name === 'screen'));
    if (name === 'screen') refreshShot();
  }
  $('tab-pad').onclick = () => showTab('pad');
  $('tab-screen').onclick = () => showTab('screen');

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
  const pts = new Map();
  let startTime = 0, moved = 0, maxTouch = 0, pressTimer = null, scrollAcc = 0;

  function padPoint(e) {
    const r = pad.getBoundingClientRect();
    pad.style.setProperty('--px', ((e.clientX - r.left) / r.width * 100) + '%');
    pad.style.setProperty('--py', ((e.clientY - r.top) / r.height * 100) + '%');
    spot.style.left = (e.clientX - r.left) + 'px';
    spot.style.top = (e.clientY - r.top) + 'px';
  }

  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    maxTouch = Math.max(maxTouch, pts.size);
    if (pts.size === 1) {
      startTime = performance.now(); moved = 0; maxTouch = 1;
      pad.classList.add('live');
      padPoint(e);
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (pts.size === 1 && moved < 10 && !dragLocked) setDragLock(true);
      }, 520);
    }
  });

  pad.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size >= 2) {
      scrollAcc += dy;
      const notches = Math.trunc(scrollAcc / 26);
      if (notches) { send({ t: 'scroll', dy: notches }); scrollAcc -= notches * 26; }
      return;
    }
    padPoint(e);
    const speed = Math.hypot(dx, dy);
    const gain = 1.1 + Math.min(speed / 6, 2.4);
    pushMove(dx * gain, dy * gain);
  });

  function padEnd(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    clearTimeout(pressTimer);
    if (pts.size > 0) return;
    pad.classList.remove('live');
    const quick = performance.now() - startTime < 260 && moved < 12;
    if (dragLocked) { setDragLock(false); }
    else if (quick) {
      const which = maxTouch >= 3 ? 'middle' : maxTouch === 2 ? 'right' : 'left';
      send({ t: 'btn', b: which, s: 'click' });
      buzz(8);
    }
    maxTouch = 0; scrollAcc = 0;
  }
  pad.addEventListener('pointerup', padEnd);
  pad.addEventListener('pointercancel', padEnd);

  function setDragLock(on) {
    dragLocked = on;
    pad.classList.toggle('locked', on);
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
    stripAcc += e.clientY - stripY;
    stripY = e.clientY;
    const notches = Math.trunc(stripAcc / 18);
    if (notches) { send({ t: 'scroll', dy: notches }); stripAcc -= notches * 18; }
  });
  const stripEnd = () => { stripY = null; strip.classList.remove('live'); };
  strip.addEventListener('pointerup', stripEnd);
  strip.addEventListener('pointercancel', stripEnd);

  /* ----------------------------------------------------------- screen */
  function shotWidth() {
    const w = shotWrap.clientWidth * (window.devicePixelRatio || 1);
    return Math.max(480, Math.min(1600, Math.round(w)));
  }
  function refreshShot() {
    if (!ready || shotBusy || views.screen.hidden) return;
    shotBusy = true;
    const img = new Image();
    img.onload = () => {
      shot.src = img.src; shot.hidden = false; shotPh.hidden = true;
      shotBusy = false;
    };
    img.onerror = () => { shotBusy = false; shotPh.textContent = '画面を取得できません'; };
    img.src = 'api/shot?pin=' + encodeURIComponent(pin) + '&w=' + shotWidth() + '&_=' + Date.now();
  }
  $('shot-refresh').onclick = refreshShot;

  function setAuto(ms, el) {
    autoMs = ms;
    ['auto-off', 'auto-1', 'auto-3'].forEach((id) => $(id).setAttribute('aria-pressed', String($(id) === el)));
    clearInterval(autoTimer);
    if (ms) autoTimer = setInterval(refreshShot, ms);
  }
  $('auto-off').onclick = (e) => setAuto(0, e.currentTarget);
  $('auto-1').onclick = (e) => setAuto(1000, e.currentTarget);
  $('auto-3').onclick = (e) => setAuto(3000, e.currentTarget);

  /* map a touch on the <img> (object-fit: contain) to normalised screen coords */
  function shotCoords(e) {
    if (!shot.naturalWidth) return null;
    const r = shot.getBoundingClientRect();
    const scale = Math.min(r.width / shot.naturalWidth, r.height / shot.naturalHeight);
    const w = shot.naturalWidth * scale, h = shot.naturalHeight * scale;
    const x = (e.clientX - (r.left + (r.width - w) / 2)) / w;
    const y = (e.clientY - (r.top + (r.height - h) / 2)) / h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
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
        setTimeout(refreshShot, 260);
      }
    }, 520);
  });
  shotWrap.addEventListener('pointermove', (e) => {
    const p = shotPts.get(e.pointerId);
    if (!p) return;
    const dy = e.clientY - p.y; p.y = e.clientY;
    shotMoved += Math.abs(dy) + 1;
    if (shotPts.size >= 2) {
      shotScroll += dy;
      const notches = Math.trunc(shotScroll / 24);
      if (notches) { send({ t: 'scroll', dy: notches }); shotScroll -= notches * 24; }
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
        setTimeout(refreshShot, 280);
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
  $('kb-open').onclick = () => { kb.hidden = false; typebox.focus(); };
  $('kb-close').onclick = () => { kb.hidden = true; typebox.blur(); };

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

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  showTab('pad');
})();

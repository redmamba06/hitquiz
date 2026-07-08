/* ============================================================
   HitQuiz — strato di rete per il multiplayer online
   - Trasporto reale: Firebase Realtime Database via REST + SSE
     (EventSource per ascoltare, fetch PUT/PATCH/POST/DELETE per scrivere).
     Nessun SDK: l'app resta senza dipendenze.
   - Trasporto "mock": backend in memoria condiviso, per testare la
     sincronizzazione tra più client simulati nella stessa pagina.
   Modello: l'HOST fa da arbitro (possiede lo stato di gioco e lo scrive
   nel nodo della stanza); i client leggono lo stato e scrivono i propri
   input (buzz, risposte). Le stanze vivono sotto /rooms/{CODICE}.
   ============================================================ */

'use strict';

/* ---------- trasporto Firebase (REST + SSE) ---------- */

function firebaseTransport(databaseURL) {
  const base = databaseURL.replace(/\/+$/, '');
  const url = (path) => `${base}/${path}.json`;

  async function write(path, value, method) {
    const res = await fetch(url(path), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: value === undefined ? undefined : JSON.stringify(value)
    });
    if (!res.ok) throw new Error('firebase ' + res.status);
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  return {
    kind: 'firebase',
    get: (path) => fetch(url(path)).then(r => (r.ok ? r.json() : null)),
    set: (path, v) => write(path, v, 'PUT'),
    update: (path, v) => write(path, v, 'PATCH'),
    push: (path, v) => write(path, v, 'POST'),
    remove: (path) => write(path, undefined, 'DELETE'),
    // valore "timestamp del server" (per il buzzer equo)
    serverTime: () => ({ '.sv': 'timestamp' }),
    // ascolta un percorso: onEvent(type, path, data). Ritorna funzione di stop.
    stream(path, onEvent) {
      let es;
      try {
        es = new EventSource(url(path));
      } catch {
        return () => {};
      }
      const handler = (type) => (e) => {
        if (!e.data) return;
        try { const d = JSON.parse(e.data); onEvent(type, d.path, d.data); } catch {}
      };
      es.addEventListener('put', handler('put'));
      es.addEventListener('patch', handler('patch'));
      return () => { try { es.close(); } catch {} };
    }
  };
}

/* ---------- trasporto mock (in memoria, per i test) ---------- */

const _mockBackend = { data: {}, listeners: [] };

function _mockGet(path) {
  const parts = path.split('/').filter(Boolean);
  let node = _mockBackend.data;
  for (const p of parts) { if (node == null) return null; node = node[p]; }
  return node === undefined ? null : node;
}
function _mockSetPath(path, value) {
  const parts = path.split('/').filter(Boolean);
  let node = _mockBackend.data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] == null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
}
function _mockEmit(path) {
  // notifica i listener il cui percorso è uguale o antenato di quello scritto
  for (const l of _mockBackend.listeners) {
    if (path === l.path || path.startsWith(l.path + '/') || l.path.startsWith(path + '/') || l.path === '') {
      const rel = path === l.path ? '/' : '/' + path.slice(l.path.length).replace(/^\//, '');
      setTimeout(() => l.onEvent('put', l.path === path ? '/' : rel, _mockGet(path)), 8);
    }
  }
}

function mockTransport() {
  let counter = 0;
  const deepClone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  return {
    kind: 'mock',
    get: (path) => Promise.resolve(deepClone(_mockGet(path))),
    set: (path, v) => { _mockSetPath(path, deepClone(v)); _mockEmit(path); return Promise.resolve(); },
    update: (path, v) => {
      const cur = _mockGet(path) || {};
      const merged = Object.assign({}, cur, deepClone(v));
      _mockSetPath(path, merged); _mockEmit(path); return Promise.resolve();
    },
    push: (path, v) => {
      const id = 'k' + (Date.now().toString(36)) + (counter++);
      _mockSetPath(path + '/' + id, deepClone(v)); _mockEmit(path + '/' + id);
      return Promise.resolve({ name: id });
    },
    remove: (path) => { _mockSetPath(path, null); _mockEmit(path); return Promise.resolve(); },
    serverTime: () => Date.now(),
    stream(path, onEvent) {
      const l = { path: path.replace(/\/+$/, ''), onEvent };
      _mockBackend.listeners.push(l);
      // stato iniziale
      setTimeout(() => onEvent('put', '/', deepClone(_mockGet(path))), 4);
      return () => {
        const i = _mockBackend.listeners.indexOf(l);
        if (i >= 0) _mockBackend.listeners.splice(i, 1);
      };
    }
  };
}

/* ---------- identità del dispositivo ---------- */

function deviceId() {
  let id = localStorage.getItem('gs_device_id');
  if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem('gs_device_id', id); }
  return id;
}

function randomRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente caratteri ambigui
  let c = '';
  for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
  return c;
}

/* ---------- stanza ---------- */

class Room {
  constructor(transport, code) {
    this.t = transport;
    this.code = code;
    this.base = 'rooms/' + code;
    this.me = deviceId();
    this._subs = [];
  }
  path(sub) { return this.base + (sub ? '/' + sub : ''); }
  get(sub) { return this.t.get(this.path(sub)); }
  set(sub, v) { return this.t.set(this.path(sub), v); }
  update(sub, v) { return this.t.update(this.path(sub), v); }
  push(sub, v) { return this.t.push(this.path(sub), v); }
  remove(sub) { return this.t.remove(this.path(sub)); }
  serverTime() { return this.t.serverTime(); }
  // ascolta un sottopercorso della stanza: cb(valueAtThatPath)
  watch(sub, cb) {
    const full = this.path(sub);
    const stop = this.t.stream(full, () => { this.t.get(full).then(cb); });
    this._subs.push(stop);
    return stop;
  }
  destroy() { this._subs.forEach(s => { try { s(); } catch {} }); this._subs = []; }
}

/* ---------- API pubblica ---------- */

const Net = {
  _transport: null,
  configureFirebase(databaseURL) {
    this._transport = firebaseTransport(databaseURL);
    localStorage.setItem('gs_fb_url', databaseURL);
  },
  useMock() { this._transport = mockTransport(); },
  configured() { return !!this._transport; },
  kind() { return this._transport ? this._transport.kind : null; },
  restore() {
    const u = localStorage.getItem('gs_fb_url');
    if (u) { this.configureFirebase(u); return true; }
    return false;
  },
  firebaseUrl() { return localStorage.getItem('gs_fb_url') || ''; },
  deviceId,
  randomRoomCode,
  room(code) {
    if (!this._transport) throw new Error('rete non configurata');
    return new Room(this._transport, code.toUpperCase());
  },
  // verifica la connessione scrivendo/leggendo un valore usa e getta
  async testConnection() {
    if (!this._transport) throw new Error('rete non configurata');
    const probe = 'health/' + deviceId();
    const val = Date.now();
    await this._transport.set(probe, val);
    const back = await this._transport.get(probe);
    await this._transport.remove(probe);
    if (back !== val) throw new Error('valore non corrisponde');
    return true;
  }
};

window.Net = Net;

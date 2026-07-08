/* ============================================================
   HitQuiz — multiplayer online: lobby + stanza condivisa
   Dipende da net.js (Net/Room) e dalle utility globali di app.js
   (EMOJIS, escapeHtml, toast, show, normalize, sfx, vibrate…).
   ============================================================ */

'use strict';

const online = {
  room: null,
  isHost: false,
  code: null,
  players: {},          // deviceId -> {name, emoji, lastSeen, host}
  heartbeat: null,
  pruneTimer: null,
  myName: localStorage.getItem('gs_players') ? '' : ''
};

const PLAYER_STALE_MS = 20000;

function onlineLink(code) {
  return location.origin + location.pathname + '?room=' + code;
}

/* ---------- configurazione Firebase (una tantum) ---------- */

// accetta l'URL del database, oppure l'intero oggetto/snippet di config Firebase
function parseFirebaseInput(text) {
  const t = (text || '').trim();
  if (!t) return null;
  // già un URL del database?
  let m = t.match(/https?:\/\/[a-z0-9-]+(?:-default-rtdb)?[a-z0-9.-]*\.(?:firebaseio\.com|firebasedatabase\.app)/i);
  if (m) return m[0];
  // databaseURL: "..." dentro uno snippet
  m = t.match(/databaseURL\s*[:=]\s*["']([^"']+)["']/);
  if (m) return m[1];
  // solo il projectId? costruisci l'URL di default
  m = t.match(/["']?projectId["']?\s*[:=]\s*["']([^"']+)["']/) || t.match(/^([a-z0-9-]+)$/i);
  if (m) return `https://${m[1]}-default-rtdb.firebaseio.com`;
  return null;
}

function refreshOnlineConfigUi() {
  const url = Net.firebaseUrl();
  $('#fb-url-current').textContent = url || '—';
  $('#online-config-box').classList.toggle('hidden', !!url);
  $('#online-ready-box').classList.toggle('hidden', !url);
}

async function saveFirebaseConfig() {
  const raw = $('#fb-config-input').value;
  const url = parseFirebaseInput(raw);
  if (!url) { toast('Non riconosco l\'URL: incolla il databaseURL o il projectId'); return; }
  Net.configureFirebase(url);
  toast('Configurazione salvata, provo la connessione…');
  refreshOnlineConfigUi();
  $('#online-config-warn') && $('#online-config-warn').classList.add('hidden');
  await runNetTest();
}

async function runNetTest() {
  const box = $('#online-test-result');
  box.textContent = '⏳ Test connessione al database…';
  try {
    await Net.testConnection();
    box.textContent = '✅ Connessione al database riuscita!';
    return true;
  } catch (e) {
    box.innerHTML = '❌ Non riesco a scrivere sul database.<br><span class="muted">Controlla che le regole permettano lettura/scrittura e che l\'URL sia giusto. Dettaglio: ' + escapeHtml(e.message || 'errore') + '</span>';
    return false;
  }
}

/* ---------- creazione / ingresso ---------- */

function myEmojiFor(id, playersObj) {
  const ids = Object.keys(playersObj || {}).sort((a, b) =>
    (playersObj[a].joinedAt || 0) - (playersObj[b].joinedAt || 0));
  const idx = ids.indexOf(id);
  return EMOJIS[(idx < 0 ? ids.length : idx) % EMOJIS.length];
}

async function hostCreateRoom() {
  if (!Net.configured()) { openModal('#modal-online-config'); return; }
  const name = ($('#online-name-input').value || '').trim();
  if (!name) { toast('Scrivi il tuo nome!'); return; }
  localStorage.setItem('gs_my_name', name);

  let code, exists;
  do { code = Net.randomRoomCode(); exists = await Net.room(code).get('meta').catch(() => null); }
  while (exists);

  online.room = Net.room(code);
  online.code = code;
  online.isHost = true;

  const now = Date.now();
  await online.room.set('meta', { host: online.room.me, state: 'lobby', createdAt: online.room.serverTime() });
  await online.room.set('players/' + online.room.me, {
    name, joinedAt: online.room.serverTime(), lastSeen: now, host: true
  });

  enterLobby();
}

async function joinRoom(code) {
  if (!Net.configured()) { pendingJoinCode = code; openModal('#modal-online-config'); return; }
  const name = ($('#online-name-input').value || localStorage.getItem('gs_my_name') || '').trim();
  if (!name) { pendingJoinCode = code; showJoinNamePrompt(code); return; }
  localStorage.setItem('gs_my_name', name);

  const room = Net.room(code);
  const meta = await room.get('meta').catch(() => null);
  if (!meta) { toast('Stanza «' + code + '» non trovata 🤔'); return; }

  online.room = room;
  online.code = code.toUpperCase();
  online.isHost = meta.host === room.me;

  await online.room.set('players/' + online.room.me, {
    name, joinedAt: online.room.serverTime(), lastSeen: Date.now(), host: online.isHost
  });

  enterLobby();
}

let pendingJoinCode = null;

function showJoinNamePrompt(code) {
  show('screen-online-home');
  $('#online-home-title').textContent = 'Entra nella stanza ' + code.toUpperCase();
  $('#online-name-input').value = localStorage.getItem('gs_my_name') || '';
  $('#online-name-input').focus();
  $('#btn-online-create').classList.add('hidden');
  $('#btn-online-join-confirm').classList.remove('hidden');
  $('#btn-online-join-confirm').onclick = () => joinRoom(code);
}

/* ---------- lobby ---------- */

function enterLobby() {
  show('screen-lobby');
  $('#lobby-code').textContent = online.code;
  $('#lobby-link').textContent = onlineLink(online.code);
  $('#btn-lobby-start').classList.toggle('hidden', !online.isHost);
  $('#lobby-host-hint').classList.toggle('hidden', online.isHost);

  startHeartbeat();

  online.room.watch('players', (players) => {
    online.players = players || {};
    renderLobbyPlayers();
  });
  online.room.watch('meta/state', (state) => {
    if (state === 'playing' && document.querySelector('.screen.active').id === 'screen-lobby') {
      // la partita è iniziata (avviata dall'host): entreremo qui nella fase 2
      toast('La partita sta per iniziare! 🎮');
    }
  });
}

function startHeartbeat() {
  stopHeartbeat();
  online.heartbeat = setInterval(() => {
    if (online.room) online.room.update('players/' + online.room.me, { lastSeen: Date.now() }).catch(() => {});
  }, 5000);
  online.pruneTimer = setInterval(renderLobbyPlayers, 4000);
}
function stopHeartbeat() {
  clearInterval(online.heartbeat); online.heartbeat = null;
  clearInterval(online.pruneTimer); online.pruneTimer = null;
}

function activeLobbyPlayers() {
  const now = Date.now();
  return Object.entries(online.players)
    .filter(([, p]) => p && (now - (p.lastSeen || 0) < PLAYER_STALE_MS))
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
}

function renderLobbyPlayers() {
  const list = activeLobbyPlayers();
  const box = $('#lobby-players');
  box.innerHTML = list.map(([id, p], i) => `
    <div class="player-row">
      <span class="p-emoji">${EMOJIS[i % EMOJIS.length]}</span>
      <span class="p-name">${escapeHtml(p.name)}${id === online.room.me ? ' <span class="muted">(tu)</span>' : ''}</span>
      ${p.host ? '<span class="chip">host</span>' : ''}
    </div>`).join('') || '<p class="muted">Nessuno ancora in stanza…</p>';
  $('#lobby-count').textContent = list.length + (list.length === 1 ? ' giocatore' : ' giocatori');
  if (online.isHost) $('#btn-lobby-start').disabled = list.length < 2;
}

async function leaveRoom() {
  stopHeartbeat();
  try {
    if (online.room) {
      await online.room.remove('players/' + online.room.me);
      // se se ne va l'host e non resta nessuno, ripulisci la stanza
      if (online.isHost) {
        const left = await online.room.get('players').catch(() => null);
        if (!left || !Object.keys(left).length) await online.room.remove('');
      }
    }
  } catch {}
  if (online.room) online.room.destroy();
  online.room = null; online.code = null; online.isHost = false; online.players = {};
  history.replaceState({}, '', location.pathname);
  show('screen-home');
}

async function hostStartGame() {
  const list = activeLobbyPlayers();
  if (list.length < 2) { toast('Servono almeno 2 giocatori!'); return; }
  // Fase 2 (in arrivo): scelta modalità/impostazioni e round sincronizzati.
  await online.room.update('meta', { state: 'playing' });
  toast('🚧 La partita sincronizzata è in arrivo nel prossimo aggiornamento!', 4000);
  await online.room.update('meta', { state: 'lobby' });
}

/* ---------- ingresso schermata online ---------- */

function openOnlineHome() {
  Net.restore();
  show('screen-online-home');
  $('#online-home-title').textContent = 'Gioca online';
  $('#online-name-input').value = localStorage.getItem('gs_my_name') || '';
  $('#btn-online-create').classList.remove('hidden');
  $('#btn-online-join-confirm').classList.add('hidden');
  $('#online-config-warn').classList.toggle('hidden', Net.configured());
}

function bindOnlineEvents() {
  $('#btn-online-home').onclick = () => { openOnlineHome(); };
  $('#btn-online-create').onclick = hostCreateRoom;
  $('#btn-online-config-open').onclick = () => { refreshOnlineConfigUi(); openModal('#modal-online-config'); };
  $('#btn-fb-save').onclick = saveFirebaseConfig;
  $('#btn-fb-test').onclick = runNetTest;
  $('#btn-fb-reset').onclick = () => {
    localStorage.removeItem('gs_fb_url'); Net._transport = null; refreshOnlineConfigUi(); toast('Configurazione rimossa');
  };
  $('#btn-fb-config-done').onclick = () => {
    closeModals();
    if (pendingJoinCode) { const c = pendingJoinCode; pendingJoinCode = null; joinRoom(c); }
  };
  $('#lobby-link').onclick = () => {
    const link = onlineLink(online.code);
    if (navigator.share) navigator.share({ title: 'HitQuiz', text: 'Entra nella mia partita!', url: link }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => toast('Link copiato! 📋')).catch(() => {});
  };
  $('#btn-lobby-share').onclick = () => {
    const link = onlineLink(online.code);
    if (navigator.share) navigator.share({ title: 'HitQuiz', text: 'Entra nella mia partita HitQuiz!', url: link }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => toast('Link copiato! 📋')).catch(() => {});
  };
  $('#btn-lobby-start').onclick = hostStartGame;
  $('#btn-lobby-leave').onclick = leaveRoom;
  $('#redirect-uri-box2') && ($('#redirect-uri-box2').textContent = onlineLink('XXXX'));

  $('#fb-rules-box').textContent = '{\n  "rules": {\n    "rooms": { ".read": true, ".write": true },\n    "health": { ".read": true, ".write": true }\n  }\n}';
}

// se si apre un link con ?room=CODE, entra nel flusso di ingresso
function handleRoomLink() {
  const code = new URLSearchParams(location.search).get('room');
  if (!code) return false;
  Net.restore();
  const name = localStorage.getItem('gs_my_name');
  if (name && Net.configured()) joinRoom(code);
  else showJoinNamePrompt(code);
  return true;
}

window.online = online;
window.handleRoomLink = handleRoomLink;
window.bindOnlineEvents = bindOnlineEvents;
window.openOnlineHome = openOnlineHome;

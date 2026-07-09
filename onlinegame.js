/* ============================================================
   HitQuiz — gioco online sincronizzato (Fase 2)
   Modello host-arbitro: l'host possiede lo stato e lo scrive in
   /rooms/{CODICE}/game; i client leggono e mandano input in .../input.
   Modalità: quiz e scrittura, stile a turni o a prenotazione.
   Dipende da net.js/online.js e dagli helper globali di app.js.
   ============================================================ */

'use strict';

const og = {
  active: false,
  role: null,          // 'host' | 'client'
  cfg: null,
  players: [],         // [{id,name,emoji,score}]
  pool: [],
  used: new Set(),
  correctIndex: -1,    // solo host: indice della risposta giusta nel round corrente
  correctTrack: null,  // solo host
  phase: null,
  round: 0,
  timerId: null,
  hostTimer: null,
  localAudioReady: false,
  lastGame: null,
  watchers: []
};

function ogRoom() { return online.room; }
function ogMe() { return online.room.me; }

/* ---------- avvio (host) ---------- */

function readHostSettings() {
  const sel = (grp, attr, def) => {
    const el = document.querySelector('#' + grp + ' .pill.selected');
    return el ? el.dataset[attr] : def;
  };
  return {
    mode: sel('og-mode-pills', 'ogmode', 'quiz'),
    style: sel('og-style-pills', 'ogstyle', 'buzz'),
    guess: sel('og-guess-pills', 'ogguess', 'title'),
    source: sel('og-source-pills', 'ogsource', 'famous'),
    genre: sel('og-genre-pills', 'oggenre', 'rap-ita'),
    target: +sel('og-target-pills', 'ogtarget', '1000'),
    timer: +sel('og-timer-pills', 'ogtimer', '15')
  };
}

async function ogHostStart() {
  const list = activeLobbyPlayers();
  if (list.length < 2) { toast('Servono almeno 2 giocatori!'); return; }
  const cfg = readHostSettings();

  const btn = $('#btn-lobby-start');
  btn.disabled = true; btn.textContent = '⏳ Preparo la musica…';

  try {
    og.cfg = cfg;
    og.pool = await ogBuildPool(cfg);
    if (og.pool.length < 6) { toast('Trovati troppo pochi brani, prova un\'altra sorgente'); throw new Error('few'); }

    await ogRoom().set('config', cfg);
    await ogRoom().remove('game');
    await ogRoom().remove('input');
    // azzera i punteggi
    for (const [id] of list) await ogRoom().update('players/' + id, { score: 0, ready: false });
    await ogRoom().update('meta', { state: 'playing' });
    await ogRoom().set('game', { phase: 'ready', round: 0 });
  } catch (e) {
    if (e.message !== 'few') toast('Errore nel preparare la partita');
    await ogRoom().update('meta', { state: 'lobby' }).catch(() => {});
  }
  btn.disabled = false; btn.textContent = '🚀 Avvia la partita';
}

async function ogBuildPool(cfg) {
  let tracks = [];
  if (cfg.source === 'spotify-top') {
    try { tracks = await loadSpotifyTastePool(); } catch {}
  }
  if (!tracks.length) {
    const artists = cfg.source === 'genre' ? GENRES[cfg.genre].artists : FAMOUS_ARTISTS;
    const picked = shuffle(artists).slice(0, 10);
    const all = await Promise.all(picked.map(a => fetchArtistSongs(a).catch(() => [])));
    tracks = all.flat();
  }
  // tieni solo brani con anteprima e deduplica
  const seen = new Set(); const pool = [];
  for (const t of shuffle(tracks)) {
    const k = normalize(t.primaryArtist || t.artist) + '|' + normalize(t.title);
    if (seen.has(k)) continue;
    seen.add(k);
    pool.push({ title: t.title, artist: t.artist, primaryArtist: t.primaryArtist || t.artist, art: t.art || '', preview: t.preview || null });
  }
  return pool;
}

/* ---------- ciclo di gioco (host) ---------- */

let _ogBeginning = false;
async function ogHostBeginWhenReady() {
  if (!og.lastGame || og.lastGame.phase !== 'ready' || _ogBeginning) return;
  const players = await ogRoom().get('players') || {};
  const active = activeLobbyPlayers().map(([id]) => id);
  const allReady = active.every(id => players[id] && players[id].ready);
  const readyCount = active.filter(id => players[id] && players[id].ready).length;
  await ogRoom().update('game', { readyCount, readyTotal: active.length });
  if (allReady && active.length >= 2) {
    _ogBeginning = true;
    await ogHostNextRound();
    _ogBeginning = false;
  }
}

async function ogHostNextRound() {
  clearTimeout(og.hostTimer);
  // vincitore?
  const players = ogHostPlayers();
  const top = [...players].sort((a, b) => b.score - a.score);
  if (top[0] && top[0].score >= og.cfg.target && (!top[1] || top[0].score > top[1].score)) {
    await ogRoom().update('game', { phase: 'ended', winner: top[0].id });
    return;
  }

  const track = await ogHostPullTrack();
  if (!track) { toast('Finiti i brani riproducibili'); await ogRoom().update('meta', { state: 'lobby' }); return; }

  let kind = og.cfg.guess;
  if (kind === 'either' && og.cfg.mode === 'quiz') kind = Math.random() < .5 ? 'title' : 'artist';

  og.correctTrack = track;
  og.round = (og.round || 0) + 1;

  const gameNode = {
    phase: 'playing', round: og.round, kind,
    audioUrl: track.preview,
    style: og.cfg.style, mode: og.cfg.mode,
    booker: null, startedAt: ogRoom().serverTime()
  };

  if (og.cfg.mode === 'quiz') {
    const correct = kind === 'artist' ? track.artist : cleanTitle(track.title);
    const distractors = ogDistractors(track, kind, 3);
    const opts = shuffle([{ t: correct, ok: true }, ...distractors.map(d => ({ t: d, ok: false }))]);
    og.correctIndex = opts.findIndex(o => o.ok);
    gameNode.options = opts.map(o => o.t);
  }

  if (og.cfg.style === 'turns') {
    const order = ogHostPlayers();
    og.turnIdx = ((og.turnIdx == null ? -1 : og.turnIdx) + 1) % order.length;
    gameNode.turnPlayer = order[og.turnIdx].id;
  }

  await ogRoom().remove('input');
  og.lastGame = gameNode;   // aggiorna subito lo stato locale (il watcher può arrivare in ritardo)
  await ogRoom().set('game', gameNode);

  // timeout host: se in prenotazione nessuno prenota, o il turno scade
  const ms = og.cfg.timer * 1000 + 1500;
  og.hostTimer = setTimeout(() => ogHostResolveTimeout(), ms);
}

async function ogHostResolveTimeout() {
  const g = await ogRoom().get('game');
  if (!g || g.phase !== 'playing') return;
  if (g.style === 'buzz' && g.booker == null) {
    ogHostReveal(null, false, 0, '😴 Nessuno si è prenotato!');
  } else {
    const who = g.style === 'turns' ? g.turnPlayer : g.booker;
    const delta = g.style === 'buzz' ? -100 : 0;
    ogHostReveal(who, false, delta, '⏰ Tempo scaduto!');
  }
}

function ogDistractors(track, kind, n) {
  const correctNorm = normalize(kind === 'artist' ? track.artist : cleanTitle(track.title));
  const seen = new Set([correctNorm]); const out = [];
  for (const c of shuffle(og.pool)) {
    const v = kind === 'artist' ? c.artist : cleanTitle(c.title);
    const k = normalize(v);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(v);
    if (out.length >= n) break;
  }
  while (out.length < n) {
    const v = kind === 'artist' ? rand(FAMOUS_ARTISTS) : rand(['Canzone misteriosa', 'Traccia segreta', 'Non ricordo']);
    if (!seen.has(normalize(v))) { seen.add(normalize(v)); out.push(v); }
  }
  return out;
}

function ogHostPlayers() {
  return activeLobbyPlayers().map(([id, p]) => ({ id, name: p.name, score: p.score || 0 }));
}

async function ogHostPullTrack() {
  for (let i = 0; i < og.pool.length + 5; i++) {
    const t = og.pool.find(x => !og.used.has(normalize(x.artist) + '|' + normalize(x.title)));
    if (!t) { og.used.clear(); continue; }
    og.used.add(normalize(t.artist) + '|' + normalize(t.title));
    const ok = await resolvePreview(t);
    if (ok && t.preview) return t;
  }
  return null;
}

// host: valuta gli input in arrivo
async function ogHostOnInput(input) {
  const g = og.lastGame;
  if (!g || g.phase !== 'playing' || !og.role || og.role !== 'host') return;
  input = input || {};

  if (g.style === 'buzz') {
    if (g.booker == null && input.buzz) {
      // primo a prenotarsi (timestamp server più basso)
      const buzzes = Object.entries(input.buzz);
      buzzes.sort((a, b) => (a[1] || 0) - (b[1] || 0));
      const first = buzzes[0][0];
      await ogRoom().update('game', { booker: first, answerEndsAt: ogRoom().serverTime() });
      og.lastGame.booker = first;
      clearTimeout(og.hostTimer);
      og.hostTimer = setTimeout(() => ogHostResolveTimeout(), og.cfg.timer * 1000 + 1500);
      return;
    }
    if (g.booker != null && input.answer && input.answer[g.booker] != null) {
      ogHostJudge(g, g.booker, input.answer[g.booker]);
    }
  } else { // turns
    const tp = g.turnPlayer;
    if (input.answer && input.answer[tp] != null) {
      ogHostJudge(g, tp, input.answer[tp]);
    }
  }
}

function ogHostJudge(g, who, ans) {
  clearTimeout(og.hostTimer);
  let correct = false;
  if (g.mode === 'quiz') {
    correct = (ans.choice === og.correctIndex);
  } else {
    const t = og.correctTrack;
    const val = (ans.text || '');
    if (val.trim() && !ans.skip) {
      const titleOk = isMatch(val, t.title);
      const artistOk = t.artist.split(',').some(a => isMatch(val, a)) || isMatch(val, t.artist);
      correct = g.kind === 'title' ? titleOk : g.kind === 'artist' ? artistOk : (titleOk || artistOk);
    }
  }
  let delta;
  if (g.style === 'buzz') delta = correct ? (g.mode === 'write' && g.kind !== 'artist' ? 200 : 200) : -100;
  else delta = correct ? (g.kind === 'artist' ? 100 : 150) : 0;
  ogHostReveal(who, correct, delta, null);
}

async function ogHostReveal(who, correct, delta, message) {
  clearTimeout(og.hostTimer);
  const t = og.correctTrack;
  if (who && delta) {
    const p = (await ogRoom().get('players/' + who)) || {};
    const newScore = Math.max(0, (p.score || 0) + delta);
    await ogRoom().update('players/' + who, { score: newScore });
  }
  const reveal = {
    correctIndex: og.correctIndex,
    title: cleanTitle(t.title), artist: t.artist, art: t.art || '',
    who: who || null, correct: !!correct, delta: delta || 0,
    message: message || (correct ? '✅ Giusto!' : '❌ Sbagliato!')
  };
  await ogRoom().update('game', { phase: 'reveal', reveal });
  // pausa e prossimo round
  og.hostTimer = setTimeout(() => ogHostNextRound(), 4500);
}

/* ---------- rendering (tutti i client, host incluso) ---------- */

async function ogStart() {
  if (og.active) return;
  og.active = true;
  og.role = online.isHost ? 'host' : 'client';
  og.round = 0; og.turnIdx = null;
  og._phase = null;
  og.localAudioReady = false;
  // i client leggono la configurazione dalla stanza (l'host ce l'ha già)
  if (og.role !== 'host') { try { og.cfg = await ogRoom().get('config'); } catch {} }
  show('screen-online-game');
  ogShowReadyGate();
  og.watchers.push(ogRoom().watch('game', (g) => ogOnGame(g)));
  og.watchers.push(ogRoom().watch('players', (p) => {
    og.playersRaw = p || {};
    ogRenderScoresLive();
    // la prontezza è nei players: l'host controlla qui (non nel watcher di game, per non ciclare)
    if (og.role === 'host' && og.lastGame && og.lastGame.phase === 'ready') ogHostBeginWhenReady();
  }));
  if (og.role === 'host') {
    og.watchers.push(ogRoom().watch('input', (inp) => ogHostOnInput(inp)));
  }
}

function ogStop() {
  og.active = false;
  og.watchers.forEach(w => { try { w(); } catch {} });
  og.watchers = [];
  clearTimeout(og.hostTimer); clearInterval(og.timerId);
  stopMusic();
}

function ogShowReadyGate() {
  $('#og-ready').classList.remove('hidden');
  $('#og-play').classList.add('hidden');
  $('#og-reveal').classList.add('hidden');
  $('#og-ready-title').textContent = 'Preparati!';
  $('#btn-og-ready').classList.remove('hidden');
  $('#og-ready-wait').textContent = '';
}

// WAV silenzioso (header 44 byte, 0 campioni): sblocca l'elemento audio col gesto
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

function ogUnlockAudio() {
  try {
    player.muted = true;
    player.src = SILENT_WAV;
    const p = player.play();
    if (p && p.then) p.then(() => { try { player.pause(); } catch {} player.muted = false; })
      .catch(() => { player.muted = false; });
    else player.muted = false;
  } catch {}
}

async function ogTapReady() {
  ogUnlockAudio(); // sblocco audio col gesto utente (necessario su iOS) — non bloccante
  og.localAudioReady = true;
  $('#btn-og-ready').classList.add('hidden');
  $('#og-ready-wait').textContent = 'In attesa degli altri giocatori…';
  await ogRoom().update('players/' + ogMe(), { ready: true });
  if (og.role === 'host') ogHostBeginWhenReady();
}

function ogOnGame(g) {
  if (!g) return;
  og.lastGame = g;
  const phase = g.phase;
  const entering = og._phase !== phase;
  og._phase = phase;

  if (phase === 'ready') {
    if (entering) {   // nuova partita o rivincita: torna al gate e richiedi lo sblocco audio
      og.localAudioReady = false;
      og.round = 0; og.turnIdx = null; og.used = new Set();
      show('screen-online-game');
      ogShowReadyGate();
    }
    if (g.readyTotal) $('#og-ready-wait').textContent =
      og.localAudioReady ? `Pronti ${g.readyCount || 0}/${g.readyTotal}…` : 'In attesa degli altri…';
    return;
  }
  if (phase === 'playing') return ogRenderPlaying(g);
  if (phase === 'reveal') return ogRenderReveal(g);
  if (phase === 'ended') return ogRenderEnded(g);
}

function ogRenderPlaying(g) {
  $('#og-ready').classList.add('hidden');
  $('#og-reveal').classList.add('hidden');
  $('#og-play').classList.remove('hidden');
  $('#og-header').textContent = `Round ${g.round}`;

  // audio: parte una volta per round
  if (og._audioRound !== g.round || og._audioUrl !== g.audioUrl) {
    og._audioRound = g.round; og._audioUrl = g.audioUrl;
    if (g.audioUrl && og.localAudioReady) tryPlayPreview(g.audioUrl).catch(() => {});
    $('#og-vinyl').classList.add('spinning');
    $('#og-eq').classList.remove('paused');
  }

  const qkind = g.kind === 'artist' ? 'Chi la canta? 🎤' : 'Che canzone è? 🎵';
  const iAmTurn = g.style === 'turns' && g.turnPlayer === ogMe();
  const iAmBooker = g.style === 'buzz' && g.booker === ogMe();
  const nameOf = (id) => (og.playersRaw && og.playersRaw[id] ? og.playersRaw[id].name : 'giocatore');

  // reset viste
  $('#og-buzzers').classList.add('hidden');
  $('#og-turn-banner').classList.add('hidden');
  $('#og-answers-quiz').classList.add('hidden');
  $('#og-answers-write').classList.add('hidden');
  $('#og-wait-msg').textContent = '';

  ogRunLocalTimer(g);

  if (g.style === 'buzz') {
    if (g.booker == null) {
      $('#og-question').textContent = qkind + ' — Prenotati! ⚡️';
      // un solo grande buzzer per ME
      const box = $('#og-buzzers');
      box.innerHTML = `<button class="buzzer-btn" id="og-my-buzz" style="--hue:${playerHue(ogPlayerIndex(ogMe()))};grid-column:1/-1">
        <span class="bz-emoji">✋</span><span class="bz-name">PRENOTATI!</span></button>`;
      box.classList.remove('hidden');
      $('#og-my-buzz').onclick = ogTapBuzz;
    } else {
      // qualcuno ha prenotato
      if (iAmBooker) {
        $('#og-question').textContent = 'Tocca a te! ' + qkind;
        ogShowAnswerControls(g);
      } else {
        $('#og-question').textContent = qkind;
        $('#og-wait-msg').textContent = `✋ ${nameOf(g.booker)} sta rispondendo…`;
      }
    }
  } else { // turns
    if (iAmTurn) {
      $('#og-question').textContent = 'Tocca a te! ' + qkind;
      ogShowAnswerControls(g);
    } else {
      $('#og-question').textContent = qkind;
      $('#og-turn-banner').classList.remove('hidden');
      $('#og-turn-banner').innerHTML = `<span class="chain-turn-avatar">${ogEmoji(g.turnPlayer)}</span> Tocca a <b>${escapeHtml(nameOf(g.turnPlayer))}</b>…`;
    }
  }
}

function ogShowAnswerControls(g) {
  if (g.mode === 'quiz') {
    const box = $('#og-answers-quiz');
    box.innerHTML = (g.options || []).map((o, i) =>
      `<button class="answer-btn" data-i="${i}">${escapeHtml(o)}</button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.answer-btn').forEach(b => b.onclick = () => {
      if (og._answered) return; og._answered = true;
      box.querySelectorAll('.answer-btn').forEach(x => x.style.pointerEvents = 'none');
      b.style.borderColor = 'var(--accent1)';
      ogSendAnswer({ choice: +b.dataset.i });
    });
  } else {
    $('#og-answers-write').classList.remove('hidden');
    const inp = $('#og-write-input'); inp.value = ''; setTimeout(() => inp.focus(), 120);
  }
}

function ogRunLocalTimer(g) {
  clearInterval(og.timerId);
  const total = og.cfgTimer(g);
  const start = Date.now();
  const bar = $('#og-timerbar');
  bar.classList.remove('danger'); bar.style.width = '100%';
  // il timer visivo riparte quando si apre la finestra di risposta in prenotazione
  og.timerId = setInterval(() => {
    const frac = Math.max(0, 1 - (Date.now() - start) / (total * 1000));
    bar.style.width = (frac * 100) + '%';
    bar.classList.toggle('danger', frac < .3);
    if (frac <= 0) clearInterval(og.timerId);
  }, 100);
}
og.cfgTimer = (g) => (og.cfg ? og.cfg.timer : (g && g.timer) || 15);

function ogTapBuzz() {
  $('#og-my-buzz') && ($('#og-my-buzz').style.pointerEvents = 'none');
  sfx('tick'); vibrate([60, 40, 60]);
  ogRoom().update('input/buzz', { [ogMe()]: ogRoom().serverTime() }).catch(() => {});
}

function ogSendAnswer(ans) {
  ogRoom().update('input/answer', { [ogMe()]: ans }).catch(() => {});
}

function ogRenderReveal(g) {
  clearInterval(og.timerId);
  og._answered = false;
  stopMusic();
  $('#og-vinyl').classList.remove('spinning');
  $('#og-eq').classList.add('paused');
  $('#og-play').classList.add('hidden');
  $('#og-ready').classList.add('hidden');
  const r = g.reveal || {};
  const meScored = r.who === ogMe();
  $('#og-reveal-verdict').textContent = r.message || (r.correct ? '✅ Giusto!' : '❌');
  $('#og-reveal-verdict').className = 'result-verdict ' + (r.correct ? 'ok' : 'ko');
  const art = $('#og-reveal-art');
  if (r.art) { art.src = r.art; art.style.display = ''; } else art.style.display = 'none';
  $('#og-reveal-title').textContent = r.title || '';
  $('#og-reveal-artist').textContent = r.artist || '';
  const who = r.who && og.playersRaw[r.who] ? og.playersRaw[r.who].name : null;
  $('#og-reveal-points').textContent = r.delta
    ? `${who ? who + ': ' : ''}${r.delta > 0 ? '+' : ''}${r.delta} punti`
    : (who ? `${who}: +0` : '');
  ogRenderRevealScores(r);
  $('#og-reveal').classList.remove('hidden');
  if (r.correct && meScored) { sfx('correct'); vibrate([50, 40, 90]); }
  else if (meScored) { sfx('wrong'); vibrate(200); }
}

function ogRenderRevealScores(r) {
  const list = ogSortedPlayers();
  $('#og-reveal-scores').innerHTML = list.map(p => `
    <div class="r ${p.id === r.who ? (r.correct ? 'delta-pos' : 'delta-neg') : ''}">
      <span>${ogEmoji(p.id)}</span><span>${escapeHtml(p.name)}</span><span class="p">${p.score} pt</span>
    </div>`).join('');
}

function ogRenderEnded(g) {
  // niente teardown dei watcher: l'host può indire la rivincita e ripropagarla
  clearInterval(og.timerId); clearTimeout(og.hostTimer); stopMusic();
  const list = ogSortedPlayers();
  const w = list[0] || { name: '—', score: 0, id: null };
  $('#winner-avatar').textContent = ogEmoji(w.id);
  $('#winner-name').textContent = w.name + (w.id === ogMe() ? ' 🎉' : '');
  $('#winner-points').textContent = `${w.score} punti`;
  const medals = ['🥇', '🥈', '🥉'];
  $('#podium').innerHTML = list.map((p, i) =>
    `<div class="podium-row"><span>${medals[i] || (i + 1) + '°'}</span><span>${ogEmoji(p.id)} ${escapeHtml(p.name)}</span><span class="pr-pts">${p.score} pt</span></div>`).join('');
  // pulsanti: solo l'host può rigiocare; tutti possono uscire
  $('#btn-rematch').classList.toggle('hidden', !online.isHost);
  $('#btn-rematch').onclick = ogHostRematch;
  $('#btn-new-game').classList.add('hidden');
  $('#btn-go-home').textContent = '🚪 Esci dalla stanza';
  $('#btn-go-home').onclick = () => { stopConfetti(); ogStop(); leaveRoom(); };
  show('screen-winner');
  sfx('win'); startConfetti();
}

async function ogHostRematch() {
  stopConfetti();
  og.used = new Set(); og.round = 0; og.turnIdx = null;
  const list = activeLobbyPlayers();
  for (const [id] of list) await ogRoom().update('players/' + id, { score: 0, ready: false });
  await ogRoom().remove('input');
  await ogRoom().set('game', { phase: 'ready', round: 0 });
}

/* ---------- utility punteggi/emoji ---------- */

function ogPlayerIndex(id) {
  const ids = activeLobbyPlayers().map(([i]) => i);
  return Math.max(0, ids.indexOf(id));
}
function ogEmoji(id) { return EMOJIS[ogPlayerIndex(id) % EMOJIS.length]; }
function ogSortedPlayers() {
  const raw = og.playersRaw || {};
  return activeLobbyPlayers().map(([id, p]) => ({ id, name: p.name, score: (raw[id] && raw[id].score) || 0 }))
    .sort((a, b) => b.score - a.score);
}
function ogRenderScoresLive() { if (og.lastGame && og.lastGame.phase === 'reveal') ogRenderRevealScores(og.lastGame.reveal || {}); }

/* ---------- integrazione ---------- */

function ogBindEvents() {
  $('#btn-og-ready').onclick = ogTapReady;
  $('#btn-og-write-submit').onclick = () => { if (og._answered) return; og._answered = true; ogSendAnswer({ text: $('#og-write-input').value }); $('#og-answers-write').classList.add('hidden'); $('#og-wait-msg').textContent = 'Risposta inviata ✓'; };
  $('#btn-og-write-skip').onclick = () => { if (og._answered) return; og._answered = true; ogSendAnswer({ skip: true }); $('#og-answers-write').classList.add('hidden'); };
  $('#og-write-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-og-write-submit').click(); });
  $('#btn-og-scores').onclick = () => { ogShowScoresModal(); };
  $('#btn-og-leave').onclick = () => { ogStop(); leaveRoom(); };

  // impostazioni host nella lobby
  ['og-mode-pills', 'og-guess-pills', 'og-source-pills', 'og-genre-pills', 'og-target-pills', 'og-timer-pills'].forEach(grp => {
    const el = document.getElementById(grp); if (!el) return;
    el.addEventListener('click', e => {
      const p = e.target.closest('.pill'); if (!p) return;
      [...el.querySelectorAll('.pill')].forEach(x => x.classList.toggle('selected', x === p));
      if (grp === 'og-source-pills') $('#og-genre-pills').classList.toggle('hidden', p.dataset.ogsource !== 'genre');
    });
  });
}

function ogShowScoresModal() {
  const list = ogSortedPlayers();
  $('#scores-table').innerHTML = list.map((p, i) =>
    `<div class="scores-row"><span>${i + 1}°</span><span>${ogEmoji(p.id)} ${escapeHtml(p.name)}</span><span class="sc-pts">${p.score} pt</span></div>`).join('');
  openModal('#modal-scores');
}

window.og = og;
window.ogStart = ogStart;
window.ogStop = ogStop;
window.ogHostStart = ogHostStart;
window.ogBindEvents = ogBindEvents;

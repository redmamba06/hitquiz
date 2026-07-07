/* ============================================================
   HitQuiz — party game musicale
   - Sorgenti musica: Spotify (gusti/playlist) + iTunes/Deezer per gli
     estratti audio da 30s (gratuiti, nessun premium richiesto)
   - 3 modalità: quiz a 4 opzioni, risposta scritta, catena d'artista
   ============================================================ */

'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const EMOJIS = ['🦊','🐼','🦁','🐸','🐙','🦄','🐯','🐨','🐵','🦉','🐳','🦖'];

const FAMOUS_ARTISTS = [
  'Måneskin','Ultimo','Annalisa','Elodie','Vasco Rossi','Ligabue','Tiziano Ferro',
  'Eros Ramazzotti','Pinguini Tattici Nucleari','Lazza','Geolier','Blanco','Mahmood',
  'Cesare Cremonini','Jovanotti','Zucchero','Sfera Ebbasta','Marracash','Gigi D\'Agostino',
  'Taylor Swift','The Weeknd','Dua Lipa','Ed Sheeran','Billie Eilish','Bruno Mars',
  'Coldplay','Imagine Dragons','Rihanna','Eminem','Queen','ABBA','Michael Jackson',
  'Adele','Lady Gaga','Katy Perry','Maroon 5','Shakira','Beyoncé','Drake','Post Malone',
  'Harry Styles','Olivia Rodrigo','Ariana Grande','Bad Bunny','Rosalía','David Guetta',
  'Calvin Harris','Avicii','Daft Punk','Bob Marley','The Beatles','Nirvana','AC/DC',
  'Guns N\' Roses','Madonna','Elton John','U2','Sia','Miley Cyrus','Sabrina Carpenter'
];

/* ============ utilità testo / matching ============ */

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft|with|prod)\.?\b.*$/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// titolo "pulito" per mostrare le opzioni senza suffissi tipo "- Remastered 2011"
function cleanTitle(t) {
  let out = (t || '').replace(/\s*[\(\[][^\)\]]*(feat|ft\.|with |remaster|version|edit|live|mono|stereo|deluxe|bonus)[^\)\]]*[\)\]]/gi, '');
  out = out.replace(/\s+-\s+.*(remaster|single|radio edit|version|live|mono|stereo|deluxe|edit)\w*.*/gi, '');
  return out.replace(/\s{2,}/g, ' ').trim() || t;
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// confronto tollerante: ignora maiuscole/accenti/punteggiatura + errori di battitura
function isMatch(guess, target) {
  const g = normalize(guess), t = normalize(cleanTitle(target));
  if (!g || !t) return false;
  if (g === t) return true;
  const tol = t.length < 5 ? 1 : t.length < 10 ? 2 : 3;
  if (lev(g, t) <= tol) return true;
  // "bohemian rhapsody" accetta anche solo la parte prima dei due punti ecc.
  const tCore = t.split(' ').slice(0, 6).join(' ');
  if (g.length >= 4 && tCore === g) return true;
  return false;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ============ storage ============ */

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { localStorage.removeItem(k); }
};

/* ============ toast / suoni / vibrazione ============ */

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

function vibrate(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch {} }

let audioCtx;
function sfx(kind) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      correct: [[523, 0, .1], [659, .1, .1], [784, .2, .18]],
      wrong: [[220, 0, .18], [180, .18, .22]],
      win: [[523, 0, .12], [659, .12, .12], [784, .24, .12], [1047, .36, .3]],
      tick: [[880, 0, .05]]
    }[kind] || [];
    for (const [freq, at, dur] of notes) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = kind === 'wrong' ? 'sawtooth' : 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(.0001, audioCtx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(.18, audioCtx.currentTime + at + .02);
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + at + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + at);
      o.stop(audioCtx.currentTime + at + dur + .05);
    }
  } catch {}
}

/* ============ player audio (un solo elemento, sbloccato dal tap) ============ */

const player = new Audio();
player.preload = 'auto';

function stopMusic() {
  player.pause();
  player.src = '';
}

/* ============ JSONP + API musica (iTunes primario, Deezer fallback) ============ */

function jsonp(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cb = 'jp_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
    function cleanup() { clearTimeout(timer); delete window[cb]; s.remove(); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    s.onerror = () => { cleanup(); reject(new Error('network')); };
    document.head.appendChild(s);
  });
}

const ITUNES = 'https://itunes.apple.com/search';

// cache lookup anteprime in localStorage (persistente fra partite)
const previewCache = store.get('gs_preview_cache', {});
function savePreviewCache() {
  const keys = Object.keys(previewCache);
  if (keys.length > 600) for (const k of keys.slice(0, 200)) delete previewCache[k];
  store.set('gs_preview_cache', previewCache);
}

// trova l'estratto 30s per un brano {title, artist}
async function resolvePreview(item) {
  if (item.preview) return item;
  const key = normalize(item.artist) + '|' + normalize(item.title);
  const cached = previewCache[key];
  if (cached === 'x') return null;
  if (cached) { item.preview = cached.p; item.art = item.art || cached.a; return item; }

  const score = (r) => {
    let s = 0;
    const rt = normalize(cleanTitle(r.trackName || r.title || ''));
    const ra = normalize(r.artistName || (r.artist && r.artist.name) || '');
    const tt = normalize(cleanTitle(item.title)), ta = normalize(item.artist);
    if (rt === tt) s += 4; else if (rt.includes(tt) || tt.includes(rt)) s += 2; else if (lev(rt, tt) <= 3) s += 1;
    if (ra === ta) s += 3; else if (ra.includes(ta) || ta.includes(ra)) s += 2;
    return s;
  };

  // 1) iTunes
  try {
    const q = encodeURIComponent(`${item.artist} ${cleanTitle(item.title)}`);
    const d = await jsonp(`${ITUNES}?term=${q}&media=music&entity=song&limit=6&country=IT`);
    const best = (d.results || []).filter(r => r.previewUrl).sort((a, b) => score(b) - score(a))[0];
    if (best && score(best) >= 4) {
      item.preview = best.previewUrl;
      item.art = item.art || (best.artworkUrl100 || '').replace('100x100', '300x300');
      previewCache[key] = { p: item.preview, a: item.art }; savePreviewCache();
      return item;
    }
  } catch {}

  // 2) Deezer fallback
  try {
    const q = encodeURIComponent(`artist:"${item.artist}" track:"${cleanTitle(item.title)}"`);
    const d = await jsonp(`https://api.deezer.com/search?q=${q}&limit=5&output=jsonp`);
    const best = (d.data || []).filter(r => r.preview).sort((a, b) => score(b) - score(a))[0];
    if (best && score(best) >= 4) {
      item.preview = best.preview;
      item.art = item.art || (best.album && best.album.cover_medium) || '';
      previewCache[key] = { p: item.preview, a: item.art }; savePreviewCache();
      return item;
    }
  } catch {}

  previewCache[key] = 'x'; savePreviewCache();
  return null;
}

// canzoni più note di un artista (con anteprima inclusa) — 1 sola chiamata
const artistSongsCache = {};
async function fetchArtistSongs(artistName) {
  const key = normalize(artistName);
  if (artistSongsCache[key]) return artistSongsCache[key];
  const q = encodeURIComponent(artistName);
  const d = await jsonp(`${ITUNES}?term=${q}&media=music&entity=song&attribute=artistTerm&limit=200&country=IT`);
  const seen = new Set();
  const ta = normalize(artistName);
  let results = (d.results || []).filter(r => r.trackName);
  // preferisci le corrispondenze esatte dell'artista (evita gli omonimi)
  const exact = results.filter(r => normalize(r.artistName || '') === ta);
  if (exact.length >= 10) results = exact;
  const songs = results
    .filter(r => {
      const ra = normalize(r.artistName || '');
      return ra === ta || ra.includes(ta) || ta.includes(ra) || lev(ra, ta) <= 1;
    })
    .map(r => ({
      title: cleanTitle(r.trackName),
      artist: r.artistName,
      preview: r.previewUrl || null,
      art: (r.artworkUrl100 || '').replace('100x100', '300x300')
    }))
    .filter(s => {
      const k = normalize(s.title);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  artistSongsCache[key] = songs;
  return songs;
}

async function searchArtists(term) {
  const d = await jsonp(`${ITUNES}?term=${encodeURIComponent(term)}&media=music&entity=musicArtist&limit=8&country=IT`);
  const seen = new Set();
  return (d.results || [])
    .filter(r => { const k = normalize(r.artistName); if (!k || seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 5)
    .map(r => ({ name: r.artistName, genre: r.primaryGenreName || '' }));
}

/* ============ Spotify (OAuth PKCE, tutto client-side) ============ */

const SPOTIFY_SCOPES = 'user-top-read user-library-read playlist-read-private playlist-read-collaborative';

function spotifyRedirectUri() {
  return location.origin + location.pathname;
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function spotifyLogin() {
  const clientId = ($('#client-id-input').value || '').trim() || store.get('gs_client_id', '');
  if (!clientId) { toast('Inserisci prima il Client ID di Spotify'); return; }
  store.set('gs_client_id', clientId);

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  store.set('gs_pkce_verifier', verifier);

  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: spotifyRedirectUri(),
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge
  });
  location.href = 'https://accounts.spotify.com/authorize?' + p;
}

async function spotifyTokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  if (!res.ok) throw new Error('token ' + res.status);
  const d = await res.json();
  store.set('gs_sp_tokens', {
    access: d.access_token,
    refresh: d.refresh_token || (store.get('gs_sp_tokens', {}) || {}).refresh,
    exp: Date.now() + (d.expires_in - 60) * 1000
  });
  return d.access_token;
}

async function spotifyHandleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (params.get('error')) {
    history.replaceState({}, '', location.pathname);
    toast('Accesso Spotify annullato');
    return;
  }
  if (!code) return;
  history.replaceState({}, '', location.pathname);
  try {
    await spotifyTokenRequest({
      client_id: store.get('gs_client_id', ''),
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri(),
      code_verifier: store.get('gs_pkce_verifier', '')
    });
    toast('Spotify collegato! 💚');
    sfx('correct');
  } catch {
    toast('Errore nel collegamento a Spotify, riprova');
  }
}

async function spotifyToken() {
  const t = store.get('gs_sp_tokens', null);
  if (!t) return null;
  if (Date.now() < t.exp) return t.access;
  if (!t.refresh) return null;
  try {
    return await spotifyTokenRequest({
      client_id: store.get('gs_client_id', ''),
      grant_type: 'refresh_token',
      refresh_token: t.refresh
    });
  } catch {
    store.del('gs_sp_tokens');
    return null;
  }
}

function spotifyConnected() { return !!store.get('gs_sp_tokens', null); }

async function spotifyApi(path) {
  const token = await spotifyToken();
  if (!token) throw new Error('not-connected');
  const res = await fetch('https://api.spotify.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1500));
    return spotifyApi(path);
  }
  if (!res.ok) throw new Error('api ' + res.status);
  return res.json();
}

function mapSpotifyTrack(t) {
  if (!t || !t.name || !t.artists) return null;
  return {
    title: cleanTitle(t.name),
    artist: t.artists.map(a => a.name).slice(0, 2).join(', '),
    primaryArtist: t.artists[0].name,
    art: (t.album && t.album.images && t.album.images[1] && t.album.images[1].url) || ''
  };
}

// pool dai gusti: top brani (3 periodi) + preferiti
async function loadSpotifyTastePool() {
  const calls = [
    spotifyApi('/me/top/tracks?limit=50&time_range=short_term'),
    spotifyApi('/me/top/tracks?limit=50&time_range=medium_term'),
    spotifyApi('/me/top/tracks?limit=50&time_range=long_term'),
    spotifyApi('/me/tracks?limit=50'),
    spotifyApi('/me/tracks?limit=50&offset=50')
  ];
  const results = await Promise.allSettled(calls);
  const seen = new Set(); const pool = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const items = r.value.items || [];
    for (const it of items) {
      const t = mapSpotifyTrack(it.track || it);
      if (!t) continue;
      const k = normalize(t.primaryArtist) + '|' + normalize(t.title);
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(t);
    }
  }
  return pool;
}

async function loadSpotifyPlaylists() {
  // da febbraio 2026 l'API restituisce i contenuti solo delle playlist di cui
  // l'utente è proprietario o collaboratore; le altre vanno mostrate come non usabili
  let myId = null;
  try { myId = (await spotifyApi('/me')).id; } catch {}
  const d = await spotifyApi('/me/playlists?limit=50');
  return (d.items || []).filter(Boolean).map(p => {
    const paging = p.items || p.tracks; // "tracks" rinominato in "items" (feb 2026)
    return {
      id: p.id, name: p.name,
      count: paging && typeof paging.total === 'number' ? paging.total : null,
      img: (p.images && p.images[0] && p.images[0].url) || '',
      readable: !myId || !p.owner || p.owner.id === myId || !!p.collaborative
    };
  });
}

async function loadSpotifyPlaylistTracks(id) {
  const seen = new Set(); const pool = [];
  const collect = (d) => {
    let added = 0;
    for (const it of (d.items || [])) {
      // nuovo formato: il brano è sotto "item"; vecchio formato: sotto "track"
      const t = mapSpotifyTrack(it.item || it.track || it);
      if (!t) continue;
      const k = normalize(t.primaryArtist) + '|' + normalize(t.title);
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(t);
      added++;
    }
    return added;
  };
  // endpoint nuovo (feb 2026), max 50 per pagina
  try {
    for (let offset = 0; offset < 200; offset += 50) {
      const d = await spotifyApi(`/playlists/${id}/items?limit=50&offset=${offset}`);
      collect(d);
      if (!d.next) break;
    }
    if (pool.length) return pool;
  } catch {}
  // fallback: endpoint storico per le app create prima del cambio API
  try {
    for (const offset of [0, 100]) {
      const d = await spotifyApi(`/playlists/${id}/tracks?limit=100&offset=${offset}`);
      collect(d);
      if (!d.next) break;
    }
  } catch {}
  return pool;
}

/* ============ navigazione schermate ============ */

function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModals() { $$('.modal-backdrop').forEach(m => m.classList.add('hidden')); }

/* ============ stato setup ============ */

const setup = {
  players: store.get('gs_players', ['Giocatore 1', 'Giocatore 2']),
  mode: 'quiz',            // quiz | write | chain
  guess: 'title',          // title | artist | either
  target: 1000,
  timer: 15,
  source: 'famous',        // famous | spotify-top | spotify-playlist | artists
  playlistId: null,
  customArtists: [],
  chainArtist: null,
  chainTimer: 30
};

function renderPlayers() {
  const el = $('#players-list');
  el.innerHTML = setup.players.map((name, i) => `
    <div class="player-row">
      <span class="p-emoji">${EMOJIS[i % EMOJIS.length]}</span>
      <span class="p-name">${escapeHtml(name)}</span>
      <button class="p-del" data-del="${i}" aria-label="Rimuovi">✕</button>
    </div>`).join('');
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    setup.players.splice(+b.dataset.del, 1);
    store.set('gs_players', setup.players);
    renderPlayers();
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function addPlayer() {
  const input = $('#new-player-name');
  const name = input.value.trim();
  if (!name) return;
  if (setup.players.length >= 12) { toast('Massimo 12 giocatori!'); return; }
  if (setup.players.some(p => normalize(p) === normalize(name))) { toast('Nome già usato!'); return; }
  setup.players.push(name);
  store.set('gs_players', setup.players);
  input.value = '';
  renderPlayers();
}

function refreshSetupVisibility() {
  const isChain = setup.mode === 'chain';
  $('#opts-guess').classList.toggle('hidden', isChain);
  $('#opts-points').classList.toggle('hidden', isChain);
  $('#opts-timer').classList.toggle('hidden', isChain);
  $('#opts-source').classList.toggle('hidden', isChain);
  $('#opts-chain').classList.toggle('hidden', !isChain);
  $('#playlist-picker').classList.toggle('hidden', setup.source !== 'spotify-playlist' || isChain);
  $('#artists-picker').classList.toggle('hidden', setup.source !== 'artists' || isChain);
}

function renderChosenArtists() {
  $('#chosen-artists').innerHTML = setup.customArtists.map((a, i) =>
    `<span class="chip">${escapeHtml(a)} <button data-adel="${i}">✕</button></span>`).join('')
    || '<p class="muted">Aggiungi almeno un artista 👆</p>';
  $$('#chosen-artists [data-adel]').forEach(b => b.onclick = () => {
    setup.customArtists.splice(+b.dataset.adel, 1);
    renderChosenArtists();
  });
}

async function addCustomArtist() {
  const input = $('#artist-search-input');
  const term = input.value.trim();
  if (!term) return;
  $('#btn-add-artist').disabled = true;
  try {
    const found = await searchArtists(term);
    const name = found.length ? found[0].name : term;
    if (!setup.customArtists.some(a => normalize(a) === normalize(name))) {
      setup.customArtists.push(name);
      renderChosenArtists();
      toast(found.length ? `Aggiunto: ${name} ✓` : `Aggiunto "${name}" (non verificato)`);
    } else toast('Artista già aggiunto');
    input.value = '';
  } catch {
    toast('Ricerca fallita, controlla la connessione');
  }
  $('#btn-add-artist').disabled = false;
}

async function showPlaylistPicker() {
  const box = $('#playlist-list');
  if (!spotifyConnected()) {
    box.innerHTML = '<p class="muted">Prima collega Spotify dalla home 💚</p>';
    return;
  }
  box.innerHTML = '<p class="muted">Caricamento playlist…</p>';
  try {
    const pls = await loadSpotifyPlaylists();
    if (!pls.length) { box.innerHTML = '<p class="muted">Nessuna playlist trovata</p>'; return; }
    const readable = pls.filter(p => p.readable);
    const locked = pls.filter(p => !p.readable);
    const row = (p, dis) => `
      <button class="playlist-item ${setup.playlistId === p.id ? 'selected' : ''}" data-pl="${p.id}" ${dis ? 'disabled style="opacity:.4"' : ''}>
        ${p.img ? `<img src="${p.img}" alt="">` : '<img alt="">'}
        <span><span class="pl-name">${escapeHtml(p.name)}</span><br><span class="pl-sub">${dis ? '🔒 non leggibile (limite Spotify)' : (p.count != null ? p.count + ' brani' : 'playlist')}</span></span>
      </button>`;
    box.innerHTML =
      (readable.length ? '' : '<p class="muted">Spotify permette di leggere solo le playlist create da te 😕</p>') +
      readable.map(p => row(p, false)).join('') +
      (locked.length ? '<p class="muted" style="margin-top:6px">Le playlist che segui (non tue) non sono leggibili con le nuove regole Spotify:</p>' + locked.map(p => row(p, true)).join('') : '');
    box.querySelectorAll('[data-pl]:not([disabled])').forEach(b => b.onclick = () => {
      setup.playlistId = b.dataset.pl;
      box.querySelectorAll('.playlist-item').forEach(x => x.classList.toggle('selected', x === b));
    });
  } catch {
    box.innerHTML = '<p class="muted">Errore nel caricare le playlist. Riprova.</p>';
  }
}

async function searchChainArtist() {
  const input = $('#chain-artist-input');
  const term = input.value.trim();
  if (!term) return;
  const box = $('#chain-artist-results');
  box.innerHTML = '<p class="muted">Cerco…</p>';
  try {
    const found = await searchArtists(term);
    if (!found.length) { box.innerHTML = '<p class="muted">Nessun artista trovato 🤔</p>'; return; }
    box.innerHTML = found.map(a => `
      <button class="playlist-item" data-ca="${escapeHtml(a.name)}">
        <span style="font-size:26px">🎤</span>
        <span><span class="pl-name">${escapeHtml(a.name)}</span><br><span class="pl-sub">${escapeHtml(a.genre)}</span></span>
      </button>`).join('');
    box.querySelectorAll('[data-ca]').forEach(b => b.onclick = () => {
      setup.chainArtist = b.dataset.ca;
      box.innerHTML = '';
      input.value = '';
      $('#chain-artist-chosen').innerHTML =
        `<span class="chip">🎤 ${escapeHtml(setup.chainArtist)} <button id="ca-del">✕</button></span>`;
      $('#ca-del').onclick = () => { setup.chainArtist = null; $('#chain-artist-chosen').innerHTML = ''; };
    });
  } catch {
    box.innerHTML = '<p class="muted">Ricerca fallita, controlla la connessione</p>';
  }
}

/* ============ stato partita ============ */

let game = null;

function makeGame() {
  return {
    mode: setup.mode,
    guess: setup.guess,
    target: setup.target,
    timerSec: setup.mode === 'chain' ? setup.chainTimer : setup.timer,
    players: setup.players.map((name, i) => ({
      name, emoji: EMOJIS[i % EMOJIS.length], score: 0, streak: 0, alive: true
    })),
    turn: -1,
    round: 1,
    queue: [],            // brani pronti da giocare
    pool: [],             // pool completo (per i distrattori)
    artistQueue: [],      // per sorgenti basate su artisti
    usedKeys: new Set(),  // brani già usati
    current: null,
    answered: false,
    timerId: null,
    timerEnd: 0,
    // catena
    chainSongs: [],
    chainUsed: [],
    failedLookups: 0
  };
}

/* ============ avvio partita ============ */

async function startGame() {
  if (setup.players.length < 1) { toast('Aggiungi almeno un giocatore!'); return; }
  if (setup.mode === 'chain' && setup.players.length < 2) { toast('La catena richiede almeno 2 giocatori!'); return; }
  if (setup.mode === 'chain' && !setup.chainArtist) { toast('Scegli l\'artista della sfida!'); return; }
  if (setup.source === 'spotify-top' && setup.mode !== 'chain' && !spotifyConnected()) { toast('Prima collega Spotify 💚'); return; }
  if (setup.source === 'spotify-playlist' && setup.mode !== 'chain' && !setup.playlistId) { toast('Scegli una playlist!'); return; }
  if (setup.source === 'artists' && setup.mode !== 'chain' && !setup.customArtists.length) { toast('Aggiungi almeno un artista!'); return; }

  const btn = $('#btn-start-game');
  btn.disabled = true; btn.textContent = '⏳ Preparo la musica…';
  game = makeGame();

  try {
    if (game.mode === 'chain') {
      const songs = await fetchArtistSongs(setup.chainArtist);
      if (songs.length < 10) { toast('Trovate troppo poche canzoni per questo artista, provane un altro'); throw new Error('few'); }
      game.chainSongs = songs;
      startChain();
    } else {
      await prepareMusicPool();
      if (game.pool.length < 8 && !game.artistQueue.length) {
        toast('Trovati troppo pochi brani con questa sorgente 😕');
        throw new Error('few');
      }
      nextTurn();
    }
  } catch (e) {
    if (e.message !== 'few') toast('Errore nel preparare la partita, riprova');
    game = null;
  }
  btn.disabled = false; btn.textContent = '🚀 Inizia partita!';
}

async function prepareMusicPool() {
  if (setup.source === 'spotify-top') {
    game.pool = shuffle(await loadSpotifyTastePool());
    game.queue = [...game.pool];
  } else if (setup.source === 'spotify-playlist') {
    game.pool = shuffle(await loadSpotifyPlaylistTracks(setup.playlistId));
    game.queue = [...game.pool];
  } else {
    const artists = setup.source === 'artists' ? setup.customArtists : FAMOUS_ARTISTS;
    game.artistQueue = shuffle(artists);
    await refillFromArtists(2); // precarica 2 artisti
  }
}

// per le sorgenti "artisti": pesca a rotazione le canzoni più note
async function refillFromArtists(nArtists = 1) {
  for (let i = 0; i < nArtists && game.artistQueue.length; i++) {
    const artist = game.artistQueue.shift();
    game.artistQueue.push(artist); // rotazione infinita
    try {
      const songs = await fetchArtistSongs(artist);
      // pesca tra le ~25 più rilevanti (i risultati iTunes sono in ordine di rilevanza)
      const fresh = shuffle(songs.filter(s => s.preview).slice(0, 25))
        .slice(0, 12)
        .filter(s => !game.usedKeys.has(trackKey(s)));
      game.queue.push(...shuffle(fresh));
      game.pool.push(...fresh);
    } catch {}
  }
  game.queue = shuffle(game.queue);
}

const trackKey = (t) => normalize(t.artist) + '|' + normalize(t.title);

// estrae il prossimo brano con anteprima disponibile
async function pullNextTrack() {
  for (let attempts = 0; attempts < 10; attempts++) {
    if (!game.queue.length) {
      if (game.artistQueue.length) await refillFromArtists(1);
      else game.queue = shuffle(game.pool.filter(t => !game.usedKeys.has(trackKey(t))));
      if (!game.queue.length) { game.usedKeys.clear(); game.queue = shuffle([...game.pool]); }
      if (!game.queue.length) return null;
    }
    const t = game.queue.shift();
    if (game.usedKeys.has(trackKey(t))) continue;
    const ok = await resolvePreview(t);
    if (ok && t.preview) {
      game.usedKeys.add(trackKey(t));
      return t;
    }
  }
  return null;
}

/* ============ turni quiz / scrittura ============ */

function activePlayer() { return game.players[game.turn]; }

function nextTurn() {
  stopMusic();
  clearTimer();
  $('#result-overlay').classList.add('hidden');

  game.turn++;
  if (game.turn >= game.players.length) {
    game.turn = 0;
    game.round++;
    // fine round: qualcuno ha vinto?
    const top = [...game.players].sort((a, b) => b.score - a.score);
    if (top[0].score >= game.target && top[0].score > (top[1] ? top[1].score : -1)) {
      showWinner(top);
      return;
    }
    if (top[0].score >= game.target) toast('Parità! Round di spareggio ⚔️');
  }

  const p = activePlayer();
  $('#pass-round').textContent = `Round ${game.round} · obiettivo ${game.target}`;
  $('#pass-avatar').textContent = p.emoji;
  $('#pass-name').textContent = p.name;
  $('#pass-score').textContent = `${p.score} punti` + (p.streak >= 2 ? ` · 🔥 serie x${p.streak}` : '');
  show('screen-pass');
}

async function beginTurn() {
  const p = activePlayer();
  show('screen-game');
  $('#game-player-emoji').textContent = p.emoji;
  $('#game-player-name').textContent = p.name;
  $('#answers-quiz').classList.add('hidden');
  $('#answers-write').classList.add('hidden');
  $('#loading-track').classList.remove('hidden');
  $('#vinyl').classList.remove('spinning');
  $('#equalizer').classList.add('paused');
  $('#timerbar').style.width = '100%';
  $('#timerbar').classList.remove('danger');
  game.answered = false;

  const track = await pullNextTrack();
  if (!track) {
    toast('Non riesco a trovare altre canzoni 😕 — controlla la connessione');
    show('screen-setup');
    return;
  }
  game.current = track;
  $('#loading-track').classList.add('hidden');

  // che cosa si indovina questo turno?
  let guessKind = game.guess;
  if (guessKind === 'either' && game.mode === 'quiz') guessKind = Math.random() < .5 ? 'title' : 'artist';
  game.currentGuessKind = guessKind;
  $('#game-question').textContent =
    game.mode === 'write'
      ? (guessKind === 'title' ? 'Scrivi il TITOLO! ✍️' : guessKind === 'artist' ? 'Scrivi l\'ARTISTA! ✍️' : 'Scrivi TITOLO o ARTISTA! ✍️')
      : (guessKind === 'artist' ? 'Chi la canta? 🎤' : 'Che canzone è? 🎵');

  // audio
  player.src = track.preview;
  player.currentTime = 0;
  player.volume = 1;
  try { await player.play(); } catch {}
  $('#vinyl').classList.add('spinning');
  $('#equalizer').classList.remove('paused');

  if (game.mode === 'quiz') renderQuizAnswers(track, guessKind);
  else renderWriteAnswer();

  startTimer(game.timerSec, () => onTimeout());
}

function renderQuizAnswers(track, guessKind) {
  const correct = guessKind === 'artist' ? track.artist : cleanTitle(track.title);
  const distractors = buildDistractors(track, guessKind, 3);
  const options = shuffle([{ text: correct, ok: true }, ...distractors.map(d => ({ text: d, ok: false }))]);
  const box = $('#answers-quiz');
  box.innerHTML = options.map((o, i) =>
    `<button class="answer-btn" data-ok="${o.ok ? 1 : 0}">${escapeHtml(o.text)}</button>`).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.answer-btn').forEach(b => b.onclick = () => {
    if (game.answered) return;
    answerQuiz(b);
  });
}

function buildDistractors(track, guessKind, n) {
  const correctNorm = normalize(guessKind === 'artist' ? track.artist : cleanTitle(track.title));
  const seen = new Set([correctNorm]);
  const out = [];
  const candidates = shuffle(game.pool);
  for (const c of candidates) {
    const v = guessKind === 'artist' ? c.artist : cleanTitle(c.title);
    const k = normalize(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= n) break;
  }
  // fallback estremo: artisti famosi / titoli generici
  while (out.length < n) {
    const v = guessKind === 'artist' ? rand(FAMOUS_ARTISTS) : rand(['Non ricordo il titolo', 'Canzone misteriosa', 'Traccia segreta']);
    if (!seen.has(normalize(v))) { seen.add(normalize(v)); out.push(v); }
  }
  return out;
}

function renderWriteAnswer() {
  const box = $('#answers-write');
  box.classList.remove('hidden');
  const input = $('#write-input');
  input.value = '';
  setTimeout(() => input.focus(), 150);
}

/* ---- timer ---- */

function startTimer(sec, onEnd) {
  clearTimer();
  game.timerEnd = Date.now() + sec * 1000;
  const bar = $(game.mode === 'chain' ? '#chain-timerbar' : '#timerbar');
  game.timerId = setInterval(() => {
    const left = game.timerEnd - Date.now();
    const frac = Math.max(0, left / (sec * 1000));
    bar.style.width = (frac * 100) + '%';
    bar.classList.toggle('danger', frac < .3);
    if (left <= 0) { clearTimer(); onEnd(); }
  }, 100);
}

function clearTimer() {
  if (game && game.timerId) { clearInterval(game.timerId); game.timerId = null; }
}

function timeLeftFrac() {
  return Math.max(0, (game.timerEnd - Date.now()) / (game.timerSec * 1000));
}

/* ---- risposte ---- */

function computePoints(base) {
  const p = activePlayer();
  const speedBonus = Math.round(100 * timeLeftFrac());
  const streakBonus = p.streak >= 2 ? 50 : 0;
  return { total: base + speedBonus + streakBonus, streakBonus };
}

function answerQuiz(btn) {
  game.answered = true;
  clearTimer();
  const ok = btn.dataset.ok === '1';
  $$('#answers-quiz .answer-btn').forEach(b => {
    if (b.dataset.ok === '1') b.classList.add('correct');
    else if (b === btn) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  finishTurn(ok, ok ? computePoints(100) : null);
}

function answerWrite(skip = false) {
  if (game.answered) return;
  const guessKind = game.currentGuessKind;
  const track = game.current;
  const val = $('#write-input').value;
  let ok = false;
  if (!skip && val.trim()) {
    const titleOk = isMatch(val, track.title);
    const artistOk = track.artist.split(',').some(a => isMatch(val, a)) || isMatch(val, track.artist);
    ok = guessKind === 'title' ? titleOk : guessKind === 'artist' ? artistOk : (titleOk || artistOk);
  }
  if (!ok && !skip && val.trim() && timeLeftFrac() > 0.05) {
    // risposta sbagliata ma c'è ancora tempo: lascia riprovare
    vibrate(80);
    sfx('wrong');
    const input = $('#write-input');
    input.style.borderColor = 'var(--red)';
    setTimeout(() => input.style.borderColor = '', 500);
    input.select();
    return;
  }
  game.answered = true;
  clearTimer();
  finishTurn(ok, ok ? computePoints(150) : null);
}

function onTimeout() {
  if (game.answered) return;
  game.answered = true;
  $$('#answers-quiz .answer-btn').forEach(b => { if (b.dataset.ok === '1') b.classList.add('correct'); else b.classList.add('dim'); });
  finishTurn(false, null);
}

function finishTurn(ok, points) {
  const p = activePlayer();
  if (ok) {
    p.streak++;
    p.score += points.total;
    sfx('correct'); vibrate([50, 40, 90]);
  } else {
    p.streak = 0;
    sfx('wrong'); vibrate(200);
  }
  const t = game.current;
  setTimeout(() => {
    $('#result-verdict').textContent = ok ? rand(['✅ Giusto!', '🎯 Bravissimo!', '🔥 Grande!', '💪 Esatto!']) : rand(['❌ Sbagliato!', '⏰ Tempo scaduto!', '😬 No…']);
    $('#result-verdict').className = 'result-verdict ' + (ok ? 'ok' : 'ko');
    if (!ok) $('#result-verdict').textContent = timeLeftFrac() <= 0 ? '⏰ Tempo scaduto!' : '❌ Sbagliato!';
    const art = $('#result-art');
    if (t.art) { art.src = t.art; art.style.display = ''; } else art.style.display = 'none';
    $('#result-title').textContent = cleanTitle(t.title);
    $('#result-artist').textContent = t.artist;
    $('#result-points').textContent = ok
      ? `+${points.total} punti` + (points.streakBonus ? ' 🔥' : '')
      : '+0 punti';
    $('#result-overlay').classList.remove('hidden');
  }, ok || timeLeftFrac() > 0 ? 900 : 300);

  // prefetch del prossimo brano mentre si guarda il risultato
  setTimeout(() => { if (game && game.queue[0]) resolvePreview(game.queue[0]); }, 1200);
}

/* ============ catena d'artista ============ */

function startChain() {
  game.chainUsed = [];
  game.turn = -1;
  $('#chain-artist-name').textContent = setup.chainArtist;
  $('#chain-artist-name-2').textContent = setup.chainArtist;
  chainNextTurn();
  show('screen-chain');
}

function chainAlive() { return game.players.filter(p => p.alive); }

function chainNextTurn() {
  clearTimer();
  const alive = chainAlive();
  if (alive.length === 1) { showChainWinner(alive[0]); return; }
  do { game.turn = (game.turn + 1) % game.players.length; } while (!game.players[game.turn].alive);
  const p = activePlayer();
  $('#chain-turn-avatar').textContent = p.emoji;
  $('#chain-turn-name').textContent = p.name;
  $('#chain-count').textContent = `${game.chainUsed.length} 🎵`;
  $('#chain-feedback').textContent = '';
  $('#chain-feedback').className = 'chain-feedback';
  const input = $('#chain-input');
  input.value = '';
  renderChainPlayers();
  setTimeout(() => input.focus(), 150);
  startTimer(game.timerSec, () => chainEliminate('⏰ Tempo scaduto!'));
}

function renderChainPlayers() {
  $('#chain-players').innerHTML = game.players.map((p, i) =>
    `<span class="chain-player-chip ${!p.alive ? 'out' : ''} ${i === game.turn && p.alive ? 'now' : ''}">${p.emoji} ${escapeHtml(p.name)}</span>`).join('');
}

function renderChainUsed() {
  $('#chain-used').innerHTML = game.chainUsed.map(s => `<span class="chip">🎵 ${escapeHtml(s)}</span>`).join('');
  $('#chain-count').textContent = `${game.chainUsed.length} 🎵`;
}

function chainSubmit() {
  const input = $('#chain-input');
  const guess = input.value.trim();
  if (!guess) return;
  const fb = $('#chain-feedback');

  // già detta?
  if (game.chainUsed.some(u => isMatch(guess, u) || isMatch(u, guess))) {
    fb.textContent = '⚠️ Già detta! Provane un\'altra…';
    fb.className = 'chain-feedback ko';
    sfx('wrong'); vibrate(80);
    input.select();
    return;
  }
  // esiste davvero?
  const match = game.chainSongs.find(s => isMatch(guess, s.title));
  if (!match) {
    fb.textContent = '🤔 Non la trovo tra le sue canzoni… riprova!';
    fb.className = 'chain-feedback ko';
    sfx('wrong'); vibrate(80);
    input.select();
    return;
  }
  clearTimer();
  game.chainUsed.unshift(match.title);
  renderChainUsed();
  fb.textContent = `✅ "${match.title}" — giusta!`;
  fb.className = 'chain-feedback ok';
  sfx('correct'); vibrate([40, 30, 70]);
  setTimeout(chainNextTurn, 900);
}

function chainEliminate(reason) {
  clearTimer();
  const p = activePlayer();
  p.alive = false;
  sfx('wrong'); vibrate([100, 60, 200]);
  toast(`${reason} ${p.emoji} ${p.name} è eliminato!`, 3000);
  renderChainPlayers();
  setTimeout(chainNextTurn, 1300);
}

function showChainWinner(winner) {
  game.players.forEach(p => { p.score = p === winner ? 1 : 0; });
  const n = game.chainUsed.length;
  showWinner([winner, ...game.players.filter(p => p !== winner)],
    `Ultimo sopravvissuto · ${n} ${n === 1 ? 'canzone nominata' : 'canzoni nominate'}!`);
}

/* ============ vittoria ============ */

function showWinner(sorted, subtitle) {
  stopMusic();
  clearTimer();
  const w = sorted[0];
  $('#winner-avatar').textContent = w.emoji;
  $('#winner-name').textContent = w.name;
  $('#winner-points').textContent = subtitle || `${w.score} punti in ${game.round - 1} round!`;
  const medals = ['🥇', '🥈', '🥉'];
  $('#podium').innerHTML = sorted.map((p, i) => `
    <div class="podium-row">
      <span>${medals[i] || (i + 1) + '°'}</span><span>${p.emoji} ${escapeHtml(p.name)}</span>
      <span class="pr-pts">${game.mode === 'chain' ? (i === 0 ? '👑' : '') : p.score + ' pt'}</span>
    </div>`).join('');
  show('screen-winner');
  sfx('win');
  vibrate([80, 50, 80, 50, 200]);
  startConfetti();
}

function rematch() {
  stopConfetti();
  if (!game) { show('screen-setup'); return; }
  if (game.mode === 'chain') {
    game.players.forEach(p => { p.alive = true; p.score = 0; });
    game.chainUsed = [];
    game.turn = -1;
    chainNextTurn();
    show('screen-chain');
  } else {
    game.players.forEach(p => { p.score = 0; p.streak = 0; });
    game.turn = -1;
    game.round = 1;
    nextTurn();
  }
}

/* ============ confetti ============ */

let confettiRaf = null;
function startConfetti() {
  const canvas = $('#confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
  const colors = ['#8b5cf6', '#ec4899', '#fbbf24', '#22c55e', '#3b82f6', '#f97316'];
  const parts = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    c: rand(colors), vy: 1.5 + Math.random() * 3, vx: -1 + Math.random() * 2,
    rot: Math.random() * Math.PI, vr: -.1 + Math.random() * .2
  }));
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.y += p.vy; p.x += p.vx; p.rot += p.vr;
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    confettiRaf = requestAnimationFrame(frame);
  }
  frame();
}
function stopConfetti() {
  if (confettiRaf) cancelAnimationFrame(confettiRaf);
  confettiRaf = null;
}

/* ============ classifica ============ */

function showScores() {
  if (!game) return;
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  $('#scores-table').innerHTML = sorted.map((p, i) => `
    <div class="scores-row">
      <span>${i + 1}°</span><span>${p.emoji} ${escapeHtml(p.name)}</span>
      ${p.streak >= 2 ? `<span class="sc-streak">🔥x${p.streak}</span>` : ''}
      <span class="sc-pts">${p.score} pt</span>
    </div>`).join('');
  openModal('#modal-scores');
}

/* ============ Spotify UI ============ */

async function refreshSpotifyUi() {
  const dot = $('#spotify-dot');
  const label = $('#spotify-home-label');
  if (spotifyConnected()) {
    dot.classList.add('on');
    label.textContent = 'Spotify collegato';
    $('#spotify-connected-box').classList.remove('hidden');
    $('#spotify-setup-box').classList.add('hidden');
    try {
      const me = await spotifyApi('/me');
      $('#spotify-user-name').textContent = me.display_name || 'utente Spotify';
      label.textContent = `Spotify: ${me.display_name || 'collegato'} ✓`;
    } catch {
      $('#spotify-user-name').textContent = 'utente Spotify';
    }
  } else {
    dot.classList.remove('on');
    label.textContent = 'Collega Spotify';
    $('#spotify-connected-box').classList.add('hidden');
    $('#spotify-setup-box').classList.remove('hidden');
    $('#client-id-input').value = store.get('gs_client_id', '');
  }
}

/* ============ eventi / init ============ */

function quitGame() {
  closeModals();
  stopMusic();
  clearTimer();
  stopConfetti();
  game = null;
  show('screen-home');
}

function bindEvents() {
  // home
  $('#btn-play').onclick = () => { renderPlayers(); refreshSetupVisibility(); show('screen-setup'); };
  $('#btn-howto').onclick = () => openModal('#modal-howto');
  $('#btn-spotify-home').onclick = () => { refreshSpotifyUi(); openModal('#modal-spotify'); };

  // setup
  $$('[data-back]').forEach(b => b.onclick = () => show(b.dataset.back));
  $('#btn-add-player').onclick = addPlayer;
  $('#new-player-name').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });

  $('#mode-cards').addEventListener('click', e => {
    const card = e.target.closest('.mode-card'); if (!card) return;
    setup.mode = card.dataset.mode;
    $$('.mode-card').forEach(c => c.classList.toggle('selected', c === card));
    refreshSetupVisibility();
  });
  $('#source-cards').addEventListener('click', e => {
    const card = e.target.closest('.source-card'); if (!card) return;
    setup.source = card.dataset.source;
    $$('.source-card').forEach(c => c.classList.toggle('selected', c === card));
    refreshSetupVisibility();
    if (setup.source === 'spotify-playlist') showPlaylistPicker();
    if (setup.source === 'artists') renderChosenArtists();
  });
  $('#guess-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.guess = p.dataset.guess;
    $$('#guess-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
  });
  $('#target-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.target = +p.dataset.target;
    $$('#target-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
  });
  $('#timer-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.timer = +p.dataset.timer;
    $$('#timer-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
  });
  $('#chain-timer-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.chainTimer = +p.dataset.ctimer;
    $$('#chain-timer-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
  });

  $('#btn-add-artist').onclick = addCustomArtist;
  $('#artist-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomArtist(); });
  $('#btn-chain-search').onclick = searchChainArtist;
  $('#chain-artist-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchChainArtist(); });

  $('#btn-start-game').onclick = startGame;

  // pass + gioco
  $('#btn-ready').onclick = () => { sfx('tick'); beginTurn(); };
  $('#btn-next-turn').onclick = nextTurn;
  $('#btn-write-submit').onclick = () => answerWrite(false);
  $('#btn-write-skip').onclick = () => answerWrite(true);
  $('#write-input').addEventListener('keydown', e => { if (e.key === 'Enter') answerWrite(false); });

  // catena
  $('#btn-chain-submit').onclick = chainSubmit;
  $('#chain-input').addEventListener('keydown', e => { if (e.key === 'Enter') chainSubmit(); });
  $('#btn-chain-giveup').onclick = () => chainEliminate('🏳️ Si arrende!');

  // vittoria
  $('#btn-rematch').onclick = rematch;
  $('#btn-new-game').onclick = () => { stopConfetti(); renderPlayers(); refreshSetupVisibility(); show('screen-setup'); };
  $('#btn-go-home').onclick = () => { stopConfetti(); quitGame(); };

  // quit + classifiche
  ['#btn-quit-1', '#btn-quit-2', '#btn-quit-3'].forEach(id => $(id).onclick = () => openModal('#modal-quit'));
  $('#btn-quit-confirm').onclick = quitGame;
  ['#btn-scores-1', '#btn-scores-2'].forEach(id => $(id).onclick = showScores);

  // modali
  $$('[data-close-modal]').forEach(b => b.onclick = closeModals);
  $$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));

  // spotify
  $('#btn-spotify-connect').onclick = spotifyLogin;
  $('#btn-spotify-logout').onclick = () => { store.del('gs_sp_tokens'); refreshSpotifyUi(); toast('Spotify disconnesso'); };
  $('#redirect-uri-box').onclick = () => {
    navigator.clipboard && navigator.clipboard.writeText(spotifyRedirectUri()).then(() => toast('Redirect URI copiato! 📋')).catch(() => {});
  };
}

async function init() {
  $('#redirect-uri-box').textContent = spotifyRedirectUri();
  bindEvents();
  renderPlayers();
  refreshSetupVisibility();
  await spotifyHandleRedirect();
  refreshSpotifyUi();

  // service worker (installabilità PWA) — non in locale, per evitare cache in sviluppo
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();

// hook di debug (usato solo in sviluppo)
window.__hq = { get game() { return game; }, get setup() { return setup; }, isMatch, normalize };

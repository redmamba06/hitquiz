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

const GENRES = {
  'rap-ita': { label: '🇮🇹 Rap/Trap ITA', artists: ['Sfera Ebbasta', 'Lazza', 'Geolier', 'Marracash', 'Guè', 'Tedua', 'Capo Plaza', 'Shiva', 'Emis Killa', 'Salmo', 'Fabri Fibra', 'Rkomi', 'Ernia', 'Tony Effe', 'Anna', 'Noyz Narcos', 'Luchè', 'Paky'] },
  'pop-ita': { label: '🇮🇹 Pop ITA', artists: ['Annalisa', 'Elodie', 'Mahmood', 'Blanco', 'Ultimo', 'Tiziano Ferro', 'Giorgia', 'Alessandra Amoroso', 'Marco Mengoni', 'Fedez', 'Achille Lauro', 'Rose Villain', 'Tananai', 'Irama', 'The Kolors', 'Elisa', 'Jovanotti', 'Takagi & Ketra'] },
  'pop-int': { label: '🌍 Pop internazionale', artists: ['Taylor Swift', 'Dua Lipa', 'Ed Sheeran', 'Ariana Grande', 'Justin Bieber', 'Miley Cyrus', 'Rihanna', 'Katy Perry', 'Lady Gaga', 'Bruno Mars', 'The Weeknd', 'Sia', 'Charlie Puth', 'Shawn Mendes', 'Selena Gomez', 'Sabrina Carpenter'] },
  'hiphop': { label: '🇺🇸 Hip-Hop/R&B', artists: ['Drake', 'Eminem', 'Nicki Minaj', 'Travis Scott', 'Kendrick Lamar', 'Post Malone', 'Cardi B', '21 Savage', 'Future', 'Kanye West', 'SZA', 'Chris Brown', 'Lil Wayne', 'Snoop Dogg', '50 Cent', 'Beyoncé'] },
  'latin': { label: '🌴 Latin/Reggaeton', artists: ['Bad Bunny', 'J Balvin', 'Karol G', 'Maluma', 'Daddy Yankee', 'Ozuna', 'Shakira', 'Rosalía', 'Rauw Alejandro', 'Anuel AA', 'Nicky Jam', 'Feid', 'Peso Pluma', 'Becky G'] },
  'dance': { label: '🎛 Dance/EDM', artists: ['David Guetta', 'Calvin Harris', 'Avicii', 'Marshmello', 'The Chainsmokers', 'Kygo', 'Martin Garrix', 'Tiësto', 'Alan Walker', 'Zedd', 'Major Lazer', 'DJ Snake', 'Swedish House Mafia', 'Bob Sinclar'] }
};

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
  if (setup.audio === 'spotify' && game && game.usedSpotifyAudio) spotifyPause();
}

// avvia l'anteprima e conferma che stia suonando davvero (gli URL possono essere morti)
function tryPlayPreview(url, ms = 6000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; cleanup(); resolve(ok); };
    const onPlaying = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(!player.paused && player.currentTime > 0), ms);
    function cleanup() {
      clearTimeout(timer);
      player.removeEventListener('playing', onPlaying);
      player.removeEventListener('error', onError);
    }
    player.addEventListener('playing', onPlaying);
    player.addEventListener('error', onError);
    player.src = url;
    player.currentTime = 0;
    player.volume = 1;
    player.play().catch(() => finish(false));
  });
}

// riproduce il brano; se il link è scaduto lo ri-risolve una volta da zero
async function playTrackAudio(track) {
  if (!track.preview) return false;
  let ok = await tryPlayPreview(track.preview);
  if (!ok) {
    const key = normalize(track.artist) + '|' + normalize(track.title);
    delete previewCache[key];
    savePreviewCache();
    track.preview = null;
    const again = await resolvePreview(track);
    if (again && track.preview) ok = await tryPlayPreview(track.preview);
  }
  return ok;
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

// iTunes supporta CORS: fetch diretta come via principale (i content blocker
// mobili spesso bloccano gli script di terze parti ma non le fetch), JSONP di riserva.
// Su alcuni dispositivi iTunes è irraggiungibile del tutto: dopo 2 fallimenti
// completi smettiamo di provarci per non sprecare 20s a chiamata.
let itunesFails = 0;
async function itunesGet(url, timeoutMs = 10000) {
  if (itunesFails >= 2) throw new Error('itunes-non-raggiungibile');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();
    itunesFails = 0;
    return d;
  } catch {
    try {
      const d = await jsonp(url, timeoutMs);
      itunesFails = 0;
      return d;
    } catch (e) {
      itunesFails++;
      throw e;
    }
  }
}

/* ---- Deezer: fonte principale alternativa (JSONP, funziona ovunque) ---- */

async function deezerArtistSongs(artistName) {
  const ta = normalize(artistName);
  const out = []; const seen = new Set();
  const collect = (arr) => {
    for (const t of (arr || [])) {
      if (!t.title || !t.artist) continue;
      const an = normalize(t.artist.name || '');
      if (an !== ta && !an.includes(ta) && !ta.includes(an)) continue;
      const k = normalize(cleanTitle(t.title));
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({
        title: cleanTitle(t.title),
        rawTitle: t.title,
        artist: t.artist.name,
        primaryArtist: t.artist.name,
        preview: t.preview || null,
        art: (t.album && t.album.cover_medium) || ''
      });
    }
  };
  // 1) classifica dei brani dell'artista (i più famosi, con anteprime)
  try {
    const d = await jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=3&output=jsonp`);
    const best = (d.data || []).find(a => { const n = normalize(a.name); return n === ta || n.includes(ta) || ta.includes(n); });
    if (best) {
      const top = await jsonp(`https://api.deezer.com/artist/${best.id}/top?limit=100&output=jsonp`);
      collect(top.data);
    }
  } catch {}
  // 2) catalogo più ampio (utile per la catena)
  try {
    const d = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&limit=100&output=jsonp`);
    collect(d.data);
  } catch {}
  return out;
}

async function deezerSearchArtists(term) {
  const d = await jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(term)}&limit=5&output=jsonp`);
  return (d.data || []).map(a => ({ name: a.name, genre: '' }));
}

// cache lookup anteprime in localStorage (persistente fra partite)
const previewCache = store.get('gs_preview_cache', {});
function savePreviewCache() {
  const keys = Object.keys(previewCache);
  if (keys.length > 600) for (const k of keys.slice(0, 200)) delete previewCache[k];
  store.set('gs_preview_cache', previewCache);
}

// gli URL delle anteprime (soprattutto Deezer) scadono: la cache vale mezza giornata
const PREVIEW_TTL = 12 * 60 * 60 * 1000;

// trova l'estratto 30s per un brano {title, artist}
async function resolvePreview(item) {
  if (item.preview) return item;
  const key = normalize(item.artist) + '|' + normalize(item.title);
  const cached = previewCache[key];
  const fresh = cached && typeof cached === 'object' && cached.ts && (Date.now() - cached.ts < PREVIEW_TTL);
  if (fresh && cached.x) return null;
  if (fresh && cached.p) { item.preview = cached.p; item.art = item.art || cached.a; return item; }
  // (voci vecchie o senza data vengono ignorate e ri-risolte)

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
    const d = await itunesGet(`${ITUNES}?term=${q}&media=music&entity=song&limit=6&country=IT`);
    const best = (d.results || []).filter(r => r.previewUrl).sort((a, b) => score(b) - score(a))[0];
    if (best && score(best) >= 4) {
      item.preview = best.previewUrl;
      item.art = item.art || (best.artworkUrl100 || '').replace('100x100', '300x300');
      previewCache[key] = { p: item.preview, a: item.art, ts: Date.now() }; savePreviewCache();
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
      previewCache[key] = { p: item.preview, a: item.art, ts: Date.now() }; savePreviewCache();
      return item;
    }
  } catch {}

  previewCache[key] = { x: 1, ts: Date.now() }; savePreviewCache();
  return null;
}

// canzoni più note di un artista (con anteprima inclusa) — 1 sola chiamata
const artistSongsCache = {};
async function fetchArtistSongs(artistName) {
  const key = normalize(artistName);
  if (artistSongsCache[key]) return artistSongsCache[key];
  let songs = [];
  try {
    songs = await fetchArtistSongsItunes(artistName);
  } catch {}
  // fallback Deezer quando iTunes non risponde o trova poco
  if (songs.length < 5) {
    try { const d = await deezerArtistSongs(artistName); if (d.length > songs.length) songs = d; } catch {}
  }
  // ultima spiaggia: ricerca Spotify (max ~50 brani)
  if (songs.length < 5 && spotifyConnected()) {
    try { const s = await spotifyArtistSongs(artistName); if (s.length > songs.length) songs = s; } catch {}
  }
  artistSongsCache[key] = songs;
  return songs;
}

async function fetchArtistSongsItunes(artistName) {
  const q = encodeURIComponent(artistName);
  const d = await itunesGet(`${ITUNES}?term=${q}&media=music&entity=song&attribute=artistTerm&limit=200&country=IT`);
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
      rawTitle: r.trackName,
      artist: r.artistName,
      primaryArtist: r.artistName,
      preview: r.previewUrl || null,
      art: (r.artworkUrl100 || '').replace('100x100', '300x300')
    }))
    .filter(s => {
      const k = normalize(s.title);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return songs;
}

async function searchArtists(term) {
  // se Spotify è collegato usalo per primo: su alcuni dispositivi iTunes è bloccato
  if (spotifyConnected()) {
    try {
      const d = await spotifyApi(`/search?q=${encodeURIComponent(term)}&type=artist&limit=5`);
      const arts = ((d.artists && d.artists.items) || [])
        .map(a => ({ name: a.name, genre: (a.genres && a.genres[0]) || '' }));
      if (arts.length) return arts;
    } catch {}
  }
  try {
    const d = await itunesGet(`${ITUNES}?term=${encodeURIComponent(term)}&media=music&entity=musicArtist&limit=8&country=IT`);
    const seen = new Set();
    const arts = (d.results || [])
      .filter(r => { const k = normalize(r.artistName); if (!k || seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 5)
      .map(r => ({ name: r.artistName, genre: r.primaryGenreName || '' }));
    if (arts.length) return arts;
  } catch {}
  return deezerSearchArtists(term);
}

/* ============ collaborazioni (Duello Feat) ============ */

// confronto "morbido": minuscole e accenti, ma SENZA togliere le parentesi
// (i "feat. X" vivono lì dentro)
const soft = (x) => (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// estrae i nomi dopo feat./ft./with/con nel titolo originale
function parseFeatArtists(rawTitle) {
  const m = (rawTitle || '').match(/[\(\[\s\-–]+(?:feat|ft|with|con)\.?\s+([^\)\]\-–]+)/i);
  if (!m) return [];
  return m[1].split(/,|&| e | x | y /i).map(s => s.trim()).filter(s => s && s.length > 1);
}

// dai brani di un pool ricava le coppie di artisti che hanno collaborato
function collabsFromTracks(tracks) {
  const pairs = new Map();
  for (const t of tracks) {
    let names = t.artists ? [...t.artists]
      : String(t.artist || '').split(/,|&|\bfeat\.?\b|\bft\.?\b/i).map(s => s.trim());
    names = names.concat(parseFeatArtists(t.rawTitle || t.title));
    // dedup mantenendo l'ordine (il primo è l'artista principale)
    const seen = new Set(); const uniq = [];
    for (const n of names) { const k = soft(n); if (n && k && !seen.has(k)) { seen.add(k); uniq.push(n); } }
    if (uniq.length < 2) continue;
    const [a, b] = uniq;
    const key = [soft(a), soft(b)].sort().join('|');
    if (!pairs.has(key)) pairs.set(key, { a, b, songs: [] });
    const p = pairs.get(key);
    const clean = cleanTitle(t.title);
    if (clean && !p.songs.some(s => normalize(s) === normalize(clean))) p.songs.push(clean);
  }
  return [...pairs.values()].filter(p => p.songs.length >= 1);
}

// amplia l'elenco delle canzoni fatte insieme cercando nei cataloghi dei due artisti
async function expandPairSongs(pair) {
  try {
    const [sa, sb] = await Promise.all([
      fetchArtistSongs(pair.a).catch(() => []),
      fetchArtistSongs(pair.b).catch(() => [])
    ]);
    // confini di parola: "anna" non deve combaciare dentro "annalisa"
    const hasName = (text, name) => {
      const esc = soft(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])').test(text);
    };
    for (const s of [...sa, ...sb]) {
      const inv = soft((s.rawTitle || s.title) + ' ' + s.artist);
      if (hasName(inv, pair.a) && hasName(inv, pair.b)) {
        const c = cleanTitle(s.title);
        if (c && !pair.songs.some(x => normalize(x) === normalize(c))) pair.songs.push(c);
      }
    }
  } catch {}
  return pair;
}

/* ============ Spotify (OAuth PKCE, tutto client-side) ============ */

const SPOTIFY_SCOPES = 'user-top-read user-library-read playlist-read-private playlist-read-collaborative user-modify-playback-state user-read-playback-state';

function spotifyHasCurrentScopes() { return store.get('gs_scopes', '') === SPOTIFY_SCOPES; }

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
    store.set('gs_scopes', SPOTIFY_SCOPES);
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
    rawTitle: t.name,
    artist: t.artists.map(a => a.name).slice(0, 2).join(', '),
    artists: t.artists.map(a => a.name),
    primaryArtist: t.artists[0].name,
    art: (t.album && t.album.images && t.album.images[1] && t.album.images[1].url) || '',
    uri: t.uri || null
  };
}

// chiamate con corpo (player Spotify Connect)
async function spotifyApiSend(method, path, body) {
  const token = await spotifyToken();
  if (!token) throw new Error('not-connected');
  const res = await fetch('https://api.spotify.com/v1' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 1200)); return spotifyApiSend(method, path, body); }
  if (!res.ok) { const e = new Error('api ' + res.status); e.status = res.status; throw e; }
  return null;
}

// riproduzione tramite l'app Spotify (richiede Premium + un dispositivo attivo)
async function spotifyPlay(uri) {
  try {
    await spotifyApiSend('PUT', '/me/player/play', { uris: [uri] });
    return true;
  } catch (e) {
    if (e.status === 403) return 'premium'; // account non Premium
    // nessun dispositivo attivo: prova a trasferire su uno disponibile
    try {
      const d = await spotifyApi('/me/player/devices');
      const dev = (d.devices || []).find(x => !x.is_restricted);
      if (dev) {
        await spotifyApiSend('PUT', '/me/player/play?device_id=' + dev.id, { uris: [uri] });
        return true;
      }
    } catch (e2) { if (e2.status === 403) return 'premium'; }
    return false;
  }
}

function spotifyPause() { spotifyApiSend('PUT', '/me/player/pause').catch(() => {}); }

// trova l'uri Spotify di un brano proveniente da iTunes (per l'audio Premium)
const uriCache = store.get('gs_uri_cache', {});
async function resolveSpotifyUri(item) {
  if (item.uri) return item;
  const key = normalize(item.artist) + '|' + normalize(item.title);
  if (uriCache[key]) { item.uri = uriCache[key]; return item; }
  try {
    const q = encodeURIComponent(`track:"${cleanTitle(item.title)}" artist:"${item.primaryArtist || item.artist}"`);
    const d = await spotifyApi(`/search?q=${q}&type=track&limit=3`);
    const found = (d.tracks && d.tracks.items) || [];
    const best = found.find(t => isMatch(cleanTitle(t.name), item.title)) || found[0];
    if (best) {
      item.uri = best.uri;
      if (!item.art) item.art = (best.album && best.album.images && best.album.images[1] && best.album.images[1].url) || '';
      uriCache[key] = best.uri;
      store.set('gs_uri_cache', uriCache);
    }
  } catch {}
  return item;
}

// canzoni di un artista via Spotify (fallback quando iTunes non è raggiungibile);
// da feb 2026 la ricerca restituisce max 10 risultati per pagina
async function spotifyArtistSongs(artistName) {
  const out = []; const seen = new Set(); const ta = normalize(artistName);
  for (let offset = 0; offset < 50; offset += 10) {
    const d = await spotifyApi(`/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&type=track&limit=10&offset=${offset}`);
    const found = (d.tracks && d.tracks.items) || [];
    for (const t of found) {
      const m = mapSpotifyTrack(t);
      if (!m) continue;
      const ra = normalize(m.primaryArtist);
      if (ra !== ta && !ra.includes(ta) && !ta.includes(ra)) continue;
      const k = normalize(m.title);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ title: m.title, artist: m.artist, primaryArtist: m.primaryArtist, art: m.art, preview: null, uri: m.uri });
    }
    if (!d.tracks || !d.tracks.next) break;
  }
  return out;
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
  mode: 'quiz',            // quiz | write | chain | duel
  playStyle: store.get('gs_style', 'turns'), // turns (uno alla volta) | buzz (prenotazione)
  guess: 'title',          // title | artist | either
  target: 1000,
  timer: 15,
  source: 'famous',        // famous | spotify-top | spotify-playlist | artists
  audio: store.get('gs_audio', 'preview'), // preview (30s gratis) | spotify (app Spotify, Premium)
  playlistId: null,
  customArtists: [],
  chainArtist: null,
  chainTimer: 30,
  duelSource: 'genre',     // genre | spotify-top | spotify-playlist
  genre: 'rap-ita'
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
  const isDuel = setup.mode === 'duel';
  $('#opts-style').classList.toggle('hidden', isChain || isDuel);
  $('#style-hint').classList.toggle('hidden', setup.playStyle !== 'buzz');
  $('#opts-guess').classList.toggle('hidden', isChain || isDuel);
  $('#opts-points').classList.toggle('hidden', isChain);
  $('#opts-timer').classList.toggle('hidden', isChain);
  $('#opts-source').classList.toggle('hidden', isChain || isDuel);
  $('#opts-audio').classList.toggle('hidden', isChain || isDuel);
  $('#audio-hint').classList.toggle('hidden', setup.audio !== 'spotify');
  $('#opts-chain').classList.toggle('hidden', !isChain);
  $('#opts-duel').classList.toggle('hidden', !isDuel);
  $('#genre-pills').classList.toggle('hidden', setup.duelSource !== 'genre');
  const wantPlaylist = !isChain && (isDuel ? setup.duelSource === 'spotify-playlist' : setup.source === 'spotify-playlist');
  $('#playlist-picker').classList.toggle('hidden', !wantPlaylist);
  $('#artists-picker').classList.toggle('hidden', setup.source !== 'artists' || isChain || isDuel);
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
    playStyle: setup.playStyle,
    buzzBooker: -1,
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
    failedLookups: 0,
    // duello feat
    duelPairs: [],
    duelIndex: -1,
    duelBooker: -1,
    duelRound: 0
  };
}

/* ============ avvio partita ============ */

async function startGame() {
  if (setup.players.length < 1) { toast('Aggiungi almeno un giocatore!'); return; }
  if (setup.mode === 'chain' && setup.players.length < 2) { toast('La catena richiede almeno 2 giocatori!'); return; }
  if (setup.mode === 'chain' && !setup.chainArtist) { toast('Scegli l\'artista della sfida!'); return; }
  if ((setup.mode === 'quiz' || setup.mode === 'write') && setup.playStyle === 'buzz' && setup.players.length < 2) {
    toast('Per giocare a prenotazione servono almeno 2 giocatori!'); return;
  }
  if (setup.mode === 'duel') {
    if (setup.players.length < 2) { toast('Il Duello Feat richiede almeno 2 giocatori!'); return; }
    if (setup.duelSource !== 'genre' && !spotifyConnected()) { toast('Prima collega Spotify 💚 (o scegli un genere)'); return; }
    if (setup.duelSource === 'spotify-playlist' && !setup.playlistId) { toast('Scegli una playlist!'); return; }
  }
  if (setup.source === 'spotify-top' && setup.mode !== 'chain' && !spotifyConnected()) { toast('Prima collega Spotify 💚'); return; }
  if (setup.source === 'spotify-playlist' && setup.mode !== 'chain' && !setup.playlistId) { toast('Scegli una playlist!'); return; }
  if (setup.source === 'artists' && setup.mode !== 'chain' && !setup.customArtists.length) { toast('Aggiungi almeno un artista!'); return; }
  if (setup.audio === 'spotify' && setup.mode !== 'chain') {
    if (!spotifyConnected()) { toast('Per l\'audio via app Spotify devi prima collegare Spotify 💚'); return; }
    if (!spotifyHasCurrentScopes()) {
      toast('Servono nuovi permessi Spotify: tocca "Aggiorna permessi" e ricollega', 4500);
      refreshSpotifyUi(); openModal('#modal-spotify');
      return;
    }
  }

  const btn = $('#btn-start-game');
  btn.disabled = true; btn.textContent = '⏳ Preparo la musica…';
  game = makeGame();

  try {
    if (game.mode === 'chain') {
      const songs = await fetchArtistSongs(setup.chainArtist);
      if (songs.length < 10) { toast('Trovate troppo poche canzoni per questo artista, provane un altro'); throw new Error('few'); }
      game.chainSongs = songs;
      startChain();
    } else if (game.mode === 'duel') {
      let tracks = [];
      if (setup.duelSource === 'spotify-top') tracks = await loadSpotifyTastePool();
      else if (setup.duelSource === 'spotify-playlist') tracks = await loadSpotifyPlaylistTracks(setup.playlistId);
      else {
        // genere: pesca dai cataloghi di ~9 artisti del genere (in parallelo, con cache)
        const artists = shuffle(GENRES[setup.genre].artists).slice(0, 9);
        const all = await Promise.all(artists.map(a => fetchArtistSongs(a).catch(() => [])));
        tracks = all.flat();
      }
      // meglio coppie tra artisti riconoscibili: entrambi noti > uno noto > il resto
      const known = new Set();
      if (setup.duelSource === 'genre') {
        GENRES[setup.genre].artists.forEach(a => known.add(soft(a)));
      } else {
        const counts = {};
        for (const t of tracks) {
          known.add(soft(t.primaryArtist || t.artist));
          for (const n of (t.artists || [])) counts[soft(n)] = (counts[soft(n)] || 0) + 1;
        }
        for (const k in counts) if (counts[k] >= 2) known.add(k);
      }
      const all = collabsFromTracks(tracks);
      const both = all.filter(p => known.has(soft(p.a)) && known.has(soft(p.b)));
      const one = all.filter(p => !both.includes(p) && (known.has(soft(p.a)) || known.has(soft(p.b))));
      let pairs = shuffle(both);
      if (pairs.length < 8) pairs = pairs.concat(shuffle(one));
      if (pairs.length < 3) {
        toast('Trovate troppo poche collaborazioni con questa sorgente 😕 prova un genere');
        throw new Error('few');
      }
      game.duelPairs = pairs;
      duelNextRound();
      show('screen-duel');
    } else {
      await prepareMusicPool();
      if (game.pool.length < 8 && !game.artistQueue.length) {
        toast('Trovati troppo pochi brani con questa sorgente 😕');
        throw new Error('few');
      }
      if (game.playStyle === 'buzz') { game.round = 0; buzzNextRound(); }
      else nextTurn();
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
    let ok;
    if (setup.audio === 'spotify') {
      await resolveSpotifyUri(t);
      ok = !!t.uri;
    } else {
      ok = (await resolvePreview(t)) && t.preview;
    }
    if (ok) {
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
  $('#answers-quiz').classList.remove('locked');
  $('#answers-write').classList.add('hidden');
  $('#game-buzzers').classList.add('hidden');
  $('#btn-buzz-start').classList.add('hidden');
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
  if (setup.audio === 'spotify') {
    const res = await spotifyPlay(track.uri);
    if (res !== true) {
      toast(res === 'premium'
        ? 'Questo account non è Premium: usa le anteprime 30s 🎧'
        : 'Nessun dispositivo Spotify attivo: apri l\'app Spotify, avvia un brano qualsiasi e riprova', 5000);
      // rimetti il brano in coda e torna alla schermata del turno
      game.usedKeys.delete(trackKey(track));
      game.queue.unshift(track);
      show('screen-pass');
      return;
    }
    game.usedSpotifyAudio = true;
  } else {
    const okAudio = await playTrackAudio(track);
    if (!okAudio) {
      // canzone che non suona: passane un'altra da solo (max 3 tentativi)
      game.playRetries = (game.playRetries || 0) + 1;
      if (game.playRetries <= 3) {
        toast('🙉 Questa canzone non si carica: ne pesco un\'altra…');
        beginTurn();
      } else {
        game.playRetries = 0;
        toast('Problemi con l\'audio: controlla la connessione 😕');
        show('screen-pass');
      }
      return;
    }
    game.playRetries = 0;
  }
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

/* ---- partite a prenotazione (quiz/scrittura col buzzer) ---- */

function buzzNextRound() {
  stopMusic();
  clearTimer();
  $('#result-overlay').classList.add('hidden');
  game.round++;
  game.buzzBooker = -1;
  game.answered = false;
  show('screen-game');
  $('#game-player-emoji').textContent = '⚡️';
  $('#game-player-name').textContent = `Round ${game.round} · obiettivo ${game.target}`;
  $('#answers-quiz').classList.add('hidden');
  $('#answers-write').classList.add('hidden');
  $('#game-buzzers').classList.add('hidden');
  $('#loading-track').classList.add('hidden');
  $('#btn-buzz-start').classList.remove('hidden');
  $('#vinyl').classList.remove('spinning');
  $('#equalizer').classList.add('paused');
  $('#timerbar').style.width = '100%';
  $('#timerbar').classList.remove('danger');
  $('#game-question').textContent = 'Tutti pronti col dito sul buzzer? 👇';
}

async function buzzStartRound() {
  $('#btn-buzz-start').classList.add('hidden');
  $('#loading-track').classList.remove('hidden');

  const track = await pullNextTrack();
  if (!track) {
    toast('Non riesco a trovare altre canzoni 😕 — controlla la connessione');
    show('screen-setup');
    return;
  }
  game.current = track;
  $('#loading-track').classList.add('hidden');

  let guessKind = game.guess;
  if (guessKind === 'either' && game.mode === 'quiz') guessKind = Math.random() < .5 ? 'title' : 'artist';
  game.currentGuessKind = guessKind;
  $('#game-question').textContent =
    (game.mode === 'write'
      ? (guessKind === 'title' ? 'Sai il TITOLO?' : guessKind === 'artist' ? 'Sai l\'ARTISTA?' : 'Sai TITOLO o ARTISTA?')
      : (guessKind === 'artist' ? 'Chi la canta?' : 'Che canzone è?')) + ' Prenotati! ⚡️';

  if (setup.audio === 'spotify') {
    const res = await spotifyPlay(track.uri);
    if (res !== true) {
      toast(res === 'premium'
        ? 'Questo account non è Premium: usa le anteprime 30s 🎧'
        : 'Nessun dispositivo Spotify attivo: apri l\'app Spotify, avvia un brano qualsiasi e riprova', 5000);
      game.usedKeys.delete(trackKey(track));
      game.queue.unshift(track);
      $('#btn-buzz-start').classList.remove('hidden');
      return;
    }
    game.usedSpotifyAudio = true;
  } else {
    const okAudio = await playTrackAudio(track);
    if (!okAudio) {
      game.playRetries = (game.playRetries || 0) + 1;
      if (game.playRetries <= 3) {
        toast('🙉 Questa canzone non si carica: ne pesco un\'altra…');
        buzzStartRound();
      } else {
        game.playRetries = 0;
        toast('Problemi con l\'audio: controlla la connessione 😕');
        $('#btn-buzz-start').classList.remove('hidden');
        $('#loading-track').classList.add('hidden');
      }
      return;
    }
    game.playRetries = 0;
  }
  $('#vinyl').classList.add('spinning');
  $('#equalizer').classList.remove('paused');

  // nel quiz le opzioni si vedono subito (si può ragionare!) ma si risponde solo dopo il buzz
  if (game.mode === 'quiz') {
    renderQuizAnswers(track, guessKind);
    $('#answers-quiz').classList.add('locked');
  }

  const box = $('#game-buzzers');
  box.innerHTML = game.players.map((p, i) => `
    <button class="buzzer-btn" data-buzz="${i}" style="--hue:${playerHue(i)}">
      <span class="bz-emoji">${p.emoji}</span>
      <span class="bz-name">${escapeHtml(p.name)}</span>
      <span class="bz-score">${p.score} pt</span>
    </button>`).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('[data-buzz]').forEach(b => b.onclick = () => buzzBook(+b.dataset.buzz));

  startTimer(game.timerSec, () => buzzNoOne());
}

function buzzBook(i) {
  if (game.buzzBooker >= 0 || game.answered) return;
  game.buzzBooker = i;
  game.turn = i;
  clearTimer();
  // musica in pausa: suspense!
  player.pause();
  if (setup.audio === 'spotify' && game.usedSpotifyAudio) spotifyPause();
  $('#vinyl').classList.remove('spinning');
  $('#equalizer').classList.add('paused');
  sfx('tick'); vibrate([60, 40, 60]);
  const p = game.players[i];
  $('#game-player-emoji').textContent = p.emoji;
  $('#game-player-name').textContent = p.name;
  $('#game-buzzers').classList.add('hidden');
  if (game.mode === 'quiz') $('#answers-quiz').classList.remove('locked');
  else renderWriteAnswer();
  startTimer(game.timerSec, () => onTimeout());
}

function buzzNoOne() {
  if (game.answered) return;
  game.answered = true;
  $$('#answers-quiz .answer-btn').forEach(b => { if (b.dataset.ok === '1') b.classList.add('correct'); else b.classList.add('dim'); });
  finishTurn(false, null); // nessun prenotato: nessuna penalità
}

// dopo il risultato: prossimo round o vittoria (nelle partite a prenotazione)
function nextStep() {
  if (game && game.playStyle === 'buzz' && (game.mode === 'quiz' || game.mode === 'write')) {
    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    if (sorted[0].score >= game.target && sorted[0].score > (sorted[1] ? sorted[1].score : -1)) {
      showWinner(sorted);
      return;
    }
    buzzNextRound();
  } else {
    nextTurn();
  }
}

/* ---- timer ---- */

function startTimer(sec, onEnd) {
  clearTimer();
  game.timerEnd = Date.now() + sec * 1000;
  const bar = $(game.mode === 'chain' ? '#chain-timerbar' : game.mode === 'duel' ? '#duel-timerbar' : '#timerbar');
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
  const isBuzz = game.playStyle === 'buzz';
  if (isBuzz && game.buzzBooker < 0) return; // prima bisogna prenotarsi
  game.answered = true;
  clearTimer();
  const ok = btn.dataset.ok === '1';
  $$('#answers-quiz .answer-btn').forEach(b => {
    if (b.dataset.ok === '1') b.classList.add('correct');
    else if (b === btn) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  finishTurn(ok, ok ? (isBuzz ? { total: 200, streakBonus: 0 } : computePoints(100)) : null);
}

function answerWrite(skip = false) {
  if (game.answered) return;
  const guessKind = game.currentGuessKind;
  const track = game.current;
  const val = $('#write-input').value;
  let ok = false, titleOk = false;
  if (!skip && val.trim()) {
    titleOk = isMatch(val, track.title);
    const artistOk = track.artist.split(',').some(a => isMatch(val, a)) || isMatch(val, track.artist);
    ok = guessKind === 'title' ? titleOk : guessKind === 'artist' ? artistOk : (titleOk || artistOk);
  }
  const isBuzz = game.playStyle === 'buzz';
  if (!ok && !skip && val.trim() && timeLeftFrac() > 0.05 && !isBuzz) {
    // risposta sbagliata ma c'è ancora tempo: lascia riprovare (solo a turni:
    // con la prenotazione si rischia, un colpo solo!)
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
  // il titolo è più difficile dell'artista: vale di più
  const base = isBuzz
    ? (guessKind === 'artist' ? 150 : guessKind === 'title' ? 200 : (titleOk ? 200 : 150))
    : (guessKind === 'artist' ? 100 : guessKind === 'title' ? 150 : (titleOk ? 150 : 100));
  finishTurn(ok, ok ? (isBuzz ? { total: base, streakBonus: 0 } : computePoints(base)) : null);
}

function onTimeout() {
  if (game.answered) return;
  game.answered = true;
  $$('#answers-quiz .answer-btn').forEach(b => { if (b.dataset.ok === '1') b.classList.add('correct'); else b.classList.add('dim'); });
  finishTurn(false, null);
}

function finishTurn(ok, points) {
  const isBuzz = game.playStyle === 'buzz' && (game.mode === 'quiz' || game.mode === 'write');
  const booker = isBuzz ? game.buzzBooker : game.turn;
  const p = booker >= 0 ? game.players[booker] : null;
  let pointsText = '+0 punti';
  if (p && ok) {
    if (!isBuzz) p.streak++;
    p.score += points.total;
    pointsText = `${p.emoji} +${points.total} punti` + (points.streakBonus ? ' 🔥' : '');
    sfx('correct'); vibrate([50, 40, 90]);
  } else if (p) {
    if (isBuzz) { p.score = Math.max(0, p.score - 100); pointsText = `${p.emoji} −100 punti 😬`; }
    else p.streak = 0;
    sfx('wrong'); vibrate(200);
  } else {
    sfx('wrong');
  }
  const t = game.current;
  setTimeout(() => {
    let verdict;
    if (ok) verdict = rand(['✅ Giusto!', '🎯 Bravissimo!', '🔥 Grande!', '💪 Esatto!']);
    else if (!p) verdict = '😴 Nessuno si è prenotato!';
    else verdict = timeLeftFrac() <= 0 ? '⏰ Tempo scaduto!' : '❌ Sbagliato!';
    $('#result-verdict').textContent = verdict;
    $('#result-verdict').className = 'result-verdict ' + (ok ? 'ok' : 'ko');
    const art = $('#result-art');
    if (t.art) { art.src = t.art; art.style.display = ''; } else art.style.display = 'none';
    $('#result-title').textContent = cleanTitle(t.title);
    $('#result-artist').textContent = t.artist;
    $('#result-points').textContent = pointsText;
    $('#result-overlay').classList.remove('hidden');
  }, ok || timeLeftFrac() > 0 ? 900 : 300);

  // prefetch del prossimo brano mentre si guarda il risultato
  setTimeout(() => {
    if (!game || !game.queue[0]) return;
    (setup.audio === 'spotify' ? resolveSpotifyUri(game.queue[0]) : resolvePreview(game.queue[0])).catch(() => {});
  }, 1200);
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

/* ============ duello feat ============ */

const playerHue = (i) => (i * 57 + 260) % 360;

function duelPair() { return game.duelPairs[game.duelIndex % game.duelPairs.length]; }

function duelNextRound() {
  clearTimer();
  game.duelIndex++;
  game.duelRound++;
  game.duelBooker = -1;
  const pair = duelPair();
  // in sottofondo arricchisci l'elenco delle canzoni fatte insieme (serve alla verifica)
  pair.expanding = expandPairSongs(pair);

  $('#duel-round').textContent = `Round ${game.duelRound} · obiettivo ${game.target}`;
  $('#duel-artist-a').textContent = pair.a;
  $('#duel-artist-b').textContent = pair.b;
  $('#duel-timerbar').style.width = '100%';
  $('#duel-timerbar').classList.remove('danger');
  $('#duel-answer').classList.add('hidden');
  $('#duel-result').classList.add('hidden');
  $('#btn-duel-skip').classList.remove('hidden');
  $('#duel-hint').textContent = 'Conosci una canzone fatta insieme da questi due? Prenotati! ⚡️';

  const box = $('#duel-buzzers');
  box.innerHTML = game.players.map((p, i) => `
    <button class="buzzer-btn" data-buzz="${i}" style="--hue:${playerHue(i)}">
      <span class="bz-emoji">${p.emoji}</span>
      <span class="bz-name">${escapeHtml(p.name)}</span>
      <span class="bz-score">${p.score} pt</span>
    </button>`).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('[data-buzz]').forEach(b => b.onclick = () => duelBuzz(+b.dataset.buzz));
}

function duelBuzz(i) {
  if (game.duelBooker >= 0) return;
  game.duelBooker = i;
  game.turn = i; // per la classifica / activePlayer
  const p = game.players[i];
  sfx('tick'); vibrate([60, 40, 60]);
  $('#duel-buzzers').classList.add('hidden');
  $('#btn-duel-skip').classList.add('hidden');
  $('#duel-hint').textContent = 'Scrivi il titolo di una canzone che hanno fatto insieme!';
  $('#duel-booker-emoji').textContent = p.emoji;
  $('#duel-booker-name').textContent = p.name;
  const answer = $('#duel-answer');
  answer.classList.remove('hidden');
  const input = $('#duel-input');
  input.value = '';
  setTimeout(() => input.focus(), 120);
  startTimer(game.timerSec, () => duelResolve(false, '⏰ Tempo scaduto!'));
}

async function duelSubmit() {
  if (game.duelBooker < 0) return;
  const guess = $('#duel-input').value.trim();
  if (!guess) return;
  clearTimer();
  const pair = duelPair();
  try { await pair.expanding; } catch {}
  const hit = pair.songs.find(s => isMatch(guess, s));
  duelResolve(!!hit, hit ? `✅ "${hit}" — esiste davvero!` : '❌ Non risulta tra le loro collaborazioni…');
}

function duelResolve(ok, message) {
  if (game.duelBooker < 0) return;
  const p = game.players[game.duelBooker];
  const pair = duelPair();
  if (ok) {
    p.score += 200;
    sfx('correct'); vibrate([50, 40, 90]);
  } else {
    p.score = Math.max(0, p.score - 100);
    sfx('wrong'); vibrate(200);
  }
  clearTimer();
  game.duelBooker = -1;
  $('#duel-answer').classList.add('hidden');
  const fb = $('#duel-feedback');
  fb.className = 'chain-feedback ' + (ok ? 'ok' : 'ko');
  fb.innerHTML = `${escapeHtml(message)}<br>${escapeHtml(p.emoji + ' ' + p.name)}: <b>${ok ? '+200' : '−100'} pt</b>` +
    (!ok && pair.songs[0] ? `<br><span class="muted">Per esempio: «${escapeHtml(pair.songs[0])}»</span>` : '');
  $('#duel-result').classList.remove('hidden');

  // vittoria immediata al raggiungimento dell'obiettivo
  if (ok && p.score >= game.target) {
    setTimeout(() => showWinner([...game.players].sort((a, b) => b.score - a.score)), 1400);
  }
}

function duelSkip() {
  const pair = duelPair();
  const fb = $('#duel-feedback');
  fb.className = 'chain-feedback';
  fb.innerHTML = pair.songs[0]
    ? `🤷 Nessuno si è prenotato!<br><span class="muted">Una era: «${escapeHtml(pair.songs[0])}»</span>`
    : '🤷 Nessuno si è prenotato!';
  $('#duel-buzzers').classList.add('hidden');
  $('#btn-duel-skip').classList.add('hidden');
  $('#duel-result').classList.remove('hidden');
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
  } else if (game.mode === 'duel') {
    game.players.forEach(p => { p.score = 0; p.streak = 0; });
    game.duelPairs = shuffle(game.duelPairs);
    game.duelIndex = -1;
    game.duelRound = 0;
    duelNextRound();
    show('screen-duel');
  } else if (game.playStyle === 'buzz') {
    game.players.forEach(p => { p.score = 0; p.streak = 0; });
    game.turn = -1;
    game.round = 0;
    buzzNextRound();
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
    $('#btn-spotify-relink').classList.toggle('hidden', spotifyHasCurrentScopes());
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

/* ============ diagnostica connessione ============ */

async function runDiagnostics() {
  const box = $('#diag-results');
  const rows = [];
  const render = () => { box.innerHTML = rows.map(r => `<p>${escapeHtml(r)}</p>`).join(''); };
  rows.push('⏳ Test in corso…'); render();
  rows.length = 0;

  const test = async (name, fn) => {
    try { const extra = await fn(); rows.push(`✅ ${name}${extra ? ' · ' + extra : ''}`); }
    catch (e) { rows.push(`❌ ${name} · ${(e && (e.message || e.name)) || 'errore'}`); }
    render();
  };

  await test('iTunes (diretta)', async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${ITUNES}?term=queen&media=music&entity=musicArtist&limit=1&country=IT`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    return d.resultCount + ' risultati';
  });
  await test('iTunes (script)', async () => {
    const d = await jsonp(`${ITUNES}?term=queen&media=music&entity=musicArtist&limit=1&country=IT`, 8000);
    return d.resultCount + ' risultati';
  });
  await test('Deezer (script)', async () => {
    const d = await jsonp('https://api.deezer.com/search/artist?q=queen&limit=1&output=jsonp', 8000);
    return ((d.data || []).length) + ' risultati';
  });
  if (spotifyConnected()) {
    await test('API Spotify', async () => {
      const me = await spotifyApi('/me');
      return me.display_name || 'ok';
    });
    await test('Ricerca Spotify', async () => {
      const d = await spotifyApi('/search?q=queen&type=artist&limit=1');
      return ((d.artists && d.artists.items) || []).length + ' risultati';
    });
    if (!spotifyHasCurrentScopes()) {
      rows.push('⚠️ Dispositivi Spotify · servono i nuovi permessi: tocca "Aggiorna permessi" qui sopra'); render();
    } else {
      await test('Dispositivi Spotify', async () => {
        const d = await spotifyApi('/me/player/devices');
        const devs = (d.devices || []).map(x => x.name + (x.is_active ? ' (attivo)' : ''));
        return devs.length ? devs.join(', ') : 'nessuno — apri l\'app Spotify';
      });
    }
  } else {
    rows.push('⚪️ Spotify non collegato'); render();
  }
  rows.push('📋 Riporta questi risultati se qualcosa non va!'); render();
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
  $('#audio-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.audio = p.dataset.audio;
    store.set('gs_audio', setup.audio);
    $$('#audio-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
    $('#audio-hint').classList.toggle('hidden', setup.audio !== 'spotify');
  });
  $('#chain-timer-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.chainTimer = +p.dataset.ctimer;
    $$('#chain-timer-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
  });

  $('#duel-source-cards').addEventListener('click', e => {
    const card = e.target.closest('.source-card'); if (!card) return;
    setup.duelSource = card.dataset.dsource;
    $$('#duel-source-cards .source-card').forEach(c => c.classList.toggle('selected', c === card));
    refreshSetupVisibility();
    if (setup.duelSource === 'spotify-playlist') showPlaylistPicker();
  });
  $('#genre-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.genre = p.dataset.genre;
    $$('#genre-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
  });

  $('#btn-add-artist').onclick = addCustomArtist;
  $('#artist-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomArtist(); });
  $('#btn-chain-search').onclick = searchChainArtist;
  $('#chain-artist-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchChainArtist(); });

  $('#btn-start-game').onclick = startGame;

  // pass + gioco
  $('#btn-ready').onclick = () => { sfx('tick'); beginTurn(); };
  $('#btn-next-turn').onclick = nextStep;
  $('#btn-buzz-start').onclick = buzzStartRound;
  $('#style-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill'); if (!p) return;
    setup.playStyle = p.dataset.style;
    store.set('gs_style', setup.playStyle);
    $$('#style-pills .pill').forEach(x => x.classList.toggle('selected', x === p));
    $('#style-hint').classList.toggle('hidden', setup.playStyle !== 'buzz');
  });
  $('#btn-write-submit').onclick = () => answerWrite(false);
  $('#btn-write-skip').onclick = () => answerWrite(true);
  $('#write-input').addEventListener('keydown', e => { if (e.key === 'Enter') answerWrite(false); });

  // catena
  $('#btn-chain-submit').onclick = chainSubmit;
  $('#chain-input').addEventListener('keydown', e => { if (e.key === 'Enter') chainSubmit(); });
  $('#btn-chain-giveup').onclick = () => chainEliminate('🏳️ Si arrende!');

  // duello feat
  $('#btn-duel-submit').onclick = duelSubmit;
  $('#duel-input').addEventListener('keydown', e => { if (e.key === 'Enter') duelSubmit(); });
  $('#btn-duel-giveup').onclick = () => duelResolve(false, '🏳️ Si arrende!');
  $('#btn-duel-next').onclick = duelNextRound;
  $('#btn-duel-skip').onclick = duelSkip;

  // vittoria
  $('#btn-rematch').onclick = rematch;
  $('#btn-new-game').onclick = () => { stopConfetti(); renderPlayers(); refreshSetupVisibility(); show('screen-setup'); };
  $('#btn-go-home').onclick = () => { stopConfetti(); quitGame(); };

  // quit + classifiche
  ['#btn-quit-1', '#btn-quit-2', '#btn-quit-3', '#btn-quit-4'].forEach(id => $(id).onclick = () => openModal('#modal-quit'));
  $('#btn-quit-confirm').onclick = quitGame;
  ['#btn-scores-1', '#btn-scores-2', '#btn-scores-3'].forEach(id => $(id).onclick = showScores);

  // modali
  $$('[data-close-modal]').forEach(b => b.onclick = closeModals);
  $$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));

  // spotify
  $('#btn-spotify-connect').onclick = spotifyLogin;
  $('#btn-spotify-relink').onclick = spotifyLogin;
  $('#btn-diagnostics').onclick = runDiagnostics;
  $('#btn-spotify-logout').onclick = () => { store.del('gs_sp_tokens'); refreshSpotifyUi(); toast('Spotify disconnesso'); };
  $('#redirect-uri-box').onclick = () => {
    navigator.clipboard && navigator.clipboard.writeText(spotifyRedirectUri()).then(() => toast('Redirect URI copiato! 📋')).catch(() => {});
  };
}

async function init() {
  $('#redirect-uri-box').textContent = spotifyRedirectUri();
  bindEvents();
  renderPlayers();
  // allinea le pillole alle ultime scelte salvate
  $$('#audio-pills .pill').forEach(p => p.classList.toggle('selected', p.dataset.audio === setup.audio));
  $$('#style-pills .pill').forEach(p => p.classList.toggle('selected', p.dataset.style === setup.playStyle));
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
window.__hq = {
  get game() { return game; }, get setup() { return setup; },
  isMatch, normalize, tryPlayPreview, playTrackAudio,
  forceItunesDown() { itunesFails = 99; }
};

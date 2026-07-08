# 🎵 HitQuiz — Indovina la canzone

Party game musicale da giocare con gli amici, tutti sullo stesso telefono. **100% gratuito**: niente App Store, niente abbonamenti (non serve nemmeno Spotify Premium).

## Come funziona

- **🔠 Quiz 4 opzioni** — parte una canzone, scegli la risposta giusta tra 4 prima che scada il tempo. Più sei veloce più punti fai. Vince chi arriva per primo al punteggio scelto.
- **⌨️ Scrivila!** — come il quiz ma la risposta la scrivi tu (titolo, artista o entrambi). Maiuscole, accenti e piccoli errori di battitura vengono perdonati.
- **🔗 Catena d'artista** — scegliete un artista: a turno ognuno nomina una sua canzone vera e non già detta. Chi si blocca è eliminato, vince l'ultimo che resta.
- **🤝 Duello Feat** — l'app propone due artisti che hanno collaborato (dai tuoi gusti Spotify, da una playlist o da un genere a scelta). Lo schermo si divide in buzzer, uno per giocatore: il primo che si prenota deve nominare una canzone fatta insieme. +200 se giusta, −100 se sbagliata!

Sorgenti musicali per i quiz: **i tuoi gusti Spotify** (top brani + preferiti), **una tua playlist**, **artisti a scelta** o un **mix di hit famose**. L'audio usa gli estratti gratuiti di 30 secondi di iTunes/Deezer.

## 📲 Metterla sul telefono (gratis)

L'app è una PWA: va messa online (serve HTTPS) e poi aggiunta alla schermata Home.

### Opzione A — GitHub Pages (consigliata)

1. Crea un account gratuito su [github.com](https://github.com) se non ce l'hai.
2. Crea un repository nuovo (es. `hitquiz`), pubblico.
3. Carica tutti i file di questa cartella (su GitHub: *Add file → Upload files*).
4. Vai in *Settings → Pages*, sotto "Branch" scegli `main` e salva.
5. Dopo ~1 minuto l'app è su `https://TUONOME.github.io/hitquiz/`.

### Opzione B — Netlify Drop

1. Vai su [app.netlify.com/drop](https://app.netlify.com/drop).
2. Trascina la cartella del progetto nella pagina: ottieni subito un link HTTPS.

### Poi, sul telefono

- **iPhone**: apri il link in Safari → tasto Condividi → **Aggiungi a schermata Home**.
- **Android**: apri il link in Chrome → menu ⋮ → **Aggiungi a schermata Home** / **Installa app**.

## 💚 Collegare Spotify (una tantum, 2 minuti)

1. Vai su [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) e accedi col tuo account Spotify (quello normale, gratuito va bene).
2. **Create app**: nome e descrizione a piacere (es. "HitQuiz").
3. In **Redirect URIs** incolla l'indirizzo esatto dove hai pubblicato l'app (lo trovi anche dentro l'app: *Collega Spotify* → riquadro giallo, toccalo per copiarlo). Es: `https://tuonome.github.io/hitquiz/`
4. Spunta **Web API** e salva.
5. Apri l'app appena creata nel dashboard e copia il **Client ID**.
6. In HitQuiz: *Collega Spotify* → incolla il Client ID → *Collega ora*.

> Nota: l'app Spotify resta in "Development mode", che è gratis e va benissimo: sei tu l'unico che deve collegare l'account, gli amici giocano dal tuo telefono.

## 🛠 Sviluppo locale

```bash
python3 -m http.server 8471
# poi apri http://localhost:8471
```

Nessuna dipendenza, nessuna build: HTML + CSS + JS puri.

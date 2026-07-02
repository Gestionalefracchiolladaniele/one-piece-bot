# Claupiece — Specifica di progetto

> **Rebrand di Redictra.** Riusa l'infrastruttura (Supabase + GitHub Actions + Apify
> + Gemini + Telegram + Vercel/Next.js) ma è un PRODOTTO DIVERSO. La specifica di
> prodotto completa è in `REBRAND.md`; questo file è la guida tecnica del codice
> attuale. Il vecchio prodotto Redictra (bot segnali AI da Reddit) NON esiste più.

---

## 🎯 Cos'è
Un **tracker personale di prezzi per carte One Piece TCG**. Monitora Vinted, lo
confronta col prezzo di riferimento CardTrader, e **avvisa su Telegram** quando
compare un affare su una carta della watchlist. Uso **PERSONALE** (una watchlist,
notifiche a te). Non multi-utente, non un SaaS, niente onboarding.

## 🧠 Il modello (il cuore)
Due tipi di fonte:
- **PREZZO DI RIFERIMENTO** (CardTrader) — "quanto vale davvero", cambia lento → letto
  di rado (gratis).
- **CACCIA AGLI AFFARI** (Vinted) — annunci di privati, dinamici → letto spesso (ogni
  ora, dentro una finestra), l'unico costo.

Il **deal_finder** confronta `prezzo Vinted` vs `riferimento` e applica la **regola**
della carta (prezzo_max / perc_sconto / ogni_annuncio) → se è un affare, lo **scorer**
(Gemini) gli dà ⭐ e il **notifier** lo manda su Telegram.

## ⚙️ Costi — €0 (solo free tier Apify $5/mese)
Riferimenti 1×/giorno (gratis). Vinted: **finestra 6h** + **1 run batch** (tutte le
carte insieme) → lordo ~$4.68/mese, dentro i $5 gratis. L'AVVIO Apify ($0.02/run) è
il killer del budget, non i risultati → la finestra taglia gli avvii da 720 a 180/mese.
NON alzare `N_RISULTATI_PER_CARTA` né allargare la finestra senza rifare i conti
(vedi `REBRAND.md` "Costi"). Migrazione futura a ScrapeBadger = cambiare solo
`vinted_source.py`.

## 📡 Fonti dati
| Fonte | Cosa dà | Accesso | Costo | Frequenza |
|---|---|---|---|---|
| **punk-records** (GitHub) | anagrafica carte (JSON raw) | nessuna chiave | €0 | settimanale |
| **CardTrader API** | prezzo riferimento + country_code | Bearer token (OPZIONALE, da abilitare col supporto) | €0 | 1×/giorno (in main.py) |
| **Cardmarket** (via Apify) | prezzo riferimento (EU) | `APIFY_TOKEN`, Smart Scraper | ~€0 | **settimanale** (refresh_riferimenti.py) |
| **Vinted** (via Apify) | annunci privati (affari) | `APIFY_TOKEN`, actor Smart Scraper (kazkn) | ~€0 (free tier) | ogni ora, finestra 6h |
| **Gemini** (`gemini-2.5-flash`) | scoring a stelle | `GEMINI_API_KEY` | €0 | on-demand |

**Riferimento prezzi — quale fonte:** CardTrader se `CARDTRADER_TOKEN` c'è (API gratis,
ma va abilitata dal supporto); altrimenti **Cardmarket via Apify** (settimanale, costo
trascurabile ~$0.09/mese); se mancano entrambi → solo regola `prezzo_max` (tetto in €).
`db.ultimo_prezzo_riferimento(codice)` (fonte=None) prende il più recente tra le fonti.
⚠️ **Verità sulle fonti** (da `REBRAND.md`): Cardmarket API ufficiale inaccessibile →
solo via Apify; Vinted non ha API pubblica usabile (Datadome) → serve Apify; CardTrader
è l'unica API ufficiale pulita (ma non pubblica). ⚠️ Cardmarket NON va letto nel loop
orario (costa l'avvio Apify): SOLO settimanale.

## 🕕 Finestra oraria (l'ottimizzazione chiave)
Il cron gira ogni ora UTC (`0 * * * *`). `main.py` all'avvio controlla (a) se le
notifiche sono in **pausa** (`db.notifiche_in_pausa`) e (b) se l'ora locale
(`config.TIMEZONE`) è nella **finestra attiva** (`config.finestra_attiva(ora, inizio,
fine)`): in entrambi i casi negativi → esce subito, ZERO costo Apify. La finestra è a
**ORARI LIBERI** (non più 3 preset): ora inizio + ora fine 0–24 (es. 7→13), salvate nel
DB (`config.finestra_inizio`/`finestra_fine`, via `db.finestra_orari()`), modificabili
da web app e dal comando Telegram `/finestra`. I preset (6–12 / 12–18 / 18–24) restano
solo come scorciatoie a bottone. Fallback: `config.FINESTRA_INIZIO/FINE_DEFAULT`.
⚠️ Più ore = più avvii Apify = più costo (consigliate ~6h, oltre ~7h rischi di sforare).

## 🗄️ Dati (Supabase) — 8 tabelle (`schema.sql`)
`carte` (anagrafica, PK codice) · `watchlist` (carte monitorate + regola + priorità +
paese) · `prezzi_riferimento` (storico per carta/fonte) · `annunci_visti` (dedup item_id
Vinted) · `affari` (affari trovati, per dashboard) · `config` (1 riga: finestra_preset,
ultimo_refresh_riferimenti) · `collezione` (carte possedute, PK codice→FK carte) ·
`utenti_bot` (chat id autorizzati al bot via deep link). RLS on, deny-all: tutto passa
dal **service role**.

## 🔁 Flusso del cron (`main.py`)
1. Siamo nella finestra? NO → esci (0 costo). 2. Leggi watchlist attive. 3. Riferimenti
CardTrader 1×/giorno (segnato in `config.ultimo_refresh_riferimenti`). 4. `vinted_source
.cerca_batch` (1 run Apify). 5. Dedup su `annunci_visti`. 6. `deal_finder.trova_affari`.
7. `scorer.valuta` (⭐). 8. `notifier.invia_affare` (Telegram, ordinati per stelle).
9. Salva in `affari` + marca visti. → niente in target = nessuna notifica (zero rumore).

## 📦 File del backend (Python)
- `config.py` — env + Apify/CardTrader/Vinted params + finestra oraria (`finestra_attiva`)
  + regole. Placeholder `__TODO_*__` se una env manca (`manca()`).
- `card_database.py` — sync anagrafica punk-records → `carte` (difensivo sullo schema).
- `cardtrader.py` — games→expansions→blueprints→prezzi; risolve codice→blueprint_id e lo
  salva su `carte.cardtrader_blueprint_id`; `prezzo_riferimento` filtra per country_code.
- `cardmarket_source.py` — prezzo di riferimento Cardmarket via Apify (batch, come Vinted).
  Solo SETTIMANALE. `aggiorna_riferimenti(codici)` → salva fonte='cardmarket'.
- `refresh_riferimenti.py` — entrypoint settimanale: sceglie la fonte (CardTrader se
  configurato, altrimenti Cardmarket) e aggiorna i riferimenti della watchlist.
- `vinted_source.py` — `costruisci_url` (filtri Vinted) + `cerca_batch` (1 run Apify per
  tutte le carte, rimappa i risultati alla carta). **Unico punto per migrare a ScrapeBadger.**
- `deal_finder.py` — `trova_affari`: confronto + regola (prezzo_max/perc_sconto/ogni_annuncio).
- `scorer.py` — Gemini `valuta` (⭐1–5 + motivo); euristica sullo sconto se l'AI fallisce.
- `notifier.py` — `componi_affare` (puro) + `invia_affare`/`_invia_testo` (Telegram,
  import lazy). ⚠️ Ora invia a **TUTTI** i destinatari autorizzati: `db.chat_id_autorizzati()`
  = tabella `utenti_bot` + proprietario (`TELEGRAM_CHAT_ID`), deduplicati. Un destinatario
  che ha bloccato il bot viene saltato senza fermare gli altri.
- `bot_handler.py` — ⚠️ **LEGACY/non più usato in produzione.** Era il bot in POLLING
  (non gira su serverless). Sostituito dal webhook `web/.../api/telegram` (vedi web app).
  Tenuto solo come riferimento comandi. Lista comandi BotFather in `COMANDI_BOT.md`.
- `main.py` — cron orchestratore (vedi flusso sopra).
- `schema.sql` — 8 tabelle + RLS. `requirements.txt`, `.env.example`.
- `.github/workflows/`: `cron_runner.yml` (Vinted, orario) + `card_sync.yml` (anagrafica
  punk-records + refresh riferimenti Cardmarket/CardTrader, settimanale lunedì 04:00 UTC).

## 🌐 Web app (`web/`, Next.js 16 + Tailwind, pnpm)
Dashboard su Vercel per gestire watchlist/regole/finestra e vedere gli ultimi affari.
- **Front end riadattato da LinkedinGoat** (`WEB APP/linkedingoat`): stesso impianto
  "aurora + particelle" (`AuroraBackground.tsx`), ma **sfondo TENDENTE AL VIOLA** (deep
  purple, token in `globals.css`), **card e bottoni BIANCHI** (funzionali per l'uso,
  testo scuro su bianco), **font ottimizzati** via `next/font` (Inter + Sora, subset
  latin, pesi ridotti). Particelle ridotte 18→14 (più leggero), valori deterministici
  (no hydration mismatch).
- **Layout mobile-first**: `page.tsx` usa classi Tailwind responsive (non più inline
  style fissi) — stack verticale sotto `sm:` (640px), select/bottoni full-width su
  mobile e affiancati da tablet in su, `viewport` con `width=device-width` in
  `layout.tsx`. Righe con più azioni (checkbox+rimuovi in watchlist, quantità+prezzo+
  rimuovi in collezione, stelle+link in "Ultimi affari") sono raggruppate in un
  sotto-flex `justify-between` dedicato invece di lasciarle tutte sullo stesso
  flex-wrap della riga principale, per evitare che si affollino su schermi stretti.
  In `globals.css`: sotto 640px i `.field` forzano `font-size: 16px` (evita lo zoom
  automatico di iOS Safari sul focus) e i `.btn` hanno `min-height: 40px` (touch
  target). Provare sempre su viewport stretto (≤375px) dopo modifiche a `page.tsx`.
- **STRUTTURA A 3 PAGINE + navbar** (non più pagina unica): `page.tsx` (Home: stat
  cards cliccabili, azioni rapide, finestra di caccia, ultimi affari) · `watchlist/
  page.tsx` (ricerca+aggiungi, regole inline) · `collezione/page.tsx` (ricerca live
  tcgapi, valore totale, aggiorna prezzi). Navbar condivisa `components/NavBar.tsx`
  (rotta attiva evidenziata; sotto 420px solo emoji). Layout in `layout.tsx`.
- **Hook condiviso `src/lib/useClaupiece.ts`** = UNICA fonte di stato + tutte le azioni
  (watchlist/affari/config/collezione + avviaCaccia/inviaRiepilogo/aggiornaPrezziColl).
  ⚠️ Le funzioni sono `useCallback` (stabili): negli `useEffect` delle pagine dipendere
  SOLO dalla singola funzione (es. `cercaLive`), MAI dall'intero oggetto `c` — quello è
  ricreato a ogni render → loop di effetti che BLOCCA la navigazione (bug già capitato).
- **Bottoni azione** (`components/AzioneBtn.tsx`, con stato/conferma): Avvia caccia
  (workflow_dispatch GitHub), Invia riepilogo Telegram, Aggiorna prezzi collezione,
  Ricarica, Pausa/Riprendi.
- **PWA** ("Aggiungi a schermata Home" con icona): `app/icon.tsx` + `app/apple-icon.tsx`
  (icona viola generata via `next/og`, no file binari) + `app/manifest.ts` + meta
  `appleWebApp` in `layout.tsx`. ⚠️ L'emoji 🏴‍☠️ (sequenza ZWJ) in `ImageResponse` può
  renderizzare solo la bandiera nera: se l'icona esce male, disegnarla senza emoji.
- `src/app/api/*` — route server (service role, RLS deny-all): `watchlist`, `cards`
  (ricerca DB o `?live=1` su tcgapi), `collezione` (+ `collezione/prezzi` POST refresh),
  `deals`, `config`, `prices`, `actions` (avvia_caccia via GitHub dispatch / invia_
  riepilogo Telegram), `telegram` (WEBHOOK del bot, vedi sotto).
- **Bot Telegram = WEBHOOK `api/telegram/route.ts`** (NON più il polling di
  `bot_handler.py`). Telegram fa POST a ogni messaggio; la route replica i comandi
  (/help /app /affari /watchlist /finestra /pausa /riprendi /prezzo + bottoni finestra),
  verifica `TELEGRAM_WEBHOOK_SECRET` (header) e filtra per autorizzazione. **Accesso via
  DEEP LINK**: `t.me/Claupiecebot?start=CODICE` → `/start CODICE` (se == `BOT_INVITE_CODE`)
  salva il chat id in `utenti_bot` e autorizza. Autorizzati = `utenti_bot` + proprietario;
  ricevono TUTTI anche le notifiche affari (vedi `notifier.py`). Registrare il webhook una
  volta con `setWebhook` (url `/api/telegram` + `secret_token`).
- `src/lib/` — `supabase.ts` (browser anon + admin service role), `env.ts`, `types.ts`,
  `useClaupiece.ts` (hook), `tcgapi.ts` (client tcgapi.dev server-side: `cercaLive`,
  `cartaPerCodice`). ⚠️ **tcgapi cerca SOLO per NOME** (campo `q`, min 2 char): il codice
  esatto (es. OP05-067) spesso dà 0 risultati (nessuna carta si *chiama* così). La ricerca
  collezione è quindi per NOME; i risultati mostrano codice+set+rarità+printing per
  distinguere le varianti. NB: più carte diverse possono avere lo stesso `number`
  (Alternate Art, Event Pack…) → la PK `codice` in `collezione` non distingue le varianti.
- Env web (Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client),
  `SUPABASE_SERVICE_ROLE_KEY` (solo server), `TCGAPI_KEY` (+ `TCGAPI_API_BASE`,
  `TCGAPI_GAME_SLUG`, `CAMBIO_USD_EUR` opz.). **Bot webhook**: `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `BOT_INVITE_CODE` (deep link),
  `NEXT_PUBLIC_WEB_APP_URL`. **Avvia caccia** (opz.): `GITHUB_ACTIONS_TOKEN` +
  `GITHUB_REPO` (+ `GITHUB_WORKFLOW_FILE`/`GITHUB_REF_BRANCH`). ⚠️ Le env NEXT_PUBLIC_*
  devono avere ESATTAMENTE quel prefisso (bug capitato: `SUPABASE_URL` senza prefisso →
  `env.supabaseUrl` vuoto → `supabaseUrl is required` → 500 con body vuoto → il client
  fa `.json()` su risposta vuota → "Unexpected end of JSON input"). ⚠️ Le env vanno
  messe SU VERCEL (non basta il `.env` locale) e serve REDEPLOY perché si applichino.
  Build: `cd web && pnpm install && pnpm build`. **Root Directory su Vercel = `web`**
  (altrimenti Vercel scambia `main.py` alla radice per una Python function e fallisce).

## 📚 Collezione ("raccoglitore") + fonte prezzi tcgapi.dev
Aggiunta una **collezione personale**: le carte che POSSIEDI + quante copie, con
**valore totale** stimato. Indipendente dalla watchlist (che serve alla caccia affari).
- **Fonte anagrafica + prezzi = `tcgapi.dev`** (chiave `TCGAPI_KEY`, header `X-API-Key`,
  base `https://api.tcgapi.dev/v1`). Free tier **100 richieste/GIORNO** (il campo
  `rate_limit` nella risposta lo conferma). Ricerca paginata → un set costa poche chiamate.
- ⚠️ **Prezzi in USD** (mercato USA/TCGPlayer), NON EUR/Cardmarket. Li salviamo con
  `fonte='tcgapi'`, `valuta='USD'`, e li mostriamo ANCHE in € come STIMA (cambio
  USD→EUR da feed gratuito `open.er-api.com`, fallback `CAMBIO_USD_EUR_FALLBACK`=0.92).
  **Nessun "fattore Europa"**: USA vs EU non ha un moltiplicatore fisso affidabile
  (One Piece EU si gioca in inglese = stesso prodotto; il divario dipende dalla fascia
  carta e dal cambio) → si è scelto di mostrare solo la stima col cambio, etichettata
  "stima mercato USA". Non reintrodurre un fattore per-carta (finta precisione).
- **`tcgapi_source.py`** (backend) — client tcgapi: `cerca` (live), `importa_carte`
  (per SET/nomi, paginato, salva anagrafica+prezzo), `aggiorna_prezzi` (refresh),
  `cambio_usd_eur`/`usd_in_eur`. Codice carta = campo `number` (es. OP01-120).
- **`web/src/lib/tcgapi.ts`** — gemello TS lato server per la web app.
- **Popolamento SENZA riga di comando:** la ricerca della collezione è **live**
  (`/api/cards?live=1`): l'utente scrive il nome, vede carte reali con foto+prezzo;
  al click su "+ Colleziona" il POST `/api/collezione` fa **upsert della carta in
  `carte`** (anagrafica) + salva il prezzo, POI la aggiunge alla collezione. Zero
  pre-popolamento: il DB si riempie solo con le carte davvero aggiunte (budget-friendly).
- **Tabella `collezione`** (`codice` PK → FK `carte`, `quantita`, `note`). Il valore
  NON è salvato: si calcola a runtime (`quantita × ultimo prezzo tcgapi`). Il totale
  (pezzi/USD/EUR) è calcolato in `/api/collezione` GET.

## 🔐 Variabili d'ambiente (backend / GitHub Secrets)
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (obbl., **service role** non anon) ·
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (proprietario; le notifiche vanno a lui +
tutti gli `utenti_bot`) · `APIFY_TOKEN` (obbl., Vinted) · `CARDTRADER_TOKEN` (OPZIONALE:
se manca, riferimento via Cardmarket/Apify o solo regola prezzo_max) · `GEMINI_API_KEY`
(scoring) · `TIMEZONE` (opz., default Europe/Rome) · `LINGUA_ANAGRAFICA` (opz.) ·
`TCGAPI_KEY` (anagrafica + prezzi collezione; header X-API-Key; free tier 100 req/giorno) ·
`CAMBIO_USD_EUR_FALLBACK` (opz., default 0.92). NB: `FINESTRA_DEFAULT` NON è letta da
codice attivo (inerte); la finestra vive nel DB con fallback `FINESTRA_INIZIO/FINE`.
⚠️ **GitHub Secrets ≠ Vercel env**: sono due posti separati. I workflow (cron) leggono i
GitHub Secrets; la web app legge le env di Vercel. Le env web (webhook bot, deep link,
GitHub token per la caccia) stanno SOLO su Vercel (vedi sezione web app).

## ⚠️ Principi non negoziabili
1. Uso personale, basso volume (3 carte). Non commerciale.
2. Non ripubblicare contenuto verbatim: le notifiche LINKANO l'annuncio; lo scoring è
   analisi derivata.
3. Vinted ToS: scraping leggero, via Apify (loro gestiscono IP/anti-bot). Rischio basso.
4. Budget €0: solo free tier Apify. Config dimensionata per NON sforare mai.

## 🔁 Cosa è cambiato rispetto a Redictra (questi file SOVRASCRIVONO l'eredità)
- **Prodotto:** bot segnali AI da Reddit (lead magnet multi-utente) → tracker prezzi
  carte One Piece con alert Vinted (personale).
- **Fonti:** Reddit (Apify/RSS) → CardTrader + Vinted (Apify) + punk-records.
- **AI:** digest madre Gemini 1/giorno → Gemini scoring affari on-demand.
- **Output:** brief giornaliero → alert affare (quando compare).
- **Interfaccia:** solo bot Telegram → web app dashboard + Telegram solo canale notifiche.
- **Trigger:** 06:00 locale → finestra oraria 6h + controllo orario.
- **RIMOSSI** (file cancellati): `reddit_scraper.py`, `ai_engine.py`,
  `telegram_delivery.py`, `api/telegram.py` (webhook onboarding), `vercel.json`/
  `pyproject.toml`/`.vercelignore` (webhook Vercel), argomenti fissi, digest madre,
  accesso a invito, timezone multi-utente, onboarding.
- **`bot_handler.py`**: NON più onboarding — riscritto come bot di consultazione
  personale (comandi /app /affari /watchlist /finestra /prezzo /pausa /riprendi).
- **AGGIUNTI:** `card_database.py`, `cardtrader.py`, `vinted_source.py`, `deal_finder.py`,
  `scorer.py`, `notifier.py`, watchlist + regole, dedup annunci, finestra oraria libera,
  pausa notifiche, anagrafica auto da punk-records, dashboard web `web/` (aurora viola,
  card bianche), bot comandi.

## 🐞 Bug/insidie ereditate da Redictra (NON reintrodurre)
1. **Supabase: usare la service_role**, non l'anon (scritture rifiutate).
2. **`zoneinfo` su Windows** → serve `tzdata` (già in requirements).
3. **Gemini 503** su flash-lite → lista `MODELLI_SCORING` con retry+fallback.
4. Dopo un `ALTER TABLE` su Supabase, riavviare (cache schema).
5. **`card_database.py`/punk-records: schema — RISOLTO (sessione "anagrafica DB").**
   Il repo reale (`buhbbl/punk-records`, branch `main`) usa cartelle-lingua ESTESE
   (`english`, non `en`; `french`, `japanese`…). Dentro `english/`: `packs.json`
   (dict {pack_id:{title_parts:{label:"OP-01"}}}), `cards/<pack_id>/<CODICE>.json`
   (una carta/file, con `img_full_url`), e soprattutto **`index/cards_by_id.json`**
   = TUTTE le carte in UN file {codice:{...}} (~4571 record, ~1.2 MB, SENZA immagine).
   `card_database.py` ora scarica l'indice (1 fetch) + `packs.json` (1 fetch) e
   RICOSTRUISCE l'immagine dal pattern ufficiale fisso
   `https://en.onepiece-cardgame.com/images/cardlist/card/<codice>.png`. ⚠️ Insidie:
   (a) le VARIANTI hanno suffisso `_pN` **minuscolo** nell'URL immagine (il codice
   uppercase `_P1` dà 404) → l'immagine si costruisce dal `card_id` ORIGINALE; (b) i
   `name` arrivano con entità HTML (`&amp;`, `&#39;`) → `html.unescape`. Ogni carta
   punk-records: `card_id`, `name`, `pack_id`, `rarity`, `colors` (lista), `category`.
   NB: tcgapi.dev resta la fonte PREZZI (punk-records non ha prezzi).

## ✅ Stato
Web app **DEPLOYATA su Vercel** (`https://one-piece-bot.vercel.app`, Root Directory=`web`):
3 pagine + navbar + PWA + bot webhook + accesso multi-utente via deep link. Build pulita
(`next build` OK, 17 route). Backend cron su GitHub Actions.
Da verificare/completare in produzione:
- Eseguire lo `schema.sql` **aggiornato** su Supabase (tabelle `collezione` + `utenti_bot`).
- Env su **Vercel** (non solo `.env`!) + **redeploy**: le NEXT_PUBLIC_* col prefisso esatto,
  `BOT_INVITE_CODE`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_WEB_APP_URL`, e (opz.)
  `GITHUB_ACTIONS_TOKEN`+`GITHUB_REPO` per il bottone "Avvia caccia".
- Webhook Telegram registrato (`setWebhook` → `/api/telegram` + secret_token).
- Deep link d'invito: `t.me/Claupiecebot?start=<BOT_INVITE_CODE>` (cambiare il codice
  d'esempio con uno robusto; chi ha il link entra e riceve le notifiche).
- **Test costo Apify reale** al primo run Vinted. Budget tcgapi **100 req/giorno**.

## 🛠️ Sessione: collezione + tcgapi (cosa è stato fatto)
- Scoperto: chiave `TCGAPI_KEY` è di **tcgapi.dev** (non apitcg.com); host giusto
  `api.tcgapi.dev/v1`, header `X-API-Key`, prezzi USD/TCGPlayer, free tier 100/giorno.
  apitcg.com invece NON dà prezzi; punk-records ha lo schema rotto (vedi insidia #5).
- Aggiunti: `tcgapi_source.py`, tabella `collezione` (`schema.sql`), helper `db.py`
  (collezione), costanti `config.py` (tcgapi + cambio), route `web/.../api/collezione`,
  ricerca live in `api/cards?live=1`, `web/src/lib/tcgapi.ts`, sezione "📚 La mia
  collezione" in `page.tsx` (ricerca live con foto+prezzo, quantità, valore, totale),
  tipi `VoceCollezione`/`TotaleCollezione` in `types.ts`.
- `.env`: `TELEGRAM_CHAT_ID` corretto (era il nome del bot → ora id numerico); commento
  `TCGAPI_KEY` aggiornato (non più "futuro").

## 🛠️ Sessione: deploy + bot webhook + multi-utente + PWA + 3 pagine
- **Deploy Vercel**: risolto `Found main.py but no "app"` impostando **Root Directory=`web`**.
  Risolto "Unexpected end of JSON input": era `SUPABASE_URL` su Vercel invece di
  `NEXT_PUBLIC_SUPABASE_URL` → client Supabase vuoto → 500 senza body. Le env vanno su
  Vercel (non basta `.env`) + redeploy.
- **Bot da polling → WEBHOOK**: creato `web/.../api/telegram/route.ts` (replica i comandi
  di `bot_handler.py`, che resta LEGACY). Webhook registrato con `setWebhook` + secret.
- **Accesso multi-utente via DEEP LINK**: `t.me/Claupiecebot?start=CODICE`. Tabella
  `utenti_bot`, env `BOT_INVITE_CODE`. Autorizzati = utenti_bot + proprietario; ricevono
  TUTTI le notifiche (`notifier._invia_testo` ora itera `db.chat_id_autorizzati()`).
  Scelta prodotto: accesso COMPLETO (dashboard condivisa, non spazi separati).
- **Web app riorganizzata in 3 pagine** (Home/Watchlist/Collezione) + `NavBar` + hook
  condiviso `useClaupiece.ts`. **Fix bug navigazione bloccata**: `useEffect` dipendeva
  dall'intero oggetto hook (ricreato ogni render) → loop; ora dipende solo dalle funzioni.
- **Bottoni azione**: `AzioneBtn` + route `api/actions` (avvia caccia via GitHub
  workflow_dispatch, invia riepilogo Telegram) + `api/collezione/prezzi` (refresh prezzi).
- **Ricerca collezione**: chiarito che tcgapi cerca solo per NOME (codice esatto spesso 0
  risultati); UI mostra codice/set/rarità/printing per distinguere le varianti.
- **Mobile**: `overflow-x:hidden` globale, `img{max-width:100%}`, navbar compatta,
  `min-w-0`/`truncate` sui risultati (fix "esce fuori" dallo schermo).
- **PWA**: `app/icon.tsx`+`apple-icon.tsx` (via next/og), `manifest.ts`, meta appleWebApp
  → "Aggiungi a schermata Home" con icona su iPhone e Android.

## 🛠️ Sessione: fix salvataggio, velocità, ricerca economica, UX carte
- **FIX salvataggio collezione/watchlist** (era rotto): al POST si ri-cercava la carta
  per codice su tcgapi (che cerca solo per nome → 0 risultati → "non trovata"). Ora il
  client passa i DATI CARTA (nome/set/prezzo/immagine) già ottenuti dalla ricerca nel
  body; la route salva l'anagrafica senza ri-cercare. La watchlist ora garantisce
  l'anagrafica come la collezione (prima violava la FK watchlist→carte).
- **Velocità (aggiornamenti ottimistici)**: le modifiche (quantità/regole/rimozione)
  aggiornano SUBITO lo stato locale e fanno PATCH/DELETE in background (niente più
  `ricarica()` completo = 4 fetch dopo ogni azione); risincronizza solo se il server
  rifiuta. Aggiunte fanno un solo fetch mirato. Totali collezione ricalcolati localmente.
- **Costo tcgapi = per RICHIESTA, non per carta** (verificato su doc ufficiale + messaggio
  d'errore dell'API "100 requests/day account-wide"). Quindi: ricerca alzata a **100
  risultati in 1 richiesta**, ordinati per prezzo desc. ⚠️ ECCEZIONE: "Aggiorna prezzi"
  fa 1 richiesta PER CARTA (deve ritrovare ogni prezzo) → con N carte = N richieste.
- **Ricerca MANUALE** (bottone/Invio, no auto-live mentre digiti): 1 richiesta per
  ricerca, per non bruciare il free tier (100/giorno). Vale collezione + watchlist.
- **RisultatiRicerca** (componente condiviso): paginazione client 10/pagina con numeri
  1-2-3…, filtro per rarità. Mostra codice/set/rarità/printing/prezzo.
- **Collezione**: ricerca LOCALE tra le carte già inserite; di default mostra solo le
  **TOP 5 per valore**, il resto appare cercando; click su immagine/nome → **CartaModal**
  (pop-up con immagine grande + info + prezzo/valore).
- **Inserimento MANUALE** (`InserisciManuale`): pop-up per aggiungere una carta a mano
  (quando la ricerca non trova o il limite è esaurito). Nome+codice obbligatori, resto
  opzionale; bottone (i) con guida + link (TCGPlayer/Cardmarket/sito ufficiale). Usa lo
  stesso POST (che accetta `carta` nel body). In collezione e watchlist.
- **Aggiorna prezzo SINGOLA carta**: `/api/collezione/prezzi?codice=...` + bottone
  "💲 Prezzo" per carta (evita di risprecare richieste su carte già aggiornate).
- **Watchlist**: rimosso selettore priorità (inutile); **limite 3 carte ATTIVE** insieme
  (budget Apify), imposto lato server (POST aggiunge in pausa se già a 3; PATCH rifiuta
  409) e lato UI (blocco toggle + avviso + contatore X/3).
- ⚠️ **Persistenza**: le carte in collezione stanno su Supabase, NON su tcgapi → restano
  visibili col loro prezzo anche a rate limit esaurito (il GET non chiama tcgapi).

## 🛠️ Sessione: anagrafica DB (punk-records), raccoglitore, ricerca a costo zero
Obiettivo: azzerare le chiamate tcgapi nella ricerca e trasformare la collezione in un
vero "raccoglitore". Verità sui numeri: One Piece TCG ha ~2.634 carte BASE + ~1.937
varianti = **4.571 record** in **53 set** (tutte importate). Fonti esterne: ~2.886 = solo
booster OP; Limitless elenca 51 set → il nostro dataset le copre TUTTE.
- **Anagrafica DA DB (punk-records), non più tcgapi live.** `card_database.py` riscritto
  (vedi insidia #5 RISOLTA): sincronizza 4571 carte su `carte` con 2 fetch. Girato dal
  workflow settimanale; nuovi set presi in automatico.
- **Ricerca a due livelli (economica):** `/api/cards?q=` di DEFAULT cerca nel **DB locale**
  (zero costo, `daDb()` mappa la riga a `CartaLive` con prezzo null, ordina per rilevanza).
  Il prezzo tcgapi si prende **SOLO al click "Colleziona/Aggiungi"**: `assicuraCarta` fa
  UNA chiamata `cartaPerCodice` MIRATA sul number esatto (1 richiesta). Se il DB non trova
  → bottone **"🌐 Cerca online (tcgapi)"** = `/api/cards?live=1`. Hook: `cercaCarte` (DB) +
  `cercaOnline` (tcgapi); `cercaLive` RINOMINATO. Vale collezione E watchlist.
- **RACCOGLITORE (`components/Binder.tsx`):** album porta-carte 3×3 = 9 carte/facciata.
  DESKTOP (≥768px) = due facciate affiancate (18 carte, con "rilegatura" centrale);
  MOBILE = una facciata (9). Sfoglio con animazione `binder-anim-next/prev` (slide
  coerente col verso). Toggle ordinamento **💎 Valore / 🔢 Numerazione** (`chiaveNumero`
  ordina per set-prefix + numero + suffisso variante). Barra **"trova → salta a pagina"**:
  calcola la facciata della carta e ci va, evidenziandola (`binder-card--found`). Stili in
  `globals.css` (`.binder*`). Sostituisce la vecchia lista "Top 5".
- **`CartaModal` ora è azionabile:** props opz. `onQuantita/onPrezzo/onRimuovi/onEsito`.
  Il click su una carta del binder apre il modal con quantità/💲prezzo/🗑️rimuovi. ⚠️ La
  pagina passa `dettaglioCodice` (string) e deriva la voce FRESCA da `c.collezione`, così
  il modal riflette subito gli aggiornamenti (non un oggetto congelato).
- **Watchlist da collezione:** selettore "📚 scegli dalla collezione" (carte già nel DB,
  non ancora in watchlist) → aggiunta a ZERO chiamate esterne.
- **Foto manuale via URL:** `InserisciManuale` ha già il campo URL; aggiunta l'**anteprima
  live** della foto incollata (grigia se il link non è un'immagine).
- **Vinted ottimizzato (`vinted_source.py`):** (1) il **CODICE** carta è il segnale
  primario nel `search_text` (il nome è ambiguo); (2) filtro categoria opz.
  `VINTED_CATALOG_ID` (`catalog[]` nell'URL) per tagliare via/gadget — LASCIATO VUOTO di
  default (per 3 carte cercate per codice il rumore è già minimo, e l'id è fragile/per-paese);
  (3) **URL Vinted PERSONALIZZATO per carta**: colonna `watchlist.vinted_url` + campo UI
  (`<details>`), se presente `cerca_batch` la usa ESATTAMENTE così com'è. `main.py` passa
  `vinted_url` alle carte preparate. ACTOR: confermato che **Turbo Scraper costa DI PIÙ**
  (avvio $0.08 vs $0.02, per-risultato $0.0035 vs $0.002) → resta lo **Smart Scraper**.
- **Verificato su Supabase reale:** sync 4571 carte OK; POST collezione (upsert + prezzo)
  e watchlist (con FK rispettata) scrivono/rileggono; build web pulita (17 route).
- ⚠️ **Migrazione da applicare a mano** su Supabase (fatta dall'utente): `alter table
  watchlist add column if not exists vinted_url text;` — senza, tutto ok tranne il salvataggio
  dell'URL Vinted personalizzato.

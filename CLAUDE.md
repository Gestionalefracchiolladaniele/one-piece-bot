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

## 🗄️ Dati (Supabase) — 6 tabelle (`schema.sql`)
`carte` (anagrafica, PK codice) · `watchlist` (carte monitorate + regola + priorità +
paese) · `prezzi_riferimento` (storico per carta/fonte) · `annunci_visti` (dedup item_id
Vinted) · `affari` (affari trovati, per dashboard) · `config` (1 riga: finestra_preset,
ultimo_refresh_riferimenti). RLS on, deny-all: tutto passa dal **service role**.

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
- `notifier.py` — `componi_affare` (puro) + `invia_affare` (Telegram, import lazy).
- `bot_handler.py` — bot Telegram di CONSULTAZIONE (polling, personale via
  `TELEGRAM_CHAT_ID`): comandi /app /affari (link cliccabile all'annuncio) /watchlist
  /finestra (cambia orari) /prezzo /pausa /riprendi /help. Distinto dal cron (parlano
  solo via Supabase). Lista comandi BotFather in `COMANDI_BOT.md`.
- `main.py` — cron orchestratore (vedi flusso sopra).
- `schema.sql` — 6 tabelle + RLS. `requirements.txt`, `.env.example`.
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
- `src/app/page.tsx` — dashboard (client): finestra oraria, ricerca+aggiungi carta,
  watchlist con regole inline, ultimi affari. Chiama le API route.
- `src/app/api/*` — route server (service role, RLS deny-all): `watchlist` (GET/POST/
  PATCH/DELETE), `cards` (ricerca), `deals`, `config`, `prices`.
- `src/lib/` — `supabase.ts` (browser anon + admin service role), `env.ts`, `types.ts`.
- Env web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client),
  `SUPABASE_SERVICE_ROLE_KEY` (solo server). Build: `cd web && pnpm install && pnpm build`.

## 🔐 Variabili d'ambiente (backend)
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (obbl., **service role** non anon) ·
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (il tuo chat, notifiche personali) ·
`APIFY_TOKEN` (obbl., Vinted) · `CARDTRADER_TOKEN` (obbl., riferimento) ·
`GEMINI_API_KEY` (scoring) · `TIMEZONE` (opz., default Europe/Rome) · `FINESTRA_DEFAULT`
(opz.: mattina|pomeriggio|sera) · `LINGUA_ANAGRAFICA` (opz.) · (futuro: `TCGAPI_KEY`).

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

## ✅ Stato
Rebrand del codice completato (backend + web). Da fare per andare in produzione:
creare/recuperare i token (Supabase, Telegram, Apify, CardTrader, Gemini), eseguire
`schema.sql`, popolare l'anagrafica (`card_database.py`), configurare i Secret GitHub,
deployare `web/` su Vercel. **Test costo Apify reale** al primo run (confermare le stime).

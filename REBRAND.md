# One Piece Card Tracker — Specifica di progetto (REBRAND)

> **Punto di partenza:** questo progetto RIUSA l'infrastruttura di **Redictra** (bot
> Telegram + Supabase + GitHub Actions + Apify + Vercel), ma è un **PRODOTTO DIVERSO**.
> Vedi la sezione "Cosa cambia rispetto a Redictra". Il vecchio `CLAUDE.md` (Redictra)
> resta come riferimento tecnico dell'infra; questo file è la NUOVA specifica.
>
> **Questo documento è pensato per ripartire da chat pulita.** Contiene tutto: cosa
> costruire, fonti dati, costi verificati, repo da usare, schema DB, file, flusso.

---

## 🎯 Cos'è

Un **assistente personale per collezionisti di One Piece TCG**. Monitora automaticamente
il mercato delle carte 24/7, confronta i prezzi tra più marketplace, e **avvisa
l'utente su Telegram quando compare un affare reale** su una delle carte che segue.

**La promessa:** invece di aprire ogni giorno Cardmarket, CardTrader e Vinted a cercare
manualmente un affare, è il sistema che fa il lavoro e ti avvisa quando una carta della
tua watchlist viene messa in vendita a un prezzo conveniente.

**Uso:** PERSONALE (per il developer stesso). Non multi-utente, non un SaaS. Niente
onboarding a invito, niente scala. Una watchlist, notifiche a te.

---

## 🧠 Il modello (il cuore di tutto)

Il sistema fa **due cose diverse** con due tipi di fonte diversi. Questa distinzione è
la chiave di tutto il progetto:

| Tipo di fonte | Esempi | Ruolo | Cosa fa |
|---|---|---|---|
| **PREZZO DI RIFERIMENTO** | CardTrader, (Cardmarket) | *"quanto vale davvero"* | valore di mercato stabile, cambia lento (~1×/settimana) |
| **CACCIA AGLI AFFARI** | **Vinted** | *"dove lo trovo sottocosto"* | annunci di privati, dinamici, spariscono in fretta |

**Il Deal Finder** confronta: `prezzo Vinted` vs `prezzo di riferimento` → se Vinted è
sotto la soglia/percentuale impostata dall'utente → **notifica Telegram**.

Esempio:
```
🚨 Affare trovato!
Shanks Manga OP01-120
Riferimento (CardTrader): 48€
Vinted: 39€  →  risparmio 9€ (-19%)
⭐⭐⭐⭐⭐  (near mint, da Italia, venditore affidabile)
👉 [Apri annuncio Vinted]
```

**Regola d'oro dei costi:** i **riferimenti** cambiano lento → li leggi di rado (gratis).
Solo **Vinted** va letto spesso (ogni ora, in finestra oraria) → è l'unico costo, ed è minimo.

---

## 📡 Fonti dati — cosa usare, costo, frequenza (TUTTO VERIFICATO)

| # | Fonte | Cosa fornisce | Accesso | Costo | Frequenza |
|---|---|---|---|---|---|
| 1 | **punk-records** (GitHub) | **Anagrafica carte**: TUTTE (OP/EB/ST/P/promo), nome, codice, rarità, colore, tipo, immagini, tutte le lingue | file JSON `raw.githubusercontent.com` | **€0** | settimanale |
| 2 | **CardTrader API** | **Prezzo riferimento** + listings reali, `country_code` venditore, ponte `card_market_ids`/`tcg_player_id` | REST + Bearer token (dal profilo) | **€0** | 1×/giorno |
| 3 | **Vinted** (via Apify) | **Caccia affari**: annunci privati, prezzo, condizione, venditore, Paese, `item_id`, URL | Apify actor **Smart Scraper** (kazkn) | **~€0** (dentro free tier) | **ogni ora, finestra 6h** |
| 4 | **Gemini** (`gemini-2.5-flash`) | **Scoring a stelle** affari (sconto + condizione + Paese + affidabilità venditore) | `google-genai`, free tier | **€0** | on-demand |
| 5 | **Cardmarket** | 2° prezzo riferimento (EU) | **RIMANDATO** — schema già pronto | €0 ora | (futuro, 1×/settimana) |
| 6 | **TCG API** (`tcgapi.dev`) | 2° riferimento opzionale (prezzi TCGPlayer, storico) | REST + API key, free 100 req/giorno | €0 | (opzionale) |

### ⚠️ Verità sulle fonti (imparate durante la ricerca — NON reimparare)
- **Cardmarket API ufficiale = INACCESSIBILE.** Chiusa a nuove domande, solo venditori
  pro, OAuth 1.0 HMAC-SHA1. → si può fare SOLO via Apify scraping, e per ora si RIMANDA.
- **Vinted NON ha API pubblica usabile.** Endpoint interno `/api/v2/catalog/items`
  protetto da **Datadome** (anti-bot): 403 dopo 1-2 richieste da IP cloud. Lo scraping
  "gratis fai-da-te" (Giglium/vinted_scraper) si fa bannare su GitHub Actions. → serve
  Apify (IP residenziali loro). Non esiste la scorciatoia gratis stabile.
- **CardTrader = l'unica API ufficiale pulita.** Bearer token, REST semplice, gratis.

---

## 💰 Costi — CONFIG FISSATA (Apify, solo free tier, €0 di tasca)

**Vincolo assoluto:** usare SOLO i **$5/mese gratis** che Apify regala (ricorrenti,
si rinnovano ogni mese). **Mai pagare di tasca.** Deve coprire TUTTO il mese senza bucarsi.

### La config scelta (VINTED via Apify)
```
Carte monitorate:     3
Risultati per carta:  1   (order=newest_first → l'annuncio più recente in target)
Finestra oraria:      6 ore/giorno  (l'utente sceglie quale, es. 06:00–12:00 o 18:00–24:00)
Frequenza:            ogni ora (dentro la finestra) → 6 run/giorno
Strategia:            1 run BATCH (3 carte insieme in un solo avvio), non 1 run/carta
```

### Il conto (VERIFICATO alla fonte Apify)
Actor **Smart Scraper** (kazkn): **avvio $0.020/run** + **$0.002/risultato**.
```
Run/mese:   6/giorno × 30 = 180
Avvii:      180 × $0.020 = $3.60   (SEMPRE pieni: si paga anche se 0 risultati)
Risultati:  3 carte × 1 × 180 = 540 × $0.002 = $1.08   (solo sui risultati veri)
LORDO:      $4.68/mese  →  dentro i $5 gratis  →  SPESA REALE €0  ✅
Autonomia:  ~$0.156/giorno → i $5 coprono ~32 giorni → COPRE TUTTO IL MESE ✅
```

### Regole di costo apprese (NON reimparare — sono la matematica del budget)
1. **Apify paga in 2 voci:** `avvio ($0.02/run) + risultati ($0.002/ciascuno)`.
2. **L'AVVIO è il killer del budget**, non i risultati. Ogni run costa $0.02 SOLO per
   accendersi. "Ogni ora su 24h" = 720 avvii = $14.40 → esplode. La **finestra 6h**
   taglia a 180 avvii = $3.60.
3. **Un controllo a vuoto (0 risultati) paga comunque l'avvio** ($0.02), ma NON i
   risultati ($0). Per carte di nicchia molte ricerche tornano 0-1 → costo reale basso.
4. **Batch obbligatorio:** tutte le carte in 1 run (Apify accetta più URL per run) →
   1 solo avvio per giro, non 1 per carta.
5. **NON progettare per finire i crediti prima del mese.** Se si bucano gli ultimi
   giorni il bot si ferma proprio quando può passare l'affare. Dimensionare per COPRIRE
   tutto il mese con margine (per questo 1 risultato invece di 2 a finestra 6h).
6. **Filtri nell'URL Vinted** (`price_to`, `market`, `order=newest_first`): Vinted
   restituisce già solo il filtrato → non paghi risultati fuori prezzo/Paese.

### ALTERNATIVA se un giorno servono PIÙ carte o controllo più frequente
**ScrapeBadger** (PAYG, $0.15/1000 crediti, 5 crediti/richiesta = $0.00075/ricerca).
Paga **per RICHIESTA, non per risultato → nessun costo di avvio.** Struttura ideale per
monitoraggio ripetuto: 3 carte ogni ora 24h = ~$1.62/mese; 20 carte ogni ora 6h =
~$2.70/mese. NON è gratis (prepagato) ma scala molto meglio. **Migrazione = cambiare
solo il modulo `vinted_source.py`, zero altro.** Free tier 1000 crediti una tantum.

---

## 🕕 Finestra oraria (ottimizzazione chiave — scelta dall'utente)

L'utente sceglie una **finestra attiva di 6 ore** (via web app / config). Il cron gira
comunque, ma **all'inizio di ogni run controlla: "siamo nella finestra?"** Se no → esce
subito, **zero costo** (nessuna chiamata Apify). Motivo: se dormi non compri l'affare →
scrapare di notte è denaro sprecato + taglia gli avvii da 720 a 180/mese.

**Preset consigliati (a bottoni, come i fusi di Redictra):**
```
🌅 Mattina  (06:00 – 12:00)
🌙 Sera     (18:00 – 24:00)   ← spesso la migliore (annunci serali, sei sveglio)
🔆 Pomeriggio (12:00 – 18:00)
```
La finestra è modificabile da web app (o da config per l'MVP), mai da codice.

---

## 📦 Repo GitHub da usare (VERDETTO per ciascuno)

| Repo | Uso | Come |
|---|---|---|
| **`buhbbl/punk-records`** | ✅ **USARE come DATO** | Anagrafica carte. Scarica il JSON raw da GitHub. Zero API, €0. È un dataset statico versionato (tutte le carte, tutte le lingue, immagini). Licenza AGPL-3.0 sul codice; immagini © Bandai (ok uso personale). |
| **`Fuyucch1/Vinted-Notifications`** | 📖 **Riferimento LOGICA** | Monitor Vinted→Telegram già funzionante. Studiare: come costruisce gli URL di ricerca Vinted con filtri, come fa dedup dei "nuovi", struttura notifiche. NON forkare. |
| **`JakobAIOdev/Vintrack-Vinted-Monitor`** | 📖 **Riferimento avanzato** | Come costruisce filtri URL Vinted + logica dedup. NON forkare: è always-on (Go+Redis+Docker), filosofia opposta al cron leggero. Prendere le idee. |
| **`michalito/cardtrader-exporter`** | 📖 **Riferimento API** | Esempio pratico di come chiamare gli endpoint CardTrader (games/expansions/blueprints). |
| **`Coko7/vegapull`** | ⏸️ Non serve | Genera punk-records dal sito ufficiale. Usiamo direttamente il JSON già pronto. |
| **`Razikus/supabase-nextjs-template`** | ✅ **Base WEB APP** | Template Next.js 15 + Supabase + auth + RLS + Tailwind. Base per la dashboard su Vercel. |
| **Codice Redictra** (questo repo) | ✅ **Base BACKEND** | Riusa l'ossatura: `config.py`, `db.py`, cron GitHub Actions, `telegram_delivery.py`, webhook Vercel, struttura Apify. |

---

## 🌐 CardTrader — mappatura codice carta → prezzo (VERIFICATA)

Percorso confermato dall'API (necessario per il confronto prezzi):
```
GET /games            → trova game_id di One Piece (1 volta)
GET /expansions       → trova expansion_id per ogni set (OP01, EB01, ST01...)
GET /blueprints/export?expansion_id=X
     → tutte le carte del set, con: image_url, card_market_ids, tcg_player_id
       (il blueprint_id è la chiave per interrogare i prezzi)
GET /marketplace/products?blueprint_id=Y
     → prezzi reali: price.cents, condizione, lingua, foil,
       user.country_code (← filtro Italia/Europa!), quantità
```
- **`card_market_ids` / `tcg_player_id` nel blueprint = ponte tra le fonti** (stessa
  carta agganciabile su Cardmarket/TCGPlayer quando serviranno).
- **`user.country_code` = filtro Italia/Europa nativo** nei risultati.
- Auth: `Authorization: Bearer <token>` (dal profilo CardTrader). Rate limit: 10 req/s
  sul marketplace, 200 req/10s globale. Nessun wrapper Python pronto → scriverlo (~50 righe).

---

## 🗄️ Schema DB (Supabase / PostgreSQL) — bozza

- **`carte`** — anagrafica da punk-records: `codice` (PK, es. OP01-120), `nome`, `set`,
  `rarita`, `colore`, `tipo`, `lingua`, `immagine_url`, `cardtrader_blueprint_id`,
  `cardmarket_id` (per il futuro), `updated_at`.
- **`watchlist`** — carte monitorate: `codice` (FK), `attiva` (bool), `priorita`
  (vip/normale/bassa), `regola_tipo` (prezzo_max | perc_sconto | ogni_annuncio),
  `regola_valore` (es. 40.0 o 30.0), `paese` (it | eu), `created_at`.
- **`prezzi_riferimento`** — per carta e fonte: `codice` (FK), `fonte`
  (cardtrader | cardmarket | tcgapi), `prezzo`, `valuta`, `timestamp`. (= storico prezzi)
- **`annunci_visti`** — dedup: `item_id` Vinted (PK), `codice`, `visto_at`. Evita di
  ri-notificare lo stesso annuncio ("solo nuovi").
- **`affari`** — affari trovati: `id`, `codice`, `prezzo_vinted`, `prezzo_riferimento`,
  `sconto_perc`, `score_stelle`, `url_annuncio`, `condizione`, `paese`, `timestamp`.
- **`config`** — impostazioni globali: `finestra_ora_inizio`, `finestra_ora_fine`,
  `frequenza_min`, ecc. (per l'MVP anche solo in `config.py`).

RLS on, service_role only (come Redictra).

---

## 📁 File del progetto

**Backend (Python, riusa struttura Redictra):**
| File | Cosa fa |
|---|---|
| `config.py` | Env + parametri costo Apify + finestra oraria + soglie + fonti. Punto unico config. |
| `card_database.py` | Scarica punk-records (JSON raw) → sincronizza anagrafica su Supabase. Girato dalla GitHub Action settimanale. Rileva set nuovi automaticamente. |
| `cardtrader.py` | Wrapper CardTrader (~50 righe): games→expansions→blueprints→prezzi. Mappa codice→blueprint_id. Restituisce prezzo riferimento + `country_code`. |
| `vinted_source.py` | Costruisce URL ricerca Vinted con filtri (prezzo max, market, newest) → chiama Apify (Smart Scraper, batch) → ritorna annunci. **Unico punto da cambiare per migrare a ScrapeBadger.** |
| `deal_finder.py` | **Il cuore.** Confronta prezzo Vinted vs riferimento → applica regola utente (prezzo_max / perc_sconto / ogni_annuncio) → decide se è affare. |
| `scorer.py` | Gemini: scoring a stelle dei candidati (sconto + condizione + Paese + affidabilità venditore). Degrada con grazia se l'AI fallisce. |
| `db.py` | Supabase: carte, watchlist, prezzi/storico, dedup `annunci_visti`, affari, config. |
| `notifier.py` | Invio notifiche Telegram (formato affare con link). Import `telegram` lazy (come Redictra, per il webhook Vercel). |
| `main.py` | **Cron.** All'avvio: siamo in finestra? → sì: leggi watchlist attive → fetch Vinted (batch) → dedup → deal_finder → scorer → notifier. try-except per carta. Se niente in target → nessuna notifica (zero rumore). |
| `schema.sql` | Tabelle Supabase + RLS deny-all. |
| `.github/workflows/` | 2 cron: (a) Vinted ogni ora `0 * * * *` (main.py filtra la finestra); (b) anagrafica settimanale `card_database.py`. Secret: APIFY_TOKEN, SUPABASE_*, TELEGRAM_*, GEMINI_API_KEY, CARDTRADER_TOKEN. |
| `requirements.txt` | supabase, google-genai, python-telegram-bot, requests, tzdata, python-dotenv. |

**Web app (Next.js su Vercel, base Razikus template):**
| Dir | Cosa fa |
|---|---|
| `web/` | **Dashboard**: watchlist (aggiungi/togli carte, toggle attiva, priorità, regola prezzo, Paese, finestra oraria), storico prezzi (grafici), ultimi affari trovati, storico notifiche, ricerca carte (nome/codice/set/rarità/colore/lingua). Legge/scrive Supabase. |

---

## 🔄 Flusso del cron (ogni ora, dentro la finestra)

```
1. main.py: siamo nella finestra oraria attiva?  NO → esci (0 costo). SÌ → continua.
2. leggi da DB le carte watchlist ATTIVE (con la loro priorità/regola/paese).
3. per ogni carta → costruisci URL Vinted (search_text, price_to, market, newest_first, max_results=1).
4. Apify: 1 RUN BATCH con tutti gli URL → ritorna annunci.
5. dedup: scarta gli item_id già in `annunci_visti`.
6. per ogni annuncio nuovo → deal_finder: confronta col prezzo_riferimento (CardTrader).
      passa la regola utente (prezzo_max / perc_sconto / ogni_annuncio)?
7. se sì → scorer (Gemini): assegna ⭐ in base a sconto+condizione+paese+venditore.
8. notifier: manda su Telegram gli affari (ordinati per stelle, con link).
9. salva in `affari` + aggiorna `annunci_visti`.
      → se niente in target: NESSUNA notifica (zero rumore).
Separatamente (1×/giorno): aggiorna `prezzi_riferimento` da CardTrader.
Separatamente (settimanale): card_database.py sincronizza anagrafica da punk-records.
```

---

## 🔀 Cosa cambia rispetto a Redictra (questi file SOVRASCRIVONO l'eredità)

- **Prodotto:** da "bot segnali di mercato AI da Reddit" → "tracker prezzi carte One Piece
  con alert affari da Vinted".
- **Fonte dati:** da Reddit (Apify/RSS) → **CardTrader API (riferimento) + Vinted (Apify,
  affari) + punk-records (anagrafica)**.
- **AI:** da "digest madre Gemini" (1 chiamata/giorno) → **Gemini scoring affari** (on-demand,
  stesso free tier).
- **Output:** da "brief giornaliero" → **alert affare** (quando compare, non a orario fisso).
- **Interfaccia:** da "solo bot Telegram" → **web app dashboard (Vercel) + Telegram solo
  canale notifiche**.
- **Utenti:** da multi-utente invite-only → **PERSONALE** (una watchlist, niente onboarding).
- **Trigger:** da "06:00 locale" → **finestra oraria 6h + controllo orario** (Vinted).
- **RIMOSSO:** argomenti fissi, digest madre condiviso, accesso a invito, timezone
  multi-utente, RSS Reddit.
- **AGGIUNTO:** watchlist carte + regole prezzo, deal_finder (confronto cross-marketplace),
  dedup annunci, finestra oraria, anagrafica auto da punk-records, dashboard web.

---

## 🔐 Variabili d'ambiente

`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (obbl., **service_role** non anon) ·
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (il tuo, per notifiche personali) ·
`APIFY_TOKEN` (obbl., per Vinted) · `CARDTRADER_TOKEN` (obbl., prezzo riferimento) ·
`GEMINI_API_KEY` (per lo scoring) · (futuro: `TCGAPI_KEY`).

---

## ⚠️ Principi non negoziabili

1. **Uso personale, basso volume.** 1 utente, watchlist piccola (3 carte). Non commerciale.
2. **Non ripubblicare contenuto verbatim.** Le notifiche linkano l'annuncio originale;
   lo scoring è analisi derivata, non copia di testi altrui.
3. **Vinted ToS:** lo scraping viola i ToS Vinted → tenerlo LEGGERO (poche carte, finestra
   ridotta) e via Apify (loro gestiscono IP/anti-bot). Rischio basso a questa scala.
4. **Budget €0:** solo free tier Apify ($5/mese ricorrenti). Config dimensionata per NON
   sforare mai (vedi sezione Costi). Se serve crescere → ScrapeBadger PAYG.
5. **Stateless sui grezzi non utili:** si conservano anagrafica, prezzi/storico, affari,
   dedup. Non si accumulano dati inutili.

---

## 🛠️ Stack tecnico

Python · Supabase (PostgreSQL, service role) · `google-genai` (Gemini `gemini-2.5-flash`)
· python-telegram-bot · **Apify** (Vinted, actor Smart Scraper kazkn) · **CardTrader API**
· **punk-records** (dataset carte) · GitHub Actions (cron) · **Next.js + Vercel** (web app).

---

## 🔜 Primi passi (ordine operativo, da chat pulita)

1. **Token & account:** creare/recuperare → Supabase, Telegram bot (BotFather), Apify
   (per il token + verificare free tier), CardTrader (token dal profilo), Gemini API key.
2. **Test costo Apify REALE:** 1 run del Smart Scraper con 3 URL Vinted → leggere sulla
   dashboard Apify il costo esatto di quel run (avvio + risultati). Confermare le stime.
3. **Anagrafica:** `card_database.py` → scaricare punk-records, popolare tabella `carte`.
4. **CardTrader:** `cardtrader.py` → mappare i codici carta della watchlist ai blueprint_id,
   testare il recupero prezzo riferimento.
5. **Vinted:** `vinted_source.py` → costruire URL con filtri, testare fetch batch via Apify.
6. **Deal Finder + Scorer + Notifier:** collegare confronto → regola → Gemini → Telegram.
7. **Cron:** `main.py` + GitHub Actions con finestra oraria 6h.
8. **Web app:** dashboard su Vercel (Razikus template) per gestire watchlist/regole/finestra.

---

## 📌 Config finale (riepilogo numerico)

```
Vinted:        3 carte · 1 risultato/carta (newest_first) · finestra 6h · ogni ora
               → Apify Smart Scraper, 1 run batch · lordo ~$4.68/mese · dentro i $5 free · €0 reali
Riferimento:   CardTrader API (gratis, 1×/giorno) · [Cardmarket futuro, 1×/settimana]
Anagrafica:    punk-records (gratis, settimanale)
Scoring:       Gemini free tier (gratis)
Infra:         Supabase + GitHub Actions + Vercel + Telegram → tutto free tier · €0
TOTALE:        €0/mese (dentro tutti i free tier)
```

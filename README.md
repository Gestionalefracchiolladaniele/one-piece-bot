# Claupiece 🏴‍☠️

**Un tracker personale di prezzi per carte One Piece TCG.** Monitora Vinted 24/7,
lo confronta col prezzo di riferimento CardTrader e **ti avvisa su Telegram quando
compare un affare reale** su una carta della tua watchlist.

> Invece di aprire ogni giorno Cardmarket/CardTrader/Vinted a cercare a mano, è il
> sistema che fa il lavoro e ti scrive quando c'è da comprare.

Uso **personale** (una watchlist, notifiche a te). Non multi-utente, non un SaaS.

---

## Come funziona (in breve)

1. Aggiungi carte alla **watchlist** dalla dashboard web, con una **regola** (prezzo
   max, % sconto, o ogni annuncio) e il Paese (IT/EU).
2. Il cron (GitHub Actions) gira ogni ora ma lavora **solo dentro la finestra oraria**
   che scegli (6h) → fuori finestra esce subito, zero costi.
3. Dentro la finestra: legge Vinted (via Apify), scarta gli annunci già visti,
   confronta col **riferimento CardTrader**, applica la regola, dà un voto ⭐ (Gemini)
   e ti manda gli affari su **Telegram** (ordinati per stelle).

## Perché costa €0
I **riferimenti** cambiano lento → letti 1×/giorno (gratis). Solo **Vinted** va letto
spesso, ma dentro una finestra 6h e in **1 run batch** (tutte le carte insieme) →
lordo ~$4.68/mese, dentro i **$5 gratis** ricorrenti di Apify. Vedi `REBRAND.md`.

## Stack
Python · Supabase (service role) · Apify (Vinted, actor Smart Scraper) · CardTrader
API (riferimento) · punk-records (anagrafica carte) · Gemini (`gemini-2.5-flash`,
scoring) · python-telegram-bot · GitHub Actions (cron) · **Next.js + Vercel** (web).

---

## Setup rapido (vedi SETUP_TODO.md per i dettagli)

1. **Credenziali** (in `.env` locale o nei Secret di GitHub):
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — dal progetto Supabase (service role!).
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — da @BotFather + il tuo chat id.
   - `APIFY_TOKEN` — da Apify (per leggere Vinted).
   - `CARDTRADER_TOKEN` — dal profilo CardTrader (prezzo di riferimento).
   - `GEMINI_API_KEY` — da Google AI Studio (scoring a stelle).
2. **Database**: esegui `schema.sql` nell'SQL Editor di Supabase (6 tabelle + RLS).
3. **Dipendenze backend**: `pip install -r requirements.txt`.
4. **Anagrafica carte**: `python card_database.py` (scarica punk-records → `carte`).
   In produzione gira settimanale via `.github/workflows/card_sync.yml`.
5. **Caccia affari**: `.github/workflows/cron_runner.yml` gira ogni ora; imposta gli
   stessi Secret nel repository. Localmente: `python main.py`.
6. **Dashboard web** (`web/`): `cd web && pnpm install && pnpm dev` (deploy su Vercel).

## File del backend
- `config.py` — env + parametri costo Apify + finestra oraria + regole. Punto unico.
- `card_database.py` — sync anagrafica da punk-records → Supabase.
- `cardtrader.py` — wrapper CardTrader: codice → blueprint → prezzo di riferimento.
- `vinted_source.py` — URL Vinted con filtri → Apify (batch) → annunci. **Unico punto
  da cambiare per migrare a ScrapeBadger.**
- `deal_finder.py` — confronto Vinted vs riferimento + regola → è un affare?
- `scorer.py` — Gemini: voto ⭐ agli affari (degrada a euristica se l'AI fallisce).
- `notifier.py` — invio notifiche Telegram (formato affare con link).
- `main.py` — cron: finestra → Vinted → dedup → deal → score → notifica.
- `schema.sql` — 6 tabelle Supabase + RLS deny-all.

## Web app (`web/`)
Dashboard Next.js: watchlist (aggiungi/togli carte, regola prezzo, Paese, priorità,
finestra oraria) + ultimi affari. Sfondo **aurora viola** (riadattato da LinkedinGoat),
**card e bottoni bianchi** per l'uso, font ottimizzati (next/font). Legge/scrive
Supabase via API route server (service role).

## Note legali (sintesi)
Uso personale, basso volume. Le notifiche **linkano** l'annuncio originale; lo scoring
è analisi derivata (non copia). Lo scraping Vinted viola i ToS → tenuto **leggero**
(poche carte, finestra ridotta) e via Apify. Rischio basso a questa scala. **Non è
consulenza legale.**

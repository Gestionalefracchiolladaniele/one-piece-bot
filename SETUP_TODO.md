# SETUP_TODO — Claupiece

Azioni umane residue per portare Claupiece dal codice (già scritto) al funzionamento.
Spuntare man mano. Le voci **DA CONFERMARE** sono scelte ragionevoli da validare.

---

## 1. Credenziali (segreti)
Metterle in `.env` (locale) e/o nei **Secret** del repo GitHub (Actions). Mai committarle.

- [ ] `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API.
      **Service role** (non l'anon): bypassa RLS, è un segreto del backend.
- [ ] `TELEGRAM_BOT_TOKEN` — @BotFather → `/newbot` → copia il token.
- [ ] `TELEGRAM_CHAT_ID` — il TUO chat id (dove arrivano gli alert). Puoi ottenerlo
      scrivendo al bot e leggendo `getUpdates`, o con @userinfobot.
- [ ] `APIFY_TOKEN` — Apify → Settings → Integrations → API token. Free tier $5/mese.
- [ ] `CARDTRADER_TOKEN` — **OPZIONALE**: l'API CardTrader va abilitata dal supporto
      (email support@cardtrader.com). Se non ce l'hai, il riferimento arriva da
      **Cardmarket via Apify** (stesso `APIFY_TOKEN`, refresh settimanale). Se manca
      anche quello, usi solo la regola `prezzo_max` (tetto in €).
- [ ] `GEMINI_API_KEY` — Google AI Studio → "Get API key". Free tier sufficiente.
- [ ] (opz.) `TIMEZONE` (default `Europe/Rome`), `FINESTRA_INIZIO`/`FINESTRA_FINE`
      (orari di default, es. 18 e 24), `WEB_APP_URL` (per il comando /app del bot).

### Web (Vercel)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client, pubblici),
      `SUPABASE_SERVICE_ROLE_KEY` (solo server).

## 2. Database
- [ ] Eseguire `schema.sql` nell'SQL Editor di Supabase (crea le 6 tabelle: carte,
      watchlist, prezzi_riferimento, annunci_visti, affari, config; RLS deny-all).

## 3. Dipendenze
- [ ] Backend: `pip install -r requirements.txt` (Python 3.11+).
- [ ] Web: `cd web && pnpm install`.

## 4. Anagrafica carte
- [ ] `python card_database.py` → scarica punk-records e popola `carte`. In produzione
      gira settimanale via `.github/workflows/card_sync.yml`.
- [ ] **DA CONFERMARE**: la struttura del JSON punk-records (`card_database._url_carte`
      / `_normalizza`) è difensiva ma va verificata al primo run reale — se il layout
      del repo è diverso, aggiustare l'URL/i nomi-chiave (log soft, non crasha).

## 5. Avvio / cron
- [ ] **Caccia affari** (`main.py` via GitHub Actions `cron_runner.yml`): impostare gli
      stessi Secret nel repo. Gira ogni ora ma lavora solo dentro la finestra oraria.
- [ ] **Dashboard web**: deploy `web/` su Vercel (framework Next.js), env come sopra.
- [ ] **Bot comandi** (opz., `bot_handler.py` in polling): always-on per usare /app,
      /affari, /watchlist, /finestra, /prezzo, /pausa, /riprendi. Incolla la lista
      comandi in BotFather (`/setcommands`) — vedi `COMANDI_BOT.md`.

## 6. Da testare insieme (end-to-end)
- [ ] Dalla dashboard: aggiungi 1-3 carte alla watchlist, imposta regola + Paese +
      finestra oraria.
- [ ] `python main.py` DENTRO la finestra → deve leggere Vinted, confrontare, e (se c'è
      un affare) mandare la notifica su Telegram + salvarlo in `affari`.
- [ ] `python main.py` FUORI dalla finestra → deve uscire subito ("fuori dalla finestra").
- [ ] **Test costo Apify REALE**: 1 run con 3 URL Vinted → leggere sulla dashboard Apify
      il costo esatto (avvio + risultati) e confermare le stime (~$4.68/mese).
- [ ] CardTrader: verificare che `cardtrader.prezzo_riferimento(codice)` risolva il
      blueprint e torni un prezzo per una carta nota (es. OP01-120).

## 7. DA CONFERMARE (scelte di default, non bloccanti)
- [ ] **Actor Apify Vinted** (`config.APIFY_VINTED_ACTOR = kazkn/smart-scraper`) e i
      nomi dei parametri di input (`startUrls`, `maxItems`) e di output (`vinted_source
      ._normalizza`) — verificare sullo schema reale dell'actor al primo run.
- [ ] **URL di ricerca Vinted** (`vinted_source.costruisci_url`): i parametri
      `search_text`, `price_to`, `order` sono quelli pubblici; confermare che l'actor
      li onori (Vinted filtra lato server → meno risultati pagati).
- [ ] **ID modello Gemini**: `gemini-2.5-flash` con fallback `-flash-lite`.
- [ ] **Cardmarket via Apify** (`cardmarket_source.py`): l'URL di ricerca
      (`CARDMARKET_BASE`) e l'estrazione prezzo (`_estrai_prezzo`) sono difensivi ma
      da verificare al primo run settimanale (il layout Cardmarket può variare). Se
      l'estrazione torna vuota, aggiustare il regex/campi (log soft, non crasha).

## 8. Note operative
- Il cron fuori finestra esce in pochi secondi → costo Actions trascurabile.
- I riferimenti CardTrader si aggiornano 1×/giorno (segnato in `config.ultimo_refresh_
  riferimenti`). Per forzare: azzerare quel campo nella tabella `config`.
- Migrazione futura a più carte / più frequenza → ScrapeBadger: cambiare SOLO
  `vinted_source.py` (vedi `REBRAND.md`).

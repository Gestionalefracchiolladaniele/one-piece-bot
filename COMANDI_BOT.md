# Comandi Telegram — Claupiece

Il bot è **personale** (solo tu, via `TELEGRAM_CHAT_ID`): manda gli alert affare e
offre qualche comando "telecomando" per consultare al volo dal telefono. La gestione
completa (aggiungere/togliere carte) resta sulla **web app**.

## Lista da incollare in BotFather

Scrivi a **@BotFather** → `/setcommands` → scegli il bot → incolla questo blocco:

```
app - Apri la dashboard web
affari - Ultimi affari trovati
watchlist - Le carte che segui
finestra - Vedi e cambia la finestra oraria
prezzo - Prezzo di riferimento di una carta (es. /prezzo OP01-120)
pausa - Sospendi le notifiche
riprendi - Riattiva le notifiche
help - Lista comandi
```

## Cosa fa ogni comando
- **/app** — bottone che apre la dashboard (serve `WEB_APP_URL` in env).
- **/affari** — ultimi 5 affari, con ⭐ e **link cliccabile** che apre direttamente
  l'annuncio su Vinted.
- **/watchlist** — le carte seguite con la regola attiva (≤ prezzo / ≥ % sconto / ogni
  annuncio) e il Paese.
- **/finestra** — mostra la finestra oraria attiva e la cambia con bottoni rapidi
  (6–12, 12–18, 18–24, 7–13, 13–19, 20–2). Per orari 100% personalizzati → web app.
- **/prezzo `CODICE`** — prezzo di riferimento CardTrader (dalla cache, o live).
- **/pausa** / **/riprendi** — sospende/riattiva le notifiche (il cron esce a vuoto
  finché è in pausa, zero costi).
- **/help** (anche **/start**) — la lista qui sopra.

## Avvio del bot
Il bot di consultazione gira in **polling**: `python bot_handler.py` (always-on:
piccolo VPS/PaaS o locale per i test). È un processo distinto dal cron degli affari
(`main.py`): parlano solo via Supabase, quindi possono girare separati.

> Le **notifiche** degli affari le manda il cron (`main.py` → `notifier.py`), non serve
> che il bot in polling sia acceso per riceverle — ma serve per usare i comandi.

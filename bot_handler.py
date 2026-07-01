# -*- coding: utf-8 -*-
"""
Claupiece — Bot Telegram di CONSULTAZIONE (polling).

Il bot è personale: manda gli alert affare (via main.py/notifier.py) e offre qualche
comando "telecomando" per consultare al volo dal telefono senza aprire la web app.

Comandi:
  /app        → link per aprire la dashboard web
  /affari     → ultimi affari trovati (con link cliccabile all'annuncio Vinted)
  /watchlist  → le carte che segui + la regola attiva
  /finestra   → mostra la finestra oraria e permette di modificarla (orari liberi)
  /pausa      → sospende le notifiche
  /riprendi   → riattiva le notifiche
  /prezzo <codice> → prezzo di riferimento CardTrader di una carta (es. /prezzo OP01-120)
  /help       → questa lista

Gira always-on in polling (VPS/PaaS piccolo, o locale per i test). NB: non serve al
cron degli affari (main.py) — sono processi distinti che parlano solo via Supabase.
Esecuzione: `python bot_handler.py`
"""

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
)

import config
import db
import scorer


# Solo il proprietario (TELEGRAM_CHAT_ID) può usare il bot: è personale.
def _autorizzato(update: Update) -> bool:
    if config.manca(config.TELEGRAM_CHAT_ID):
        return True  # in setup, prima di configurare il chat id, lascia passare
    return str(update.effective_chat.id) == str(config.TELEGRAM_CHAT_ID)


# ============================================================================
# /help
# ============================================================================
TESTO_HELP = (
    "🏴‍☠️ *Claupiece* — comandi:\n\n"
    "/app — apri la dashboard\n"
    "/affari — ultimi affari trovati\n"
    "/watchlist — le carte che segui\n"
    "/finestra — finestra oraria (modificabile)\n"
    "/prezzo `CODICE` — prezzo di riferimento (es. /prezzo OP01-120)\n"
    "/pausa — sospendi le notifiche\n"
    "/riprendi — riattiva le notifiche\n"
    "/help — questa lista"
)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    await update.message.reply_text(TESTO_HELP, parse_mode=ParseMode.MARKDOWN)


# ============================================================================
# /app — link alla dashboard
# ============================================================================
async def cmd_app(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    if not config.WEB_APP_URL:
        await update.message.reply_text(
            "La dashboard non ha ancora un URL configurato (imposta WEB_APP_URL)."
        )
        return
    kb = InlineKeyboardMarkup([[InlineKeyboardButton("🖥 Apri Claupiece", url=config.WEB_APP_URL)]])
    await update.message.reply_text("La tua dashboard:", reply_markup=kb)


# ============================================================================
# /affari — ultimi affari con link cliccabile
# ============================================================================
async def cmd_affari(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    try:
        affari = db.ultimi_affari(limite=5)
    except Exception as e:
        await update.message.reply_text(f"Errore nel leggere gli affari: {e}")
        return
    if not affari:
        await update.message.reply_text("Ancora nessun affare trovato. 🕵️")
        return

    righe = ["🚨 *Ultimi affari:*", ""]
    for a in affari:
        stelle = scorer.stelle_str(a.get("score_stelle") or 0)
        titolo = a.get("titolo") or a.get("codice") or "Carta"
        prezzo = a.get("prezzo_vinted")
        sconto = a.get("sconto_perc")
        info = f"{prezzo}€" if prezzo is not None else ""
        if sconto is not None:
            info += f" (-{round(sconto)}%)"
        url = a.get("url_annuncio")
        # Link cliccabile → si apre direttamente l'annuncio su Vinted.
        titolo_link = f"[{titolo}]({url})" if url else titolo
        righe.append(f"{stelle} {titolo_link} — {info}")
    await update.message.reply_text(
        "\n".join(righe), parse_mode=ParseMode.MARKDOWN, disable_web_page_preview=True,
    )


# ============================================================================
# /watchlist — carte seguite + regola
# ============================================================================
def _descrivi_regola(w: dict) -> str:
    tipo = w.get("regola_tipo")
    val = w.get("regola_valore")
    if tipo == "prezzo_max":
        return f"≤ {val}€"
    if tipo == "perc_sconto":
        return f"≥ {val}% sconto"
    return "ogni annuncio"


async def cmd_watchlist(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    try:
        wl = db.watchlist_tutta()
    except Exception as e:
        await update.message.reply_text(f"Errore nel leggere la watchlist: {e}")
        return
    if not wl:
        await update.message.reply_text("Watchlist vuota. Aggiungi carte dalla dashboard (/app).")
        return

    righe = ["👀 *Watchlist:*", ""]
    for w in wl:
        carta = db.get_carta(w["codice"]) or {}
        nome = carta.get("nome") or w["codice"]
        stato = "✅" if w.get("attiva") else "⏸"
        righe.append(f"{stato} *{nome}* ({w['codice']}) — {_descrivi_regola(w)} · {w.get('paese', 'it').upper()}")
    await update.message.reply_text("\n".join(righe), parse_mode=ParseMode.MARKDOWN)


# ============================================================================
# /finestra — mostra + modifica orari (bottoni)
# ============================================================================
def _kb_finestra() -> InlineKeyboardMarkup:
    """Scorciatoie preset + hint per orari liberi (i liberi si scelgono nella web app)."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🌅 6–12", callback_data="fin:6:12"),
            InlineKeyboardButton("🔆 12–18", callback_data="fin:12:18"),
            InlineKeyboardButton("🌙 18–24", callback_data="fin:18:24"),
        ],
        [
            InlineKeyboardButton("🕖 7–13", callback_data="fin:7:13"),
            InlineKeyboardButton("🕐 13–19", callback_data="fin:13:19"),
            InlineKeyboardButton("🌃 20–2", callback_data="fin:20:2"),
        ],
    ])


async def cmd_finestra(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    inizio, fine = db.finestra_orari()
    await update.message.reply_text(
        f"🕕 Finestra attiva: *{inizio:02d}:00 – {fine:02d}:00*.\n"
        "Scegli una nuova finestra (o usa la dashboard per orari personalizzati):",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=_kb_finestra(),
    )


async def on_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    if not _autorizzato(update):
        return
    data = query.data or ""
    if data.startswith("fin:"):
        _, i, f = data.split(":")
        db.imposta_config({"finestra_inizio": int(i), "finestra_fine": int(f)})
        await query.edit_message_text(
            f"✅ Finestra impostata: *{int(i):02d}:00 – {int(f):02d}:00*.",
            parse_mode=ParseMode.MARKDOWN,
        )


# ============================================================================
# /pausa · /riprendi
# ============================================================================
async def cmd_pausa(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    db.imposta_pausa(True)
    await update.message.reply_text("⏸️ Notifiche in pausa. Riattivale con /riprendi.")


async def cmd_riprendi(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    db.imposta_pausa(False)
    await update.message.reply_text("▶️ Notifiche riattivate. Torno a caccia di affari!")


# ============================================================================
# /prezzo <codice> — prezzo di riferimento CardTrader
# ============================================================================
async def cmd_prezzo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _autorizzato(update):
        return
    codice = (context.args[0] if context.args else "").strip().upper()
    if not codice:
        await update.message.reply_text("Uso: /prezzo CODICE — es. /prezzo OP01-120")
        return

    # Prima l'ultimo prezzo noto dal DB (istantaneo); se non c'è, interroga CardTrader.
    riga = db.ultimo_prezzo_riferimento(codice)
    carta = db.get_carta(codice) or {}
    nome = carta.get("nome") or codice
    if riga and riga.get("prezzo") is not None:
        await update.message.reply_text(
            f"💶 *{nome}* ({codice})\nRiferimento: *{riga['prezzo']}€* (CardTrader)",
            parse_mode=ParseMode.MARKDOWN,
        )
        return
    # Non in cache: prova a risolverlo live.
    await update.message.reply_text("Cerco il prezzo su CardTrader… ⏳")
    try:
        import cardtrader
        prezzo = cardtrader.prezzo_riferimento(codice)
    except Exception as e:
        await update.message.reply_text(f"Non riesco a leggere CardTrader ora: {e}")
        return
    if prezzo is None:
        await update.message.reply_text(f"Nessun prezzo di riferimento trovato per {codice}.")
        return
    db.salva_prezzo_riferimento(codice, "cardtrader", prezzo)
    await update.message.reply_text(
        f"💶 *{nome}* ({codice})\nRiferimento: *{prezzo}€* (CardTrader)",
        parse_mode=ParseMode.MARKDOWN,
    )


def main() -> None:
    if config.manca(config.TELEGRAM_BOT_TOKEN):
        raise RuntimeError("TELEGRAM_BOT_TOKEN mancante (vedi SETUP_TODO.md).")

    app = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler(["help", "start"], cmd_help))
    app.add_handler(CommandHandler("app", cmd_app))
    app.add_handler(CommandHandler("affari", cmd_affari))
    app.add_handler(CommandHandler("watchlist", cmd_watchlist))
    app.add_handler(CommandHandler("finestra", cmd_finestra))
    app.add_handler(CommandHandler("pausa", cmd_pausa))
    app.add_handler(CommandHandler("riprendi", cmd_riprendi))
    app.add_handler(CommandHandler("prezzo", cmd_prezzo))
    app.add_handler(CallbackQueryHandler(on_button))

    print("[bot] Claupiece bot in polling…")
    app.run_polling()


if __name__ == "__main__":
    # Python 3.12+ non crea più l'event loop implicito nel MainThread, mentre
    # python-telegram-bot lo assume. Lo creiamo noi prima di run_polling().
    import asyncio
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())
    main()

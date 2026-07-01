# -*- coding: utf-8 -*-
"""
Claupiece — Notifiche Telegram (canale PERSONALE).

Quando il deal_finder trova un affare (e lo scorer gli ha dato le stelle), qui lo
si formatta e lo si manda sul TUO chat Telegram (config.TELEGRAM_CHAT_ID). Non c'è
onboarding né multi-utente: un solo destinatario, tu.

`componi_affare()` è codice puro (niente Telegram) → riusabile anche altrove (es.
dashboard/preview). `invia_affare()` fa l'invio. Import di `telegram` LAZY, per
restare importabili anche dove python-telegram-bot non è installato (webhook Vercel,
se un giorno servisse).
"""

import asyncio
from typing import Optional, TYPE_CHECKING

import config
import scorer

if TYPE_CHECKING:
    from telegram import Bot

MAX_LEN_MSG = 3900


# ============================================================================
# COMPOSIZIONE (dal dict-affare → testo Telegram)
# ============================================================================
def componi_affare(affare: dict, nome_carta: str = "") -> str:
    """Formatta un affare in un messaggio Telegram (Markdown).

    Esempio dal REBRAND.md:
      🚨 Affare trovato!
      Shanks Manga OP01-120
      Riferimento (CardTrader): 48€
      Vinted: 39€ → risparmio 9€ (-19%)
      ⭐⭐⭐⭐⭐  (near mint, da Italia)
      👉 [Apri annuncio Vinted]
    """
    codice = affare.get("codice", "")
    titolo_carta = f"{nome_carta} {codice}".strip() or codice or "Carta"

    rif = affare.get("prezzo_riferimento")
    vinted = affare.get("prezzo_vinted")
    sconto = affare.get("sconto_perc")

    righe = [
        "🚨 *Affare trovato!*",
        f"*{titolo_carta}*",
    ]
    if rif is not None:
        righe.append(f"Riferimento (CardTrader): {rif:.0f}€")
    if vinted is not None and rif is not None:
        risparmio = rif - vinted
        perc = f" (-{sconto:.0f}%)" if sconto is not None else ""
        righe.append(f"Vinted: {vinted:.0f}€  →  risparmio {risparmio:.0f}€{perc}")
    elif vinted is not None:
        righe.append(f"Vinted: {vinted:.0f}€")

    stelle = scorer.stelle_str(affare.get("score_stelle", 0))
    contesto_parti = [p for p in (affare.get("condizione"), affare.get("paese")) if p]
    contesto = f"  ({', '.join(contesto_parti)})" if contesto_parti else ""
    if stelle:
        righe.append(f"{stelle}{contesto}")
    motivo = affare.get("score_motivo")
    if motivo:
        righe.append(f"_{motivo}_")

    url = affare.get("url_annuncio")
    if url:
        righe.append(f"👉 [Apri annuncio Vinted]({url})")

    return "\n".join(righe)


# ============================================================================
# INVIO
# ============================================================================
async def invia_affare(affare: dict, nome_carta: str = "",
                       bot: "Optional[Bot]" = None) -> None:
    """Manda un singolo affare sul chat personale (config.TELEGRAM_CHAT_ID)."""
    testo = componi_affare(affare, nome_carta)
    await _invia_testo(testo, bot=bot)


async def _invia_testo(testo: str, bot: "Optional[Bot]" = None) -> None:
    """Invio grezzo di un testo al chat personale. Import telegram LAZY."""
    from telegram import Bot
    from telegram.constants import ParseMode
    from telegram.error import TelegramError

    if config.manca(config.TELEGRAM_CHAT_ID):
        raise RuntimeError("TELEGRAM_CHAT_ID mancante (vedi SETUP_TODO.md).")

    proprietario = bot is None
    if bot is None:
        bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
    try:
        try:
            await bot.send_message(
                chat_id=config.TELEGRAM_CHAT_ID, text=testo[:MAX_LEN_MSG],
                parse_mode=ParseMode.MARKDOWN, disable_web_page_preview=False,
            )
        except TelegramError:
            # Fallback senza Markdown (a volte i titoli rompono il parser).
            await bot.send_message(
                chat_id=config.TELEGRAM_CHAT_ID, text=testo[:MAX_LEN_MSG],
                parse_mode=None,
            )
    finally:
        if proprietario:
            try:
                await bot.shutdown()
            except Exception:
                pass


def invia_affare_sync(*args, **kwargs) -> None:
    """Wrapper sincrono per chiamare invia_affare da codice non-async."""
    asyncio.run(invia_affare(*args, **kwargs))

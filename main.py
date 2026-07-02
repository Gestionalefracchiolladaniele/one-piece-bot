# -*- coding: utf-8 -*-
"""
Claupiece — Orchestratore del cron (GitHub Actions, ogni ora UTC).

Flusso (vedi REBRAND.md "Flusso del cron"):
  1. Siamo nella FINESTRA ORARIA attiva (ora locale)?  NO → esci (0 costo Apify).
  2. Leggi le carte watchlist ATTIVE (con regola/paese/priorità).
  3. 1×/giorno: aggiorna i prezzi di RIFERIMENTO da CardTrader (gratis, cambiano lento).
  4. Costruisci gli URL Vinted e fai UN run Apify BATCH → annunci per carta.
  5. Dedup: scarta gli item_id già visti (solo annunci NUOVI).
  6. deal_finder: confronta col riferimento e applica la regola → è un affare?
  7. scorer (Gemini): assegna ⭐ agli affari.
  8. notifier: manda gli affari su Telegram (ordinati per stelle).
  9. Salva in `affari` + marca gli item_id come visti.
     → se niente in target: NESSUNA notifica (zero rumore).

Esecuzione: `python main.py`

Uso PERSONALE: un solo destinatario (config.TELEGRAM_CHAT_ID), una watchlist.
"""

import asyncio
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from telegram import Bot

import config
import db
import cardtrader
import vinted_source
import deal_finder
import scorer
import notifier


def ora_locale() -> int:
    """Ora locale (0-23) secondo config.TIMEZONE (fallback UTC su fuso invalido)."""
    try:
        tz = ZoneInfo(config.TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        tz = timezone.utc
    return datetime.now(tz).hour


def _riferimento_gia_aggiornato_oggi() -> bool:
    """True se i riferimenti sono già stati aggiornati oggi (per farlo 1×/giorno).

    Segnato in `config.ultimo_refresh_riferimenti` (data ISO). Best-effort: su
    errore DB ritorna False (al peggio si riaggiornano — gratis).
    """
    try:
        cfg = db.get_config()
    except Exception:
        return False
    return (cfg.get("ultimo_refresh_riferimenti") or "")[:10] == datetime.now(timezone.utc).date().isoformat()


def aggiorna_riferimenti_se_serve(codici: list[str]) -> None:
    """Aggiorna i prezzi CardTrader al massimo 1×/giorno (cambiano lento → gratis).

    SOLO CardTrader (API gratuita): Cardmarket NON si tocca qui (è via Apify, costa
    l'avvio → va aggiornato SETTIMANALMENTE da refresh_riferimenti.py, mai nel loop
    orario). Se CardTrader non c'è, il loop usa l'ultimo riferimento noto (Cardmarket
    settimanale o niente → regola prezzo_max).
    """
    if not config.cardtrader_disponibile():
        print("[main] CardTrader non configurato — riferimenti dal refresh settimanale "
              "(Cardmarket) o regola prezzo_max.")
        return
    if _riferimento_gia_aggiornato_oggi():
        print("[main] riferimenti già aggiornati oggi — riuso.")
        return
    print("[main] aggiorno i prezzi di riferimento (CardTrader, 1×/giorno)…")
    try:
        cardtrader.aggiorna_riferimenti(codici)
        db.imposta_config({"ultimo_refresh_riferimenti": datetime.now(timezone.utc).date().isoformat()})
    except Exception as e:
        print(f"[main] aggiornamento riferimenti fallito ({e}) — uso ultimi noti.")


def _prepara_carte(watchlist: list[dict]) -> list[dict]:
    """Arricchisce le righe watchlist coi dati carta (nome) e il tetto prezzo Vinted."""
    preparate: list[dict] = []
    for w in watchlist:
        codice = w["codice"]
        carta = db.get_carta(codice) or {}
        # Per la ricerca Vinted usiamo un tetto prezzo se la regola è prezzo_max
        # (Vinted filtra lato server → meno risultati pagati). Per perc_sconto usiamo
        # il riferimento come tetto morbido (l'affare è sotto il riferimento).
        prezzo_max = None
        if w.get("regola_tipo") == "prezzo_max":
            prezzo_max = w.get("regola_valore")
        else:
            rif = db.ultimo_prezzo_riferimento(codice)
            if rif:
                prezzo_max = rif.get("prezzo")
        preparate.append({
            "codice": codice,
            "nome": carta.get("nome", ""),
            "paese": w.get("paese", config.VINTED_MARKET_DEFAULT),
            "prezzo_max": prezzo_max,
            # URL Vinted personalizzato (opz.): se c'è, vinted_source lo usa così com'è.
            "vinted_url": w.get("vinted_url") or "",
            "regola_tipo": w.get("regola_tipo", "perc_sconto"),
            "regola_valore": float(w.get("regola_valore") or 0),
            "priorita": w.get("priorita", "normale"),
        })
    return preparate


async def run() -> None:
    adesso = datetime.now(timezone.utc)
    ora = ora_locale()
    inizio, fine = db.finestra_orari()
    print(f"[main] run @ {adesso.isoformat()} — ora locale {ora}:00, "
          f"finestra {inizio}:00–{fine}:00.")

    # 0) Notifiche in pausa? → esci (0 costo Apify), il /pausa vale come off temporaneo.
    if db.notifiche_in_pausa():
        print("[main] notifiche in pausa — esco (0 costo).")
        return

    # 1) Finestra oraria: fuori finestra → esci subito (zero costo Apify).
    if not config.finestra_attiva(ora, inizio, fine):
        print("[main] fuori dalla finestra attiva — esco (0 costo).")
        return

    # 2) Watchlist attive.
    try:
        watchlist = db.watchlist_attiva()
    except RuntimeError as e:
        print(f"[main] DB non disponibile: {e}")
        return
    if not watchlist:
        print("[main] watchlist vuota — niente da monitorare.")
        return

    carte = _prepara_carte(watchlist)
    codici = [c["codice"] for c in carte]
    print(f"[main] {len(carte)} carte in watchlist attiva.")

    # 3) Riferimenti CardTrader (1×/giorno).
    aggiorna_riferimenti_se_serve(codici)

    # 4) Vinted (1 run Apify BATCH).
    annunci_per_carta = vinted_source.cerca_batch(carte)

    # 5-9) Per carta: dedup → deal → score → notifica → salva.
    da_notificare: list[tuple[dict, str]] = []
    for c in carte:
        codice = c["codice"]
        annunci = annunci_per_carta.get(codice, [])
        if not annunci:
            continue

        # Dedup: solo annunci NUOVI.
        nuovi = []
        for a in annunci:
            try:
                if not db.gia_visto(a["item_id"]):
                    nuovi.append(a)
            except Exception:
                nuovi.append(a)  # su errore dedup, meglio valutare che perdere l'affare
        if not nuovi:
            continue

        rif_row = db.ultimo_prezzo_riferimento(codice)
        prezzo_rif = rif_row.get("prezzo") if rif_row else None

        affari = deal_finder.trova_affari(
            codice, nuovi, c["regola_tipo"], c["regola_valore"], prezzo_rif,
        )

        # Marca visti TUTTI i nuovi annunci (anche i non-affari: non rivalutarli).
        for a in nuovi:
            try:
                db.marca_visto(a["item_id"], codice)
            except Exception:
                pass

        for affare in affari:
            try:
                affare = scorer.valuta(affare, c["nome"])
            except Exception as e:
                print(f"[main] scoring fallito per {codice}: {e}")
            try:
                db.salva_affare(affare)
            except Exception as e:
                print(f"[main] salvataggio affare fallito ({e}).")
            da_notificare.append((affare, c["nome"]))

    if not da_notificare:
        print("[main] nessun affare nuovo in questo giro — nessuna notifica (zero rumore).")
        return

    # Ordina per stelle decrescenti (i migliori prima).
    da_notificare.sort(key=lambda x: x[0].get("score_stelle", 0), reverse=True)
    print(f"[main] {len(da_notificare)} affari da notificare.")

    bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
    try:
        for affare, nome in da_notificare:
            try:
                await notifier.invia_affare(affare, nome, bot=bot)
            except Exception as e:
                print(f"[main] ERRORE notifica {affare.get('codice')}: {e}")
    finally:
        try:
            await bot.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(run())

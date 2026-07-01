# -*- coding: utf-8 -*-
"""
Claupiece — Refresh dei prezzi di RIFERIMENTO (settimanale).

Aggiorna il "quanto vale davvero" delle carte in watchlist, dalla fonte disponibile:
  1. CardTrader (API ufficiale) se `CARDTRADER_TOKEN` è configurato → gratis.
  2. altrimenti Cardmarket via Apify (bassa frequenza → costo trascurabile).

⚠️ Girato SETTIMANALE (workflow card_sync.yml), NON dal cron orario di Vinted: i
riferimenti cambiano lento e ogni run Apify costa l'avvio. Così il budget Vinted
resta intatto.

Esecuzione: `python refresh_riferimenti.py`
"""

import config
import db


def _codici_watchlist() -> list[str]:
    try:
        return [w["codice"] for w in db.watchlist_tutta()]
    except Exception as e:
        print(f"[refresh] DB non disponibile: {e}")
        return []


def main() -> None:
    codici = _codici_watchlist()
    if not codici:
        print("[refresh] watchlist vuota — niente riferimenti da aggiornare.")
        return

    if config.cardtrader_disponibile():
        print(f"[refresh] fonte: CardTrader (API) — {len(codici)} carte.")
        import cardtrader
        cardtrader.aggiorna_riferimenti(codici)
    elif config.apify_disponibile():
        print(f"[refresh] fonte: Cardmarket (Apify) — {len(codici)} carte.")
        import cardmarket_source
        cardmarket_source.aggiorna_riferimenti(codici)
    else:
        print("[refresh] nessuna fonte di riferimento configurata "
              "(né CARDTRADER_TOKEN né APIFY_TOKEN) — salto.")


if __name__ == "__main__":
    main()

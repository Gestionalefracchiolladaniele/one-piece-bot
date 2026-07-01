# -*- coding: utf-8 -*-
"""
Claupiece — Prezzo di RIFERIMENTO da Cardmarket (via Apify).

Cardmarket è il marketplace carte più grande in EU, ma la sua API ufficiale è
INACCESSIBILE (chiusa a nuove domande, solo venditori pro, OAuth 1.0 HMAC). Quindi
si legge via **Apify** (come Vinted), leggendo la pagina prodotto pubblica ed
estraendo il prezzo "from" / trend.

⚠️ FREQUENZA SETTIMANALE, non giornaliera: i riferimenti cambiano lento e ogni run
Apify costa l'avvio ($0.02). ~4 avvii/mese ≈ $0.09 → trascurabile dentro i $5 free.
Girato dal workflow settimanale (card_sync.yml), NON dal cron orario di Vinted.

Alternativa gratuita: **CardTrader API** (`cardtrader.py`), se abilitata. `main.py`
sceglie il riferimento disponibile (vedi `db.ultimo_prezzo_riferimento` con fallback).

Come Vinted, l'unico punto da cambiare per migrare a un altro scraper è questo file.
"""

import json
import re
from typing import Optional
from urllib.parse import quote
from urllib.request import Request, urlopen

import config
import db


# ----------------------------------------------------------------------------
# Costruzione URL prodotto Cardmarket
# ----------------------------------------------------------------------------
def costruisci_url(nome_carta: str, codice: str) -> str:
    """URL di ricerca Cardmarket per una carta (pagina prodotti filtrata).

    Usiamo la ricerca per nome+codice: Cardmarket ha URL prodotto complessi (set +
    slug), la ricerca è più robusta all'assenza di un mapping esatto. Lo scraper
    legge la prima riga di prezzo utile.
    """
    q = quote(f"{nome_carta} {codice}".strip())
    return f"{config.CARDMARKET_BASE}/Products/Search?searchString={q}"


# ----------------------------------------------------------------------------
# Chiamata Apify (batch, come Vinted) — 1 run per tutte le carte
# ----------------------------------------------------------------------------
_APIFY_RUN_URL = (
    "https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token={token}"
)

# Prezzo tipo "1,50 €" / "12.30 €" nel testo della pagina.
_RE_PREZZO = re.compile(r"(\d{1,4}[.,]\d{2})\s*€")


def _chiama_apify(urls: list[str]) -> list[dict]:
    if not config.apify_disponibile():
        raise RuntimeError("APIFY_TOKEN mancante: impossibile leggere Cardmarket.")
    actor = config.APIFY_CARDMARKET_ACTOR.replace("/", "~")
    url = _APIFY_RUN_URL.format(actor=actor, token=config.APIFY_TOKEN)
    payload = {
        "startUrls": [{"url": u} for u in urls],
        "maxItems": max(1, len(urls)),
    }
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=300) as resp:
        items = json.loads(resp.read().decode("utf-8", errors="replace"))
    return items if isinstance(items, list) else []


def _estrai_prezzo(item: dict) -> Optional[float]:
    """Estrae il prezzo minimo/"from" da un risultato Apify (difensivo).

    Prova campi strutturati comuni; se assenti, cerca il primo prezzo in € nel testo.
    """
    for chiave in ("priceFrom", "price_from", "price", "lowestPrice", "trendPrice"):
        v = item.get(chiave)
        if v is not None:
            try:
                return round(float(str(v).replace(",", ".").replace("€", "").strip()), 2)
            except (TypeError, ValueError):
                pass
    testo = " ".join(
        str(item.get(k, "")) for k in ("text", "html", "body", "content", "markdown")
    )
    prezzi = [float(m.replace(",", ".")) for m in _RE_PREZZO.findall(testo)]
    return round(min(prezzi), 2) if prezzi else None


# ----------------------------------------------------------------------------
# Punto d'ingresso: aggiorna i riferimenti Cardmarket per una lista di carte
# ----------------------------------------------------------------------------
def aggiorna_riferimenti(codici: list[str]) -> dict[str, float]:
    """1 run Apify batch → prezzo Cardmarket per ogni carta, salvato nello storico.

    Ritorna {codice: prezzo}. Su fallito Apify → {} (nessun aggiornamento; si tiene
    l'ultimo riferimento noto). Pensato per girare SETTIMANALMENTE.
    """
    if not codici:
        return {}

    urls: list[str] = []
    url_per_carta: dict[str, str] = {}
    for codice in codici:
        carta = db.get_carta(codice) or {}
        u = costruisci_url(carta.get("nome", ""), codice)
        urls.append(u)
        url_per_carta[codice] = u

    try:
        grezzi = _chiama_apify(urls)
    except Exception as e:
        print(f"[cardmarket] Apify fallito ({e}) → riferimenti invariati.")
        return {}

    # Rimappa i risultati alla carta (via URL sorgente, o per ordine come fallback).
    risultati: dict[str, float] = {}
    codici_ordinati = list(url_per_carta.keys())
    for idx, item in enumerate(grezzi):
        prezzo = _estrai_prezzo(item)
        if prezzo is None:
            continue
        sorgente = str(item.get("url") or item.get("sourceUrl") or item.get("url_sorgente") or "")
        codice = next((c for c, u in url_per_carta.items() if sorgente and sorgente == u), None)
        if not codice and idx < len(codici_ordinati):
            codice = codici_ordinati[idx]  # fallback: stesso ordine degli URL
        if codice:
            db.salva_prezzo_riferimento(codice, "cardmarket", prezzo)
            risultati[codice] = prezzo
            print(f"[cardmarket] {codice}: riferimento {prezzo}€.")
    return risultati

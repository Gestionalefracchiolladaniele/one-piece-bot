# -*- coding: utf-8 -*-
"""
Claupiece — Client tcgapi.dev (anagrafica carte + prezzi di mercato).

tcgapi.dev è un'API REST che espone le carte One Piece TCG CON i prezzi di mercato
(fonte TCGPlayer → mercato USA, valuta USD). La usiamo per DUE scopi:

  1. ANAGRAFICA  → nome, numero carta (es. OP01-120), set, immagine, rarità.
     Sostituisce punk-records (che ha lo schema per-file rotto): una fonte sola.
  2. PREZZI      → market/low/median/lowest_with_shipping in USD. Li salviamo come
     riferimento (fonte='tcgapi') e li mostriamo anche convertiti in € (stima).

⚠️ VALUTA: i prezzi sono in USD (mercato USA/TCGPlayer), NON EUR/Cardmarket. Per
l'Italia sono una STIMA: teniamo il dato originale in USD e affianchiamo la
conversione in € (cambio da un feed gratuito, 1×/giorno). Utile come ordine di
grandezza per il valore della collezione, non come prezzo Vinted-IT esatto.

⚠️ RATE LIMIT: free tier = 100 richieste/GIORNO (il campo `rate_limit` nella risposta
lo conferma). NON è per-carta: la ricerca è paginata (per_page alto), così un set
intero costa poche chiamate. Popolare tutta l'anagrafica una tantum + refresh
prezzi settimanale sta comodo dentro le 100/giorno.

Auth: header `X-API-Key: <TCGAPI_KEY>`. Base URL: https://api.tcgapi.dev/v1
"""

import json
import time
from typing import Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

import config
import db


# ----------------------------------------------------------------------------
# Chiamata HTTP autenticata
# ----------------------------------------------------------------------------
def _get(path: str, params: Optional[dict] = None) -> Optional[dict]:
    """GET autenticato a tcgapi.dev. Ritorna il JSON parsato (dict) o None su errore."""
    if config.manca(config.TCGAPI_KEY):
        raise RuntimeError("TCGAPI_KEY mancante (vedi SETUP_TODO.md / .env).")
    url = f"{config.TCGAPI_API_BASE}{path}"
    if params:
        url += "?" + urlencode(params)
    req = Request(url, headers={
        "X-API-Key": config.TCGAPI_KEY,
        "Accept": "application/json",
        "User-Agent": "Claupiece/1.0",
    })
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except HTTPError as e:
        # 429 = rate limit esaurito per oggi: lo diciamo esplicito.
        if e.code == 429:
            print("[tcgapi] rate limit giornaliero esaurito (100/giorno).")
        else:
            print(f"[tcgapi] GET {path} HTTP {e.code}: {e}")
        return None
    except (URLError, Exception) as e:
        print(f"[tcgapi] GET {path} errore: {e}")
        return None


# ----------------------------------------------------------------------------
# Cambio USD → EUR (feed gratuito, senza chiave, cache in-process)
# ----------------------------------------------------------------------------
_cambio_cache: Optional[float] = None


def cambio_usd_eur() -> float:
    """Tasso USD→EUR da un feed gratuito (open.er-api.com). Fallback prudente 0.92.

    Cache in-process: 1 sola chiamata per esecuzione. Il tasso non è un segreto e
    non serve precisione al centesimo (il valore è già una stima da mercato USA).
    """
    global _cambio_cache
    if _cambio_cache is not None:
        return _cambio_cache
    try:
        req = Request("https://open.er-api.com/v6/latest/USD",
                      headers={"User-Agent": "Claupiece/1.0"})
        with urlopen(req, timeout=15) as resp:
            dati = json.loads(resp.read().decode("utf-8", errors="replace"))
        tasso = (dati.get("rates") or {}).get("EUR")
        _cambio_cache = float(tasso) if tasso else config.CAMBIO_USD_EUR_FALLBACK
    except Exception as e:
        print(f"[tcgapi] cambio USD→EUR non disponibile ({e}), uso fallback.")
        _cambio_cache = config.CAMBIO_USD_EUR_FALLBACK
    return _cambio_cache


def usd_in_eur(usd: Optional[float]) -> Optional[float]:
    """Converte un prezzo USD in € (stima). None → None."""
    if usd is None:
        return None
    return round(float(usd) * cambio_usd_eur(), 2)


# ----------------------------------------------------------------------------
# Normalizzazione: record tcgapi → riga tabella `carte`
# ----------------------------------------------------------------------------
def _codice(card: dict) -> str:
    """Il codice carta (es. OP01-120) è il campo `number` su tcgapi."""
    return str(card.get("number") or "").strip().upper()


def _prezzo_scelto(card: dict) -> Optional[float]:
    """Prezzo di riferimento in USD: preferiamo la MEDIANA (più robusta agli outlier),
    poi market_price, poi low_price. None se la carta non ha prezzi."""
    for campo in ("median_price", "market_price", "low_price", "lowest_with_shipping"):
        v = card.get(campo)
        if v not in (None, 0, "0"):
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return None


def _riga_carta(card: dict) -> Optional[dict]:
    """Mappa un record tcgapi → riga della tabella `carte`. Scarta senza codice."""
    codice = _codice(card)
    if not codice:
        return None
    return {
        "codice": codice,
        "nome": str(card.get("name") or "").strip(),
        "set": str(card.get("set_name") or "").strip(),
        "rarita": str(card.get("rarity") or "").strip(),
        "colore": "",   # tcgapi non espone il colore nel payload di ricerca
        "tipo": str(card.get("product_type") or "").strip(),
        "lingua": "en",
        "immagine_url": str(card.get("image_url") or "").strip(),
    }


# ----------------------------------------------------------------------------
# Iterazione paginata sulla ricerca (un "termine" alla volta)
# ----------------------------------------------------------------------------
def _cerca_paginato(termine: str, max_pagine: int = 20):
    """Yield delle carte per un termine di ricerca, seguendo la paginazione.

    Un solo termine può avere centinaia di risultati (es. 'Luffy' → 308). Fermiamo
    a `max_pagine` per non bruciare il budget richieste. `per_page` alto = meno
    chiamate per lo stesso numero di carte.
    """
    pagina = 1
    while pagina <= max_pagine:
        resp = _get("/search", {
            "game": config.TCGAPI_GAME_SLUG,
            "q": termine,
            "per_page": config.TCGAPI_PER_PAGE,
            "page": pagina,
        })
        if not resp:
            return
        for card in resp.get("data") or []:
            yield card
        meta = resp.get("meta") or {}
        if not meta.get("has_more"):
            return
        pagina += 1
        time.sleep(0.15)  # gentile col rate limit


# ----------------------------------------------------------------------------
# API pubbliche del modulo
# ----------------------------------------------------------------------------
def cerca(termine: str, limite: int = 20) -> list[dict]:
    """Ricerca live su tcgapi (per la web app quando la carta non è in DB).

    Ritorna righe già normalizzate + il prezzo (usd/eur) per un'anteprima immediata.
    NON scrive nel DB: è una ricerca. Usa 1 chiamata (una pagina).
    """
    resp = _get("/search", {
        "game": config.TCGAPI_GAME_SLUG,
        "q": termine,
        "per_page": min(limite, config.TCGAPI_PER_PAGE),
        "page": 1,
    })
    out: list[dict] = []
    for card in (resp or {}).get("data") or []:
        riga = _riga_carta(card)
        if not riga:
            continue
        usd = _prezzo_scelto(card)
        riga["prezzo_usd"] = usd
        riga["prezzo_eur"] = usd_in_eur(usd)
        out.append(riga)
    return out


def importa_carte(termini: list[str], salva_prezzi: bool = True) -> int:
    """Scarica carte per una lista di termini (nomi o set) e le salva in `carte`.

    Se `salva_prezzi`, salva anche il prezzo di riferimento (fonte='tcgapi', in USD:
    valuta='USD') nello storico. Dedup automatico via upsert (chiave=codice).
    Ritorna il numero di carte importate. Rispetta il budget: ogni termine è paginato.
    """
    viste: dict[str, dict] = {}
    prezzi: dict[str, float] = {}
    for termine in termini:
        for card in _cerca_paginato(termine):
            riga = _riga_carta(card)
            if not riga:
                continue
            viste[riga["codice"]] = riga
            if salva_prezzi:
                usd = _prezzo_scelto(card)
                if usd is not None:
                    prezzi[riga["codice"]] = usd

    if not viste:
        print("[tcgapi] nessuna carta importata (0 risultati o rate limit).")
        return 0

    db.upsert_carte(list(viste.values()))
    if salva_prezzi:
        for codice, usd in prezzi.items():
            db.salva_prezzo_riferimento(codice, "tcgapi", usd, valuta="USD")
    print(f"[tcgapi] importate {len(viste)} carte ({len(prezzi)} con prezzo).")
    return len(viste)


def aggiorna_prezzi(codici: list[str]) -> dict[str, float]:
    """Aggiorna il prezzo (USD) di una lista di carte cercandole per nome su tcgapi.

    Usato dal refresh settimanale per le carte della COLLEZIONE/watchlist. Per ogni
    carta cerca per nome (dall'anagrafica), sceglie il match col numero esatto, e
    salva il prezzo. Ritorna {codice: prezzo_usd}. Attenzione al budget: 1 chiamata
    per carta → per collezioni grandi usa piuttosto importa_carte() per SET interi.
    """
    risultati: dict[str, float] = {}
    for codice in codici:
        carta = db.get_carta(codice) or {}
        nome = carta.get("nome") or codice
        resp = _get("/search", {
            "game": config.TCGAPI_GAME_SLUG,
            "q": nome,
            "per_page": config.TCGAPI_PER_PAGE,
            "page": 1,
        })
        if not resp:
            continue
        for card in resp.get("data") or []:
            if _codice(card) == codice.upper():
                usd = _prezzo_scelto(card)
                if usd is not None:
                    db.salva_prezzo_riferimento(codice, "tcgapi", usd, valuta="USD")
                    risultati[codice] = usd
                break
        time.sleep(0.15)
    print(f"[tcgapi] prezzi aggiornati per {len(risultati)}/{len(codici)} carte.")
    return risultati


if __name__ == "__main__":
    # Test rapido: cerca "Luffy" e stampa i primi risultati con prezzo USD/EUR.
    for r in cerca("Luffy", limite=5):
        print(f"  {r['codice']:>10}  {r['nome']:<28}  "
              f"${r['prezzo_usd']}  (~{r['prezzo_eur']}€)")

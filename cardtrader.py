# -*- coding: utf-8 -*-
"""
Claupiece — Wrapper CardTrader API (prezzo di RIFERIMENTO).

CardTrader è l'unica API ufficiale pulita: Bearer token, REST semplice, gratis.
Ci dà il "quanto vale davvero" una carta (valore di mercato stabile), che il
deal_finder confronta con gli annunci Vinted per capire se è un affare.

Percorso VERIFICATO (vedi REBRAND.md):
  GET /games                              → game_id di One Piece (1 volta)
  GET /expansions                         → expansion_id per set (OP01, EB01, ST…)
  GET /blueprints/export?expansion_id=X   → carte del set: image, card_market_ids,
                                            tcg_player_id, blueprint_id (chiave prezzi)
  GET /marketplace/products?blueprint_id=Y→ prezzi reali: price.cents, condizione,
                                            lingua, foil, user.country_code, quantità

Il blueprint_id è il ponte codice-carta → prezzo. Lo risolviamo una volta e lo
salviamo su `carte.cardtrader_blueprint_id` per non rifare il percorso ogni volta.

Rate limit: 10 req/s sul marketplace, 200 req/10s globale. Uso leggero (1×/giorno,
poche carte in watchlist) → nessun problema.
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
def _get(path: str, params: Optional[dict] = None) -> Optional[object]:
    """GET autenticato all'API CardTrader. Ritorna JSON parsato o None su errore."""
    if config.manca(config.CARDTRADER_TOKEN):
        raise RuntimeError("CARDTRADER_TOKEN mancante (vedi SETUP_TODO.md).")
    url = f"{config.CARDTRADER_API_BASE}{path}"
    if params:
        url += "?" + urlencode(params)
    req = Request(url, headers={
        "Authorization": f"Bearer {config.CARDTRADER_TOKEN}",
        "Accept": "application/json",
        "User-Agent": "Claupiece/1.0",
    })
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except (HTTPError, URLError) as e:
        print(f"[cardtrader] GET {path} fallito: {e}")
        return None
    except Exception as e:
        print(f"[cardtrader] GET {path} errore: {e}")
        return None


# ----------------------------------------------------------------------------
# Risoluzione game/expansion/blueprint (il ponte codice → blueprint_id)
# ----------------------------------------------------------------------------
_game_id_cache: Optional[int] = None


def game_id_one_piece() -> Optional[int]:
    """Trova (e cache-a) il game_id di One Piece su CardTrader."""
    global _game_id_cache
    if _game_id_cache is not None:
        return _game_id_cache
    games = _get("/games") or []
    # /games può ritornare {"array": [...]} o direttamente una lista.
    if isinstance(games, dict):
        games = games.get("array") or games.get("games") or []
    target = config.CARDTRADER_GAME_NAME.lower()
    for g in games if isinstance(games, list) else []:
        nome = str(g.get("name") or g.get("display_name") or "").lower()
        if target in nome:
            _game_id_cache = g.get("id")
            return _game_id_cache
    print("[cardtrader] game One Piece non trovato in /games.")
    return None


def _blueprint_da_export(expansion_id: int) -> list[dict]:
    """Tutte le carte (blueprint) di un'espansione."""
    dati = _get("/blueprints/export", {"expansion_id": expansion_id}) or []
    if isinstance(dati, dict):
        dati = dati.get("array") or dati.get("blueprints") or []
    return dati if isinstance(dati, list) else []


def risolvi_blueprint(codice: str) -> Optional[int]:
    """Trova il blueprint_id CardTrader per un codice carta (es. OP01-120).

    Strategia: se già salvato su `carte.cardtrader_blueprint_id` → usalo. Altrimenti
    scandisce le espansioni del gioco One Piece e cerca il codice, poi salva il
    risultato sul DB (così la prossima volta è immediato).
    """
    carta = db.get_carta(codice)
    if carta and carta.get("cardtrader_blueprint_id"):
        return int(carta["cardtrader_blueprint_id"])

    gid = game_id_one_piece()
    if not gid:
        return None
    expansions = _get("/expansions") or []
    if isinstance(expansions, dict):
        expansions = expansions.get("array") or expansions.get("expansions") or []

    codice_up = codice.strip().upper()
    for exp in expansions if isinstance(expansions, list) else []:
        if exp.get("game_id") != gid:
            continue
        for bp in _blueprint_da_export(exp.get("id")):
            # I blueprint espongono il codice in campi diversi a seconda del set.
            bp_code = str(
                bp.get("card_number") or bp.get("collector_number")
                or bp.get("code") or bp.get("name") or ""
            ).upper()
            if codice_up in bp_code:
                blueprint_id = bp.get("id")
                # Salviamo il ponte + eventuali id cross-fonte per il futuro.
                try:
                    db.aggiorna_carta_bridge(codice, {
                        "cardtrader_blueprint_id": blueprint_id,
                        "cardmarket_id": (bp.get("card_market_ids") or [None])[0],
                    })
                except Exception:
                    pass
                return blueprint_id
        time.sleep(0.1)  # gentile col rate-limit globale
    print(f"[cardtrader] blueprint non trovato per {codice}.")
    return None


# ----------------------------------------------------------------------------
# Prezzo di riferimento (il minimo listato in target paese)
# ----------------------------------------------------------------------------
def prezzo_riferimento(codice: str, paese: str = "it") -> Optional[float]:
    """Prezzo di riferimento in € per una carta: il minimo tra i prodotti listati.

    Filtra per `user.country_code` (Italia/Europa) quando disponibile → riferimento
    coerente col mercato dove poi si compra su Vinted. Ritorna None se non listata.
    """
    blueprint_id = risolvi_blueprint(codice)
    if not blueprint_id:
        return None

    prodotti = _get("/marketplace/products", {"blueprint_id": blueprint_id}) or []
    # L'endpoint ritorna {"<blueprint_id>": [prodotti]} oppure una lista.
    if isinstance(prodotti, dict):
        prodotti = prodotti.get(str(blueprint_id)) or next(iter(prodotti.values()), [])
    if not isinstance(prodotti, list) or not prodotti:
        return None

    paese_up = (paese or "").upper()
    prezzi: list[float] = []
    for p in prodotti:
        cents = ((p.get("price") or {}).get("cents")) if isinstance(p.get("price"), dict) \
            else p.get("price_cents")
        if not cents:
            continue
        cc = str((p.get("user") or {}).get("country_code") or "").upper()
        # Se ho un filtro paese e il prodotto ha un country_code diverso → salto.
        if paese_up and paese_up != "EU" and cc and cc != paese_up:
            continue
        prezzi.append(cents / 100.0)

    if not prezzi:
        # Nessun prodotto nel paese target: ripiego sul minimo globale (meglio di niente).
        for p in prodotti:
            cents = ((p.get("price") or {}).get("cents")) if isinstance(p.get("price"), dict) \
                else p.get("price_cents")
            if cents:
                prezzi.append(cents / 100.0)
    if not prezzi:
        return None
    return round(min(prezzi), 2)


def aggiorna_riferimenti(codici: list[str]) -> dict[str, float]:
    """Aggiorna il prezzo di riferimento per una lista di carte e lo salva nello storico.

    Girato 1×/giorno (i riferimenti cambiano lento → costo €0). Ritorna {codice: prezzo}
    per le carte risolte; le altre restano col loro ultimo prezzo noto.
    """
    risultati: dict[str, float] = {}
    for codice in codici:
        try:
            prezzo = prezzo_riferimento(codice)
        except RuntimeError:
            raise
        except Exception as e:
            print(f"[cardtrader] {codice}: errore riferimento ({e}).")
            prezzo = None
        if prezzo is not None:
            db.salva_prezzo_riferimento(codice, "cardtrader", prezzo)
            risultati[codice] = prezzo
            print(f"[cardtrader] {codice}: riferimento {prezzo}€.")
        time.sleep(0.2)  # gentile col rate-limit marketplace (10 req/s)
    return risultati

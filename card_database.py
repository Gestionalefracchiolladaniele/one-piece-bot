# -*- coding: utf-8 -*-
"""
Claupiece — Sincronizzazione anagrafica carte da punk-records.

punk-records (buhbbl/punk-records su GitHub) è un dataset STATICO versionato con
TUTTE le carte One Piece TCG (nome, codice, rarità, colore, tipo, immagini, lingue).
Lo scarichiamo come JSON raw da GitHub → €0, nessuna API, nessuna chiave.

Girato dalla GitHub Action SETTIMANALE: rileva set nuovi automaticamente e fa
l'upsert su Supabase (tabella `carte`). Zero AI, solo download + normalizzazione.

Esecuzione: `python card_database.py`

NB: la struttura esatta del JSON di punk-records può evolvere. `_normalizza()`
è volutamente difensivo (usa .get e più nomi-chiave alternativi) così un piccolo
cambio di schema a monte non rompe il sync: al massimo alcuni campi restano vuoti.
"""

import json
from typing import Optional
from urllib.request import Request, urlopen

import config
import db


# ----------------------------------------------------------------------------
# Download del dataset
# ----------------------------------------------------------------------------
def _fetch_json(url: str) -> Optional[object]:
    try:
        req = Request(url, headers={"User-Agent": "Claupiece/1.0 (card sync)"})
        with urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        print(f"[card_database] fetch fallito {url}: {e}")
        return None


def _url_carte(lingua: str) -> str:
    """URL raw del file carte per lingua. punk-records espone file per-lingua.

    Struttura tipica: <base>/cards/<lingua>.json (lista di carte). Se il layout
    del repo cambia, basta aggiornare questo helper.
    """
    return f"{config.PUNK_RECORDS_BASE}/cards/{lingua}.json"


# ----------------------------------------------------------------------------
# Normalizzazione → riga tabella `carte`
# ----------------------------------------------------------------------------
def _primo(d: dict, *chiavi: str, default=""):
    """Ritorna il primo valore presente e non vuoto tra più nomi-chiave possibili."""
    for k in chiavi:
        v = d.get(k)
        if v not in (None, "", [], {}):
            return v
    return default


def _normalizza(carta: dict, lingua: str) -> Optional[dict]:
    """Mappa un record punk-records → riga della tabella `carte`.

    Difensivo: prova più nomi-chiave alternativi. Scarta le carte senza codice
    (il codice è la PK e serve per il ponte con CardTrader/Vinted).
    """
    codice = str(_primo(carta, "code", "id", "card_id", "cardId")).strip().upper()
    if not codice:
        return None

    immagine = _primo(carta, "image", "image_url", "imageUrl", "img")
    if isinstance(immagine, dict):  # a volte è {"<lingua>": url}
        immagine = immagine.get(lingua) or next(iter(immagine.values()), "")

    return {
        "codice": codice,
        "nome": str(_primo(carta, "name", "title")).strip(),
        "set": str(_primo(carta, "set", "set_code", "pack", "expansion")).strip(),
        "rarita": str(_primo(carta, "rarity", "rarita")).strip(),
        "colore": str(_primo(carta, "color", "colors", "colore")).strip()
        if not isinstance(_primo(carta, "color", "colors"), list)
        else "/".join(_primo(carta, "color", "colors")),
        "tipo": str(_primo(carta, "type", "category", "tipo")).strip(),
        "lingua": lingua,
        "immagine_url": str(immagine).strip(),
        # Ponte con le altre fonti: riempito da cardtrader.py quando risolve i prezzi.
        "cardtrader_blueprint_id": carta.get("cardtrader_blueprint_id"),
        "cardmarket_id": carta.get("cardmarket_id") or carta.get("card_market_id"),
    }


# ----------------------------------------------------------------------------
# Punto d'ingresso
# ----------------------------------------------------------------------------
def sincronizza(lingua: Optional[str] = None) -> int:
    """Scarica punk-records per la lingua e fa upsert su Supabase. Ritorna il n° carte.

    Se il download fallisce o è vuoto, NON tocca il DB (meglio anagrafica vecchia
    che anagrafica azzerata).
    """
    lingua = lingua or config.LINGUA_ANAGRAFICA
    print(f"[card_database] scarico anagrafica punk-records (lingua={lingua})…")

    dati = _fetch_json(_url_carte(lingua))
    # Il file può essere una lista di carte o un dict {codice: carta}.
    if isinstance(dati, dict):
        dati = list(dati.values())
    if not isinstance(dati, list) or not dati:
        print("[card_database] nessun dato scaricato — anagrafica invariata.")
        return 0

    carte: list[dict] = []
    for c in dati:
        if not isinstance(c, dict):
            continue
        riga = _normalizza(c, lingua)
        if riga:
            carte.append(riga)

    if not carte:
        print("[card_database] normalizzazione a vuoto — anagrafica invariata.")
        return 0

    db.upsert_carte(carte)
    print(f"[card_database] anagrafica aggiornata: {len(carte)} carte.")
    return len(carte)


if __name__ == "__main__":
    sincronizza()

# -*- coding: utf-8 -*-
"""
Claupiece — Sincronizzazione anagrafica carte da punk-records.

punk-records (buhbbl/punk-records su GitHub) è un dataset STATICO versionato con
TUTTE le carte One Piece TCG (nome, codice, rarità, colore, tipo, pack). €0,
nessuna API, nessuna chiave.

⚠️ STRUTTURA REALE (verificata) — NON è `cards/<lingua>.json` come credeva la
vecchia versione (che scaricava un 404). Il repo è organizzato per LINGUA con
nomi ESTESI (`english`, non `en`; `french`, `japanese`, …). Dentro ogni lingua:
  - `packs.json`            → dict {pack_id: {..., title_parts:{label:"OP-01"}}}
  - `cards/<pack_id>/<CODICE>.json` → una carta per file (ha anche `img_full_url`)
  - `index/cards_by_id.json`→ TUTTE le carte in UN file {codice: {...}} (SENZA img)
  - `data/<pack_id>.json`   → carte per pack

Strategia (economica): scarichiamo l'INDICE completo in UN fetch
(`index/cards_by_id.json`, ~1.2 MB, ~4500 carte) + `packs.json` per i label dei
set, e ricostruiamo l'URL immagine dal pattern fisso del sito ufficiale
(l'indice non porta l'immagine, ma i file per-carta sì e usano sempre lo stesso
schema). Così bastano 2 richieste HTTP invece di centinaia.

Ogni carta punk-records ha: `card_id`, `name`, `pack_id`, `rarity`, `colors`
(lista), `category`, `types`, `cost`, `power`, `counter`, `attributes`,
`keywords`. Le VARIANTI (Alternate Art / parallel) hanno un suffisso nel codice
(es. `EB01-001_p1`): stesso `number` base, immagine diversa. Le teniamo come
carte distinte (codice = `card_id`), ma il codice "base" resta la parte prima di
`_` per il ponte con tcgapi/Vinted.

Girato dalla GitHub Action SETTIMANALE: rileva set nuovi automaticamente e fa
l'upsert su Supabase (tabella `carte`). Zero AI, solo download + normalizzazione.

Esecuzione: `python card_database.py`
"""

import html
import json
from typing import Optional
from urllib.request import Request, urlopen

import config
import db


# Mappa lingua "corta" (env storica: en/fr/…) → cartella del repo (estesa).
_CARTELLA_LINGUA = {
    "en": "english",
    "en-asia": "english-asia",
    "fr": "french",
    "jp": "japanese",
    "ja": "japanese",
    "th": "thai",
    "zh-hk": "chinese-hongkong",
    "zh-tw": "chinese-taiwan",
}

# Pattern immagine ufficiale One Piece Card Game. L'indice non porta l'immagine,
# ma i file per-carta usano SEMPRE questo schema (verificato). `?...` = cache-bust
# lato sito, non necessario per visualizzare.
_IMG_BASE = "https://en.onepiece-cardgame.com/images/cardlist/card"


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


def _cartella(lingua: str) -> str:
    """Nome cartella del repo per la lingua (mappa le sigle corte a quelle estese)."""
    return _CARTELLA_LINGUA.get(lingua, lingua)


def _url_index(lingua: str) -> str:
    """URL raw dell'indice completo (tutte le carte in un file)."""
    return f"{config.PUNK_RECORDS_BASE}/{_cartella(lingua)}/index/cards_by_id.json"


def _url_packs(lingua: str) -> str:
    """URL raw dei pack (per risalire dal pack_id al label del set, es. OP-01)."""
    return f"{config.PUNK_RECORDS_BASE}/{_cartella(lingua)}/packs.json"


# ----------------------------------------------------------------------------
# Normalizzazione → riga tabella `carte`
# ----------------------------------------------------------------------------
def _label_pack(packs: dict, pack_id: str) -> str:
    """Label del set dal pack_id (es. '569001' → 'ST-01'). Vuoto se sconosciuto."""
    p = packs.get(str(pack_id)) if isinstance(packs, dict) else None
    if isinstance(p, dict):
        tp = p.get("title_parts") or {}
        return str(tp.get("label") or p.get("raw_title") or "").strip()
    return ""


def _colore(carta: dict) -> str:
    """Colori come stringa 'Red/Green' (punk-records li dà come lista)."""
    col = carta.get("colors") or carta.get("color")
    if isinstance(col, list):
        return "/".join(str(x) for x in col)
    return str(col or "").strip()


def _normalizza(carta: dict, packs: dict, lingua: str) -> Optional[dict]:
    """Mappa un record punk-records → riga della tabella `carte`.

    Il codice (PK) è il `card_id` (es. ST01-001, EB01-001_p1). Scarta le carte
    senza codice. L'immagine è ricostruita dal pattern ufficiale usando il codice.
    """
    id_grezzo = str(carta.get("card_id") or carta.get("id") or "").strip()
    if not id_grezzo:
        return None
    # Il codice (PK) lo normalizziamo maiuscolo per il ponte con tcgapi/Vinted…
    codice = id_grezzo.upper()
    # …ma l'URL immagine usa il codice ORIGINALE: le varianti hanno il suffisso in
    # minuscolo sul sito ufficiale (es. EB02-010_p1.png; la versione _P1 dà 404).
    return {
        "codice": codice,
        # I nomi arrivano con entità HTML (es. 'Luffy &amp; Ace', '&#39;') → decodifica.
        "nome": html.unescape(str(carta.get("name") or "").strip()),
        "set": _label_pack(packs, carta.get("pack_id")),
        "rarita": str(carta.get("rarity") or "").strip(),
        "colore": _colore(carta),
        "tipo": str(carta.get("category") or "").strip(),
        "lingua": lingua,
        # L'indice non porta l'immagine → la ricostruiamo dal codice (pattern fisso).
        "immagine_url": f"{_IMG_BASE}/{id_grezzo}.png",
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

    index = _fetch_json(_url_index(lingua))
    if not isinstance(index, dict) or not index:
        print("[card_database] indice non scaricato/vuoto — anagrafica invariata.")
        return 0
    packs = _fetch_json(_url_packs(lingua)) or {}

    carte: list[dict] = []
    for c in index.values():
        if not isinstance(c, dict):
            continue
        riga = _normalizza(c, packs, lingua)
        if riga:
            carte.append(riga)

    if not carte:
        print("[card_database] normalizzazione a vuoto — anagrafica invariata.")
        return 0

    db.upsert_carte(carte)
    print(f"[card_database] anagrafica aggiornata: {len(carte)} carte "
          f"({len(packs)} set).")
    return len(carte)


if __name__ == "__main__":
    sincronizza()

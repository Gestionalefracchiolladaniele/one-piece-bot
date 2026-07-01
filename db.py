# -*- coding: utf-8 -*-
"""
Claupiece — Helper di accesso a Supabase.

Sei tabelle (vedi schema.sql):
  - `carte`               — anagrafica da punk-records (codice PK, nome, set, …).
  - `watchlist`           — carte monitorate + regola prezzo + priorità + paese.
  - `prezzi_riferimento`  — storico prezzi per carta/fonte (CardTrader, …).
  - `annunci_visti`       — dedup item_id Vinted (evita di ri-notificare).
  - `affari`              — affari trovati (per storico/dashboard).
  - `config`              — impostazioni globali (finestra oraria, ecc.).

Il backend usa la SERVICE ROLE KEY → bypassa RLS. Mai esporla al client.
"""

from datetime import datetime, timezone
from typing import Optional

from supabase import create_client, Client

import config


def _client() -> Client:
    if config.manca(config.SUPABASE_URL) or config.manca(config.SUPABASE_SERVICE_ROLE_KEY):
        raise RuntimeError(
            "Credenziali Supabase mancanti: imposta SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY (vedi SETUP_TODO.md)."
        )
    return create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)


_supabase: Optional[Client] = None


def supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = _client()
    return _supabase


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# CARTE (anagrafica da punk-records)
# ============================================================================
def upsert_carte(carte: list[dict]) -> None:
    """Upsert in blocco dell'anagrafica (chiave = codice). Idempotente."""
    if not carte:
        return
    # Supabase/PostgREST accetta upsert batch; spezziamo per non fare payload enormi.
    for i in range(0, len(carte), 500):
        supabase().table("carte").upsert(carte[i:i + 500]).execute()


def get_carta(codice: str) -> Optional[dict]:
    resp = supabase().table("carte").select("*").eq("codice", codice).limit(1).execute()
    righe = resp.data or []
    return righe[0] if righe else None


def aggiorna_carta_bridge(codice: str, campi: dict) -> None:
    """Aggiorna i ponti cross-fonte di una carta (es. cardtrader_blueprint_id).

    Usato da cardtrader.py dopo aver risolto il blueprint_id, così la volta dopo
    è immediato. Aggiorna solo i campi passati (no upsert dell'intera riga).
    """
    puliti = {k: v for k, v in campi.items() if v is not None}
    if not puliti:
        return
    supabase().table("carte").update(puliti).eq("codice", codice).execute()


def cerca_carte(query: str, limite: int = 30) -> list[dict]:
    """Ricerca carte per nome o codice (usata dalla dashboard)."""
    q = (query or "").strip()
    if not q:
        return []
    resp = (
        supabase()
        .table("carte")
        .select("*")
        .or_(f"nome.ilike.%{q}%,codice.ilike.%{q}%")
        .limit(limite)
        .execute()
    )
    return resp.data or []


# ============================================================================
# WATCHLIST (carte monitorate + regole)
# ============================================================================
def watchlist_attiva() -> list[dict]:
    """Carte watchlist ATTIVE, con la carta agganciata (join manuale)."""
    resp = supabase().table("watchlist").select("*").eq("attiva", True).execute()
    return resp.data or []


def watchlist_tutta() -> list[dict]:
    resp = supabase().table("watchlist").select("*").order("created_at").execute()
    return resp.data or []


def aggiungi_watchlist(codice: str, campi: Optional[dict] = None) -> dict:
    """Aggiunge (o aggiorna) una carta in watchlist. `codice` è la chiave."""
    record = {
        "codice": codice,
        "attiva": True,
        "priorita": "normale",
        # Default = prezzo_max (tetto in €): funziona SENZA CardTrader. La regola
        # perc_sconto richiede il prezzo di riferimento (CardTrader), opzionale.
        "regola_tipo": "prezzo_max",
        "regola_valore": 30.0,
        "paese": config.VINTED_MARKET_DEFAULT,
    }
    if campi:
        record.update(campi)
    record.setdefault("created_at", _now())
    supabase().table("watchlist").upsert(record).execute()
    resp = supabase().table("watchlist").select("*").eq("codice", codice).limit(1).execute()
    righe = resp.data or []
    return righe[0] if righe else record


def aggiorna_watchlist(codice: str, campi: dict) -> None:
    supabase().table("watchlist").update(campi).eq("codice", codice).execute()


def rimuovi_watchlist(codice: str) -> None:
    supabase().table("watchlist").delete().eq("codice", codice).execute()


# ============================================================================
# PREZZI DI RIFERIMENTO (storico per carta/fonte)
# ============================================================================
def salva_prezzo_riferimento(codice: str, fonte: str, prezzo: float,
                             valuta: str = config.VALUTA) -> None:
    supabase().table("prezzi_riferimento").insert({
        "codice": codice,
        "fonte": fonte,
        "prezzo": prezzo,
        "valuta": valuta,
        "timestamp": _now(),
    }).execute()


def ultimo_prezzo_riferimento(codice: str, fonte: Optional[str] = None) -> Optional[dict]:
    """L'ultimo prezzo di riferimento noto per una carta (il più recente).

    Se `fonte` è None → prende il più recente tra TUTTE le fonti (cardtrader,
    cardmarket, …): così il deal_finder usa qualunque riferimento disponibile senza
    sapere quale fonte è attiva. Passa una `fonte` specifica per forzarla.
    """
    q = supabase().table("prezzi_riferimento").select("*").eq("codice", codice)
    if fonte:
        q = q.eq("fonte", fonte)
    resp = q.order("timestamp", desc=True).limit(1).execute()
    righe = resp.data or []
    return righe[0] if righe else None


def storico_prezzi(codice: str, fonte: str = "cardtrader", limite: int = 90) -> list[dict]:
    """Storico prezzi per la dashboard (grafico)."""
    resp = (
        supabase()
        .table("prezzi_riferimento")
        .select("*")
        .eq("codice", codice)
        .eq("fonte", fonte)
        .order("timestamp", desc=True)
        .limit(limite)
        .execute()
    )
    return list(reversed(resp.data or []))


# ============================================================================
# ANNUNCI VISTI (dedup — "solo nuovi")
# ============================================================================
def gia_visto(item_id: str) -> bool:
    resp = (
        supabase()
        .table("annunci_visti")
        .select("item_id")
        .eq("item_id", str(item_id))
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def marca_visto(item_id: str, codice: str) -> None:
    """Registra un annuncio come già visto (idempotente sull'item_id)."""
    supabase().table("annunci_visti").upsert({
        "item_id": str(item_id),
        "codice": codice,
        "visto_at": _now(),
    }).execute()


# ============================================================================
# AFFARI (storico affari trovati — per dashboard/notifiche)
# ============================================================================
def salva_affare(affare: dict) -> None:
    record = dict(affare)
    record.setdefault("timestamp", _now())
    supabase().table("affari").insert(record).execute()


def ultimi_affari(limite: int = 50) -> list[dict]:
    resp = (
        supabase()
        .table("affari")
        .select("*")
        .order("timestamp", desc=True)
        .limit(limite)
        .execute()
    )
    return resp.data or []


# ============================================================================
# CONFIG (impostazioni globali — 1 riga)
# ============================================================================
def get_config() -> dict:
    """Ritorna la riga di config (id=1), o {} se non esiste ancora."""
    resp = supabase().table("config").select("*").eq("id", 1).limit(1).execute()
    righe = resp.data or []
    return righe[0] if righe else {}


def imposta_config(campi: dict) -> None:
    record = {"id": 1}
    record.update(campi)
    supabase().table("config").upsert(record).execute()


def finestra_orari() -> tuple[int, int]:
    """Ritorna (ora_inizio, ora_fine) della finestra attiva, dal DB con fallback.

    Orari liberi 0–24 (es. 7, 13). Se il DB non ha valori → default da config.
    """
    cfg = {}
    try:
        cfg = get_config()
    except Exception:
        pass
    inizio = cfg.get("finestra_inizio")
    fine = cfg.get("finestra_fine")
    return (
        int(inizio) if inizio is not None else config.FINESTRA_INIZIO_DEFAULT,
        int(fine) if fine is not None else config.FINESTRA_FINE_DEFAULT,
    )


def notifiche_in_pausa() -> bool:
    """True se le notifiche sono state messe in pausa (comando /pausa)."""
    try:
        return bool(get_config().get("in_pausa"))
    except Exception:
        return False


def imposta_pausa(in_pausa: bool) -> None:
    imposta_config({"in_pausa": in_pausa})

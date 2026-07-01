# -*- coding: utf-8 -*-
"""
Claupiece — Scoring a stelle degli affari (Gemini).

Un affare "sotto prezzo" non è per forza un buon affare: conta anche la condizione
della carta, il Paese del venditore (spedizione/dogana), e l'affidabilità del
venditore. Gemini pesa questi fattori in un voto ⭐1–5 con una riga di motivazione.

On-demand: chiamato solo quando il deal_finder ha già trovato un affare (pochi al
giorno) → free tier abbondante. DEGRADA CON GRAZIA: se l'AI fallisce, si usa uno
scoring euristico (solo sconto), così la notifica parte comunque.
"""

import json
from typing import Optional

from google import genai
from google.genai import types

import config

if config.manca(config.GEMINI_API_KEY):
    print("[scorer] ATTENZIONE: GEMINI_API_KEY non configurata (vedi SETUP_TODO.md).")

_client: Optional[genai.Client] = None


def client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


# ----------------------------------------------------------------------------
# Fallback euristico (senza AI) — basato sul solo sconto
# ----------------------------------------------------------------------------
def _stelle_euristiche(affare: dict) -> int:
    """Voto 1–5 dal solo sconto %, quando l'AI non è disponibile."""
    sconto = affare.get("sconto_perc")
    if sconto is None:
        return 3  # nessun riferimento → voto neutro
    if sconto >= 40:
        return 5
    if sconto >= 25:
        return 4
    if sconto >= 12:
        return 3
    if sconto >= 5:
        return 2
    return 1


# ----------------------------------------------------------------------------
# Scoring AI
# ----------------------------------------------------------------------------
def _prompt(affare: dict, nome_carta: str) -> str:
    return (
        "Valuta questo affare su una carta One Piece TCG con un voto da 1 a 5 stelle. "
        "Considera: entità dello sconto sul prezzo di riferimento, condizione della "
        "carta (near mint > played), Paese del venditore (Italia/EU = meno rischi di "
        "spedizione/dogana), affidabilità apparente del venditore.\n\n"
        f"Carta: {nome_carta}\n"
        f"Titolo annuncio: {affare.get('titolo', '')}\n"
        f"Prezzo Vinted: {affare.get('prezzo_vinted')}€\n"
        f"Prezzo riferimento: {affare.get('prezzo_riferimento')}€\n"
        f"Sconto: {affare.get('sconto_perc')}%\n"
        f"Condizione: {affare.get('condizione', 'n/d')}\n"
        f"Paese venditore: {affare.get('paese', 'n/d')}\n\n"
        'Rispondi SOLO con JSON: {"stelle": <1-5>, "motivo": "<una riga in italiano>"}'
    )


def valuta(affare: dict, nome_carta: str = "") -> dict:
    """Assegna stelle + motivo a un affare. Ritorna l'affare arricchito.

    Aggiunge `score_stelle` (int 1–5) e `score_motivo` (str). Non solleva mai: su
    errore usa l'euristica (lo scoring non deve mai bloccare una notifica di affare).
    """
    import time

    cfg = types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.3,
    )
    contenuti = _prompt(affare, nome_carta)

    response = None
    for modello in config.MODELLI_SCORING:
        for tentativo in range(2):
            try:
                response = client().models.generate_content(
                    model=modello, contents=contenuti, config=cfg,
                )
                break
            except Exception as e:
                attesa = 3 * (tentativo + 1)
                print(f"[scorer] {modello} errore (try {tentativo+1}/2): "
                      f"{str(e)[:70]} - retry {attesa}s")
                time.sleep(attesa)
        if response is not None:
            break

    stelle: Optional[int] = None
    motivo = ""
    if response is not None:
        try:
            dati = json.loads((getattr(response, "text", "") or "").strip())
            stelle = int(dati.get("stelle"))
            motivo = str(dati.get("motivo") or "").strip()
        except (json.JSONDecodeError, ValueError, TypeError):
            stelle = None

    if not stelle or not (1 <= stelle <= 5):
        stelle = _stelle_euristiche(affare)
        if not motivo:
            motivo = "Valutato sullo sconto (AI non disponibile)."

    affare = dict(affare)
    affare["score_stelle"] = stelle
    affare["score_motivo"] = motivo
    return affare


def stelle_str(n: int) -> str:
    """Rappresentazione a emoji (⭐) del voto, per le notifiche."""
    n = max(0, min(5, int(n or 0)))
    return "⭐" * n

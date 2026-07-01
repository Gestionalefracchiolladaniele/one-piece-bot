# -*- coding: utf-8 -*-
"""
Claupiece — Deal Finder (il cuore).

Confronta `prezzo Vinted` (annuncio) vs `prezzo di riferimento` (CardTrader) e,
in base alla REGOLA impostata per quella carta, decide se è un AFFARE:

  - prezzo_max    → affare se prezzo_vinted ≤ regola_valore (tetto assoluto in €)
  - perc_sconto   → affare se lo sconto sul riferimento ≥ regola_valore (%)
  - ogni_annuncio → sempre affare (ogni nuovo annuncio in target notifica)

Solo Python, niente AI (lo scoring a stelle è on-demand in scorer.py). Se manca il
prezzo di riferimento (carta non risolta su CardTrader), la regola `prezzo_max` e
`ogni_annuncio` funzionano comunque; `perc_sconto` no (serve il riferimento).
"""

from typing import Optional


def calcola_sconto(prezzo_vinted: float, prezzo_riferimento: Optional[float]) -> Optional[float]:
    """Sconto percentuale dell'annuncio rispetto al riferimento (positivo = più economico).

    None se non c'è un riferimento valido (>0). Es. rif 48€, vinted 39€ → +18.75%.
    """
    if not prezzo_riferimento or prezzo_riferimento <= 0:
        return None
    return round((prezzo_riferimento - prezzo_vinted) / prezzo_riferimento * 100, 1)


def valuta_annuncio(annuncio: dict, regola_tipo: str, regola_valore: float,
                    prezzo_riferimento: Optional[float]) -> Optional[dict]:
    """Decide se un annuncio Vinted è un affare secondo la regola della carta.

    Ritorna un dict-affare (arricchito con sconto e riferimento) se è un affare,
    altrimenti None. Non tocca il DB né notifica: pura decisione.
    """
    prezzo = annuncio.get("prezzo")
    if prezzo is None:
        return None

    sconto = calcola_sconto(prezzo, prezzo_riferimento)
    e_affare = False

    if regola_tipo == "prezzo_max":
        e_affare = prezzo <= regola_valore
    elif regola_tipo == "perc_sconto":
        # Serve un riferimento: senza, non possiamo giudicare lo sconto.
        e_affare = sconto is not None and sconto >= regola_valore
    elif regola_tipo == "ogni_annuncio":
        e_affare = True
    else:
        # Regola sconosciuta: prudenti, non notifichiamo.
        e_affare = False

    if not e_affare:
        return None

    return {
        "prezzo_vinted": prezzo,
        "prezzo_riferimento": prezzo_riferimento,
        "sconto_perc": sconto,
        "url_annuncio": annuncio.get("url", ""),
        "condizione": annuncio.get("condizione", ""),
        "paese": annuncio.get("paese", ""),
        "titolo": annuncio.get("titolo", ""),
        "venditore": annuncio.get("venditore", ""),
        "item_id": annuncio.get("item_id", ""),
    }


def trova_affari(codice: str, annunci: list[dict], regola_tipo: str,
                 regola_valore: float, prezzo_riferimento: Optional[float]) -> list[dict]:
    """Applica la regola a tutti gli annunci di una carta → lista di affari.

    Ordina gli affari per sconto decrescente (i migliori prima); gli affari senza
    sconto calcolabile (regola prezzo_max / ogni_annuncio senza riferimento) vanno
    in coda ma restano presenti.
    """
    affari: list[dict] = []
    for a in annunci:
        affare = valuta_annuncio(a, regola_tipo, regola_valore, prezzo_riferimento)
        if affare:
            affare["codice"] = codice
            affari.append(affare)
    affari.sort(key=lambda x: (x.get("sconto_perc") is None, -(x.get("sconto_perc") or 0)))
    return affari

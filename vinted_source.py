# -*- coding: utf-8 -*-
"""
Claupiece — Fonte Vinted (caccia agli affari) via Apify.

Vinted è la fonte DINAMICA: annunci di privati che spariscono in fretta e vanno
letti spesso (ogni ora, dentro la finestra). Non ha un'API pubblica usabile
(endpoint interno protetto da Datadome) → si legge via Apify (IP residenziali loro).

Questo modulo:
  1. Costruisce l'URL di ricerca Vinted con i filtri (testo, prezzo max, mercato,
     newest_first) → Vinted restituisce già solo il filtrato (non paghi risultati
     fuori target).
  2. Chiama Apify (Smart Scraper) in UN SOLO run BATCH con tutti gli URL → 1 solo
     avvio ($0.02), non 1 per carta. È la regola aurea del budget.
  3. Normalizza gli annunci in un formato stabile per il deal_finder.

⚠️ È L'UNICO PUNTO DA CAMBIARE per migrare a ScrapeBadger (vedi REBRAND.md): la
firma di `cerca_batch()` resta identica, cambia solo l'implementazione interna.
"""

import json
from typing import Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import config


# ----------------------------------------------------------------------------
# Costruzione URL di ricerca Vinted (con filtri)
# ----------------------------------------------------------------------------
def costruisci_url(testo: str, prezzo_max: Optional[float] = None,
                   mercato: str = "it") -> str:
    """URL di ricerca Vinted con i filtri. Vinted filtra lato server → paghi meno.

    Parametri usati: search_text, price_to (tetto prezzo), order=newest_first
    (l'annuncio più fresco = l'affare che sta per sparire). Il dominio dipende dal
    mercato (it/eu/fr/…).
    """
    dominio = config.VINTED_DOMINI.get(mercato, config.VINTED_DOMINI["it"])
    params: dict[str, str] = {
        "search_text": testo,
        "order": config.VINTED_ORDER,
    }
    if prezzo_max is not None:
        params["price_to"] = f"{prezzo_max:.0f}"
    return f"https://{dominio}/catalog?{urlencode(params)}"


# ----------------------------------------------------------------------------
# Chiamata Apify (Smart Scraper) — 1 run BATCH per tutti gli URL
# ----------------------------------------------------------------------------
_APIFY_RUN_URL = (
    "https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token={token}"
)


def _chiama_apify(urls: list[str]) -> list[dict]:
    """UNA run Apify per TUTTI gli URL Vinted → lista grezza di annunci.

    Solleva su errore → il chiamante decide (per l'MVP: nessun affare in questo giro).
    """
    if not config.apify_disponibile():
        raise RuntimeError("APIFY_TOKEN mancante: impossibile leggere Vinted.")

    actor = config.APIFY_VINTED_ACTOR.replace("/", "~")  # Apify vuole author~name
    url = _APIFY_RUN_URL.format(actor=actor, token=config.APIFY_TOKEN)

    # Smart Scraper: gli si passano gli URL da leggere e un limite risultati. Il
    # limite è la leva-costo: N_RISULTATI_PER_CARTA per ogni URL (newest_first).
    payload = {
        "startUrls": [{"url": u} for u in urls],
        "maxItems": config.N_RISULTATI_PER_CARTA * max(1, len(urls)),
    }
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=300) as resp:
        items = json.loads(resp.read().decode("utf-8", errors="replace"))
    return items if isinstance(items, list) else []


# ----------------------------------------------------------------------------
# Normalizzazione annuncio → formato stabile per il deal_finder
# ----------------------------------------------------------------------------
def _to_float(v) -> Optional[float]:
    try:
        return float(str(v).replace(",", ".").replace("€", "").strip())
    except (TypeError, ValueError):
        return None


def _normalizza(item: dict) -> Optional[dict]:
    """Mappa un annuncio grezzo Apify → dict stabile. Difensivo sui nomi-chiave."""
    prezzo = _to_float(
        item.get("price")
        or (item.get("price") or {}).get("amount") if isinstance(item.get("price"), dict)
        else item.get("price") or item.get("total_item_price")
    )
    item_id = str(item.get("id") or item.get("item_id") or item.get("itemId") or "").strip()
    url = item.get("url") or item.get("link") or ""
    if not item_id and url:
        # ultimo appiglio: l'id in coda all'URL Vinted (…/items/<id>-…)
        try:
            item_id = url.rstrip("/").split("/items/")[-1].split("-")[0]
        except Exception:
            item_id = ""
    if not item_id or prezzo is None:
        return None

    return {
        "item_id": item_id,
        "prezzo": prezzo,
        "titolo": (item.get("title") or item.get("name") or "").strip(),
        "condizione": (item.get("status") or item.get("condition") or "").strip(),
        "paese": (item.get("country") or item.get("country_code") or "").strip(),
        "venditore": (item.get("user_login") or (item.get("user") or {}).get("login") or "").strip()
        if isinstance(item.get("user"), (dict, str)) else "",
        "url": url,
    }


# ----------------------------------------------------------------------------
# Punto d'ingresso: cerca in BATCH per una lista di carte watchlist
# ----------------------------------------------------------------------------
def cerca_batch(carte: list[dict]) -> dict[str, list[dict]]:
    """Cerca su Vinted (1 run Apify batch) per una lista di carte watchlist.

    `carte`: lista di dict con almeno {codice, nome, prezzo_max?, paese}. Costruisce
    un URL per carta, li manda tutti in UN run, poi rimappa i risultati alla carta.

    Ritorna {codice: [annunci normalizzati]}. Su fallito Apify → tutto vuoto (nessun
    affare in questo giro), il bot non si ferma.
    """
    if not carte:
        return {}

    urls: list[str] = []
    url_per_carta: dict[str, str] = {}
    for c in carte:
        codice = c["codice"]
        # Testo di ricerca: nome + codice → mira alla carta specifica.
        testo = f"one piece {c.get('nome', '')} {codice}".strip()
        u = costruisci_url(testo, c.get("prezzo_max"), c.get("paese", "it"))
        urls.append(u)
        url_per_carta[codice] = u

    try:
        grezzi = _chiama_apify(urls)
    except Exception as e:
        print(f"[vinted_source] Apify fallito ({e}) → nessun affare in questo giro.")
        return {codice: [] for codice in url_per_carta}

    # Apify non sempre etichetta il risultato con l'URL sorgente. Se lo fa, lo usiamo
    # per rimappare alla carta; altrimenti facciamo match sul testo del titolo/codice.
    per_carta: dict[str, list[dict]] = {c["codice"]: [] for c in carte}
    for item in grezzi:
        norm = _normalizza(item)
        if not norm:
            continue
        sorgente = str(item.get("url_sorgente") or item.get("sourceUrl") or "")
        assegnata: Optional[str] = None
        for codice, u in url_per_carta.items():
            if sorgente and sorgente == u:
                assegnata = codice
                break
        if not assegnata:
            # Fallback: match del codice carta nel titolo dell'annuncio.
            titolo = norm["titolo"].upper()
            assegnata = next(
                (c["codice"] for c in carte if c["codice"].upper() in titolo),
                None,
            )
        if assegnata:
            per_carta[assegnata].append(norm)
    return per_carta

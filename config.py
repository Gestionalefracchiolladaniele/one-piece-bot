# -*- coding: utf-8 -*-
"""
Claupiece — Configurazione centralizzata.

Legge TUTTE le variabili d'ambiente in un unico posto. Se una variabile manca,
NON inventiamo un valore reale: usiamo un placeholder nel formato `__TODO_NOME__`
(tracciato in SETUP_TODO.md). Così il codice è importabile/leggibile anche senza
credenziali, ma fallisce in modo esplicito quando prova davvero a usarle.

Prodotto: Claupiece = tracker prezzi carte One Piece TCG. Monitora Vinted (caccia
affari) e lo confronta col prezzo di riferimento CardTrader; quando compare un
annuncio sottocosto su una carta della watchlist → notifica Telegram personale.
Uso PERSONALE (una watchlist, notifiche a te). Non multi-utente, non un SaaS.

Regola d'oro dei costi: i riferimenti cambiano lento → li leggi di rado (gratis).
Solo Vinted va letto spesso (ogni ora, dentro una finestra 6h) → unico costo, e
dimensionato per stare dentro il free tier Apify ($5/mese). Vedi REBRAND.md.

Commenti in italiano; interfaccia utente/notifiche in italiano.
"""

import os

# In locale carichiamo un eventuale .env (in CI/GitHub Actions si usano i secret).
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # python-dotenv assente o .env mancante: nessun problema, si usano le env reali.
    pass


def _env(nome: str) -> str:
    """Ritorna la env var, o un placeholder __TODO_NOME__ se assente.

    Il placeholder è volutamente NON un valore valido: se finisce in una chiamata
    reale (es. API), l'errore è evidente e rimanda a SETUP_TODO.md.
    """
    return os.environ.get(nome) or f"__TODO_{nome}__"


def manca(valore: str) -> bool:
    """True se il valore è ancora un placeholder (credenziale non configurata)."""
    return isinstance(valore, str) and valore.startswith("__TODO_")


# ============================================================================
# CREDENZIALI / SEGRETI  (tutti da env — mai hardcoded)
# ============================================================================

# --- Gemini (Google GenAI) — scoring a stelle degli affari, on-demand ---
GEMINI_API_KEY = _env("GEMINI_API_KEY")

# --- Supabase (backend con SERVICE ROLE KEY → bypassa RLS) ---
SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")

# --- Telegram (canale notifiche PERSONALE) ---
# TELEGRAM_CHAT_ID = il TUO chat id (dove arrivano gli alert affare).
TELEGRAM_BOT_TOKEN = _env("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = _env("TELEGRAM_CHAT_ID")

# URL della dashboard web (per il comando /app). Vuoto → il comando lo dice.
WEB_APP_URL = os.environ.get("WEB_APP_URL", "")

# --- Apify (Vinted via Smart Scraper) — l'unico costo, dentro il free tier ---
APIFY_TOKEN = _env("APIFY_TOKEN")
# Actor scelto: Smart Scraper (kazkn), pay-per-run+result. Avvio $0.020/run +
# $0.002/risultato. Vedi REBRAND.md per la matematica del budget (~$4.68/mese).
APIFY_VINTED_ACTOR = os.environ.get("APIFY_VINTED_ACTOR", "kazkn/smart-scraper")

# --- CardTrader (prezzo di riferimento, API ufficiale, gratis, 1×/giorno) ---
# OPZIONALE: l'API CardTrader va abilitata dal supporto. Se manca, si usa Cardmarket.
CARDTRADER_TOKEN = _env("CARDTRADER_TOKEN")
CARDTRADER_API_BASE = os.environ.get(
    "CARDTRADER_API_BASE", "https://api.cardtrader.com/api/v2"
)

# --- Cardmarket (prezzo di riferimento via Apify) — l'API ufficiale è inaccessibile ---
# Cardmarket non dà API pubblica → si legge via Apify come Vinted, ma a bassa frequenza
# (SETTIMANALE): i riferimenti cambiano lento, così il costo resta trascurabile
# (~4 avvii/mese ≈ $0.09). Usa lo STESSO APIFY_TOKEN. Actor generico Smart Scraper
# (legge la pagina prodotto Cardmarket e ne estrae il prezzo "from"/trend).
APIFY_CARDMARKET_ACTOR = os.environ.get("APIFY_CARDMARKET_ACTOR", "kazkn/smart-scraper")
# Dominio Cardmarket + gioco (per costruire gli URL prodotto).
CARDMARKET_BASE = os.environ.get("CARDMARKET_BASE", "https://www.cardmarket.com/en/OnePiece")

# --- tcgapi.dev — anagrafica carte + prezzi di mercato (TCGPlayer/USA, USD) ---
# Usata da tcgapi_source.py per DUE scopi: (1) anagrafica (nome/numero/set/immagine),
# (2) prezzi (market/median/low, in USD → mostrati anche in € come stima). Free tier
# = 100 richieste/GIORNO (paginate, quindi un set costa poche chiamate). Auth via
# header X-API-Key. Chiave dal formato `tcg_live_...` (registrati su tcgapi.dev).
TCGAPI_KEY = _env("TCGAPI_KEY")
TCGAPI_API_BASE = os.environ.get("TCGAPI_API_BASE", "https://api.tcgapi.dev/v1")
TCGAPI_GAME_SLUG = os.environ.get("TCGAPI_GAME_SLUG", "one-piece-card-game")
# Risultati per pagina nella ricerca: alto = meno chiamate (meno budget) per set interi.
TCGAPI_PER_PAGE = int(os.environ.get("TCGAPI_PER_PAGE", "100"))


def tcgapi_disponibile() -> bool:
    """True se tcgapi.dev è configurato (anagrafica + prezzi)."""
    return not manca(TCGAPI_KEY)


def apify_disponibile() -> bool:
    """True se Apify è configurato (serve per leggere Vinted)."""
    return not manca(APIFY_TOKEN)


def cardtrader_disponibile() -> bool:
    """True se CardTrader è configurato (prezzo di riferimento)."""
    return not manca(CARDTRADER_TOKEN)


# ============================================================================
# COSTANTI DI PRODOTTO  (NON sono segreti)
# ============================================================================

# --- Modello Gemini (scoring a stelle degli affari, on-demand) ---
# Lista in ordine di preferenza: si prova il primo, se dà 503/429 si passa al
# successivo. flash è più affidabile; il costo è trascurabile (poche chiamate).
MODELLI_SCORING = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
MODELLO_SCORING = MODELLI_SCORING[0]  # compat: primo della lista

# --- Anagrafica carte: punk-records (dataset statico su GitHub, €0) ---
# JSON raw versionato con TUTTE le carte One Piece (nome, codice, rarità, colore,
# tipo, immagini, tutte le lingue). Sincronizzato settimanale da card_database.py.
PUNK_RECORDS_BASE = os.environ.get(
    "PUNK_RECORDS_BASE",
    "https://raw.githubusercontent.com/buhbbl/punk-records/main",
)
# Lingua di default per l'anagrafica (le carte esistono in più lingue).
LINGUA_ANAGRAFICA = os.environ.get("LINGUA_ANAGRAFICA", "en")

# --- CardTrader: One Piece game (risolto a runtime da cardtrader.py) ---
CARDTRADER_GAME_NAME = os.environ.get("CARDTRADER_GAME_NAME", "one piece")

# ============================================================================
# FINESTRA ORARIA — l'ottimizzazione chiave del budget
# ----------------------------------------------------------------------------
# Il cron GitHub Actions gira OGNI ORA (0 * * * *), ma all'inizio di ogni run
# main.py controlla: "siamo nella finestra attiva?" Se no → esce subito, ZERO
# costo (nessuna chiamata Apify). Motivo: se dormi non compri l'affare → scrapare
# di notte è denaro sprecato e taglia gli avvii da 720 a 180/mese.
#
# Ora la finestra è a ORARI LIBERI: si scelgono ora d'INIZIO e ora di FINE (0–24),
# non più 3 preset fissi. Es. inizio=7, fine=13. Ore locali [inizio, fine).
# Gli orari veri vivono nel DB (tabella config: finestra_inizio/finestra_fine),
# modificabili da web app e dal comando Telegram /finestra. I preset restano solo
# come SCORCIATOIE (bottoni comodi), ma il valore effettivo sono i due numeri.
#
# ⚠️ BUDGET: più ore = più avvii Apify = più costo. ~6h ≈ 180 avvii/mese (dentro i
# $5 free). Allargare la finestra oltre ~6-7h rischia di sforare (vedi REBRAND.md).
# ============================================================================
FINESTRE_PRESET: dict[str, dict] = {
    "mattina":    {"emoji": "🌅", "label": "Mattina",    "inizio": 6,  "fine": 12},
    "pomeriggio": {"emoji": "🔆", "label": "Pomeriggio", "inizio": 12, "fine": 18},
    "sera":       {"emoji": "🌙", "label": "Sera",       "inizio": 18, "fine": 24},
}

# Timezone di riferimento per valutare la finestra (uso personale → un solo fuso).
TIMEZONE = os.environ.get("TIMEZONE", "Europe/Rome")

# Orari di default se il DB non ha ancora una config (sovrascrivibili da env).
FINESTRA_INIZIO_DEFAULT = int(os.environ.get("FINESTRA_INIZIO", "18"))
FINESTRA_FINE_DEFAULT = int(os.environ.get("FINESTRA_FINE", "24"))


def finestra_attiva(ora_locale: int, inizio: int | None = None,
                    fine: int | None = None) -> bool:
    """True se l'ora locale (0-23) cade nella finestra [inizio, fine).

    Passa `inizio`/`fine` dal DB (config); se assenti usa i default. Gestisce anche
    finestre a cavallo della mezzanotte (inizio > fine, es. 22 → 4).
    """
    i = FINESTRA_INIZIO_DEFAULT if inizio is None else int(inizio)
    f = FINESTRA_FINE_DEFAULT if fine is None else int(fine)
    if i == f:
        return False  # finestra vuota = mai attiva
    if i < f:
        return i <= ora_locale < f
    # finestra a cavallo della mezzanotte (es. 22 → 4)
    return ora_locale >= i or ora_locale < f


# ============================================================================
# REGOLE WATCHLIST (i tipi di regola che decidono "è un affare?")
# ----------------------------------------------------------------------------
# Ogni carta in watchlist ha (regola_tipo, regola_valore). Il deal_finder li usa
# per decidere se un annuncio Vinted è un affare rispetto al prezzo di riferimento.
# ============================================================================
REGOLE = {
    "prezzo_max":  "notifica se il prezzo Vinted è ≤ regola_valore (in €)",
    "perc_sconto": "notifica se lo sconto sul riferimento è ≥ regola_valore (%)",
    "ogni_annuncio": "notifica ogni nuovo annuncio (regola_valore ignorato)",
}

# Priorità watchlist (per ordinare/urgenza; puramente informativa per ora).
PRIORITA = ["vip", "normale", "bassa"]

# ============================================================================
# PARAMETRI COSTO VINTED (Apify) — TARATI sul free tier ($5/mese)
# ----------------------------------------------------------------------------
# Config VERIFICATA (vedi REBRAND.md "Costi"):
#   3 carte · 1 risultato/carta (newest_first) · finestra 6h · ogni ora
#   → 1 run BATCH (tutte le carte insieme) · lordo ~$4.68/mese · dentro i $5 free.
# NON alzare N_RISULTATI_PER_CARTA o allargare la finestra senza rifare i conti:
# l'AVVIO ($0.02/run) è il killer del budget, non i risultati.
# ============================================================================
N_RISULTATI_PER_CARTA = 1          # newest_first → l'annuncio più recente in target
VINTED_ORDER = "newest_first"      # ordina per più recenti (l'affare fresco)
VINTED_MARKET_DEFAULT = "it"       # mercato di default (it | eu) per carta
# Mappa mercato → dominio Vinted (per costruire gli URL di ricerca).
VINTED_DOMINI = {
    "it": "www.vinted.it",
    "eu": "www.vinted.com",
    "fr": "www.vinted.fr",
    "de": "www.vinted.de",
    "es": "www.vinted.es",
}

# Valuta di riferimento (CardTrader restituisce cents in EUR di solito).
VALUTA = "EUR"

# Cambio USD→EUR di fallback se il feed gratuito non risponde (vedi tcgapi_source).
# I prezzi tcgapi.dev sono in USD (mercato USA): li mostriamo anche in € come stima.
CAMBIO_USD_EUR_FALLBACK = float(os.environ.get("CAMBIO_USD_EUR_FALLBACK", "0.92"))

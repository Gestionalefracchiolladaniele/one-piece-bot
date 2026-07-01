# -*- coding: utf-8 -*-
"""
Claupiece — Verifica connessioni (diagnostica pre-avvio).

Controlla che le credenziali nel .env funzionino DAVVERO, senza far girare tutto il
bot. Per ogni servizio dice ✅ / ❌ e il perché. Non modifica nulla (solo letture).

Esecuzione: `python test_connessioni.py`
"""

import json
import urllib.request

import config


def _riga(nome: str, ok: bool, dettaglio: str = "") -> None:
    stato = "✅" if ok else "❌"
    print(f"{stato} {nome}" + (f" — {dettaglio}" if dettaglio else ""))


def check_env() -> None:
    print("\n== 1. Variabili d'ambiente ==")
    obbligatorie = {
        "SUPABASE_URL": config.SUPABASE_URL,
        "SUPABASE_SERVICE_ROLE_KEY": config.SUPABASE_SERVICE_ROLE_KEY,
        "TELEGRAM_BOT_TOKEN": config.TELEGRAM_BOT_TOKEN,
        "TELEGRAM_CHAT_ID": config.TELEGRAM_CHAT_ID,
        "APIFY_TOKEN": config.APIFY_TOKEN,
    }
    for nome, val in obbligatorie.items():
        _riga(nome, not config.manca(val), "manca (placeholder __TODO_)" if config.manca(val) else "presente")
    # Opzionali
    _riga("GEMINI_API_KEY (opz.)", not config.manca(config.GEMINI_API_KEY),
          "assente → scoring euristico" if config.manca(config.GEMINI_API_KEY) else "presente")
    _riga("CARDTRADER_TOKEN (opz.)", not config.manca(config.CARDTRADER_TOKEN),
          "assente → riferimento da Cardmarket" if config.manca(config.CARDTRADER_TOKEN) else "presente")


def check_supabase() -> None:
    print("\n== 2. Supabase (DB + tabelle) ==")
    try:
        import db
        # Una lettura leggera su ogni tabella chiave → verifica schema + service role.
        for tabella, fn in [
            ("watchlist", db.watchlist_tutta),
            ("carte", lambda: db.cerca_carte("a", 1)),
            ("config", db.get_config),
            ("affari", lambda: db.ultimi_affari(1)),
        ]:
            try:
                fn()
                _riga(f"tabella '{tabella}'", True, "raggiungibile")
            except Exception as e:
                _riga(f"tabella '{tabella}'", False, str(e)[:80])
    except Exception as e:
        _riga("connessione Supabase", False, str(e)[:100])


def check_telegram() -> None:
    print("\n== 3. Telegram (bot + chat) ==")
    if config.manca(config.TELEGRAM_BOT_TOKEN):
        _riga("bot", False, "TELEGRAM_BOT_TOKEN mancante")
        return
    try:
        url = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/getMe"
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read())
        nome = data.get("result", {}).get("username", "?")
        _riga("bot", data.get("ok", False), f"@{nome}")
    except Exception as e:
        _riga("bot", False, str(e)[:80])

    # Prova a mandare un messaggio di test al chat id (conferma anche il chat id giusto).
    if not config.manca(config.TELEGRAM_CHAT_ID):
        try:
            payload = json.dumps({
                "chat_id": config.TELEGRAM_CHAT_ID,
                "text": "✅ Claupiece: test connessione riuscito.",
            }).encode()
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
                data=payload, headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as r:
                ok = json.loads(r.read()).get("ok", False)
            _riga("messaggio di test", ok, "controlla Telegram: dovrebbe esserti arrivato")
        except Exception as e:
            _riga("messaggio di test", False, str(e)[:80] + " (chat id giusto? hai scritto al bot?)")


def check_apify() -> None:
    print("\n== 4. Apify (token valido) ==")
    if config.manca(config.APIFY_TOKEN):
        _riga("token", False, "APIFY_TOKEN mancante")
        return
    try:
        url = f"https://api.apify.com/v2/users/me?token={config.APIFY_TOKEN}"
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read())
        u = data.get("data", {})
        _riga("token", True, f"utente {u.get('username', '?')}")
    except Exception as e:
        _riga("token", False, str(e)[:80])


def main() -> None:
    print("🏴‍☠️ Claupiece — verifica connessioni\n" + "=" * 40)
    check_env()
    check_supabase()
    check_telegram()
    check_apify()
    print("\n" + "=" * 40)
    print("Fatto. Le righe ✅ sono a posto; sistema le ❌ prima di avviare.")


if __name__ == "__main__":
    main()

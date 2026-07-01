'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Affare, AppConfig, Carta, Watch } from '@/lib/types';

// ── Scorciatoie finestra (bottoni comodi); il valore vero sono ora inizio/fine ──
const PRESET_FINESTRA: { emoji: string; label: string; inizio: number; fine: number }[] = [
  { emoji: '🌅', label: 'Mattina', inizio: 6, fine: 12 },
  { emoji: '🔆', label: 'Pomeriggio', inizio: 12, fine: 18 },
  { emoji: '🌙', label: 'Sera', inizio: 18, fine: 24 },
];

const ORE = Array.from({ length: 25 }, (_, i) => i); // 0..24

const REGOLE: { key: Watch['regola_tipo']; label: string }[] = [
  { key: 'prezzo_max', label: 'Prezzo max (€)' },
  { key: 'perc_sconto', label: '% sconto min (serve CardTrader)' },
  { key: 'ogni_annuncio', label: 'Ogni annuncio' },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'errore');
  return j as T;
}

function stelle(n: number | null): string {
  return '⭐'.repeat(Math.max(0, Math.min(5, n ?? 0)));
}

export default function Home() {
  const [watchlist, setWatchlist] = useState<Watch[]>([]);
  const [affari, setAffari] = useState<Affare[]>([]);
  const [inizio, setInizio] = useState(18);
  const [fine, setFine] = useState(24);
  const [inPausa, setInPausa] = useState(false);
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<Carta[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const ricarica = useCallback(async () => {
    try {
      const [w, d, c] = await Promise.all([
        api<{ watchlist: Watch[] }>('/api/watchlist'),
        api<{ affari: Affare[] }>('/api/deals?limit=30'),
        api<{ config: AppConfig }>('/api/config'),
      ]);
      setWatchlist(w.watchlist);
      setAffari(d.affari);
      if (c.config) {
        if (c.config.finestra_inizio != null) setInizio(c.config.finestra_inizio);
        if (c.config.finestra_fine != null) setFine(c.config.finestra_fine);
        setInPausa(!!c.config.in_pausa);
      }
      setErrore(null);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => {
    ricarica();
  }, [ricarica]);

  // Ricerca carte (debounce leggero)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setRisultati([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { carte } = await api<{ carte: Carta[] }>(`/api/cards?q=${encodeURIComponent(q)}`);
        setRisultati(carte);
      } catch {
        setRisultati([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function aggiungi(codice: string) {
    await api('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice }),
    });
    setQuery('');
    setRisultati([]);
    ricarica();
  }

  async function aggiornaWatch(codice: string, campi: Partial<Watch>) {
    await api('/api/watchlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, ...campi }),
    });
    ricarica();
  }

  async function rimuovi(codice: string) {
    await api(`/api/watchlist?codice=${encodeURIComponent(codice)}`, { method: 'DELETE' });
    ricarica();
  }

  async function salvaFinestra(nuovoInizio: number, nuovaFine: number) {
    setInizio(nuovoInizio);
    setFine(nuovaFine);
    await api('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finestra_inizio: nuovoInizio, finestra_fine: nuovaFine }),
    });
  }

  async function togglePausa() {
    const nuovo = !inPausa;
    setInPausa(nuovo);
    await api('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ in_pausa: nuovo }),
    });
  }

  // durata finestra (gestisce il cavallo di mezzanotte) → avviso costi
  const durata = fine >= inizio ? fine - inizio : 24 - inizio + fine;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 80px' }}>
      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 6vw, 52px)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Claupiece 🏴‍☠️
        </h1>
        <p style={{ color: 'var(--text-mid)', maxWidth: 520, margin: '10px auto 0' }}>
          Monitora le carte One Piece TCG. Quando su Vinted compare un affare sotto il
          prezzo di riferimento, ti arriva un alert su Telegram.
        </p>
      </header>

      {errore && (
        <div className="card" style={{ padding: 16, marginBottom: 20, borderColor: 'rgba(239,68,68,0.4)' }}>
          <span style={{ color: 'var(--alert)' }}>Errore: {errore}</span>
        </div>
      )}

      {/* Finestra oraria (orari liberi) */}
      <section className="card" style={{ padding: 20, marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ ...sezioneTitolo, color: 'var(--on-card-high)', margin: 0 }}>
            🕕 Finestra di caccia
          </h2>
          <button className={inPausa ? 'btn btn-accent btn-sm' : 'btn btn-danger btn-sm'} onClick={togglePausa}>
            {inPausa ? '▶️ Riprendi notifiche' : '⏸️ Pausa notifiche'}
          </button>
        </div>

        {/* orari liberi */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <span style={{ color: 'var(--on-card-mid)', fontSize: 14 }}>Dalle</span>
          <select
            className="field"
            style={{ maxWidth: 100 }}
            value={inizio}
            onChange={(e) => salvaFinestra(Number(e.target.value), fine)}
          >
            {ORE.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <span style={{ color: 'var(--on-card-mid)', fontSize: 14 }}>alle</span>
          <select
            className="field"
            style={{ maxWidth: 100 }}
            value={fine}
            onChange={(e) => salvaFinestra(inizio, Number(e.target.value))}
          >
            {ORE.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <span
            className="badge"
            style={durata > 7 ? { background: 'rgba(239,68,68,0.12)', color: 'var(--alert)' } : undefined}
          >
            {durata}h {durata > 7 ? '· occhio ai costi' : ''}
          </span>
        </div>

        {/* scorciatoie preset */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {PRESET_FINESTRA.map((p) => {
            const attivo = p.inizio === inizio && p.fine === fine;
            return (
              <button
                key={p.label}
                onClick={() => salvaFinestra(p.inizio, p.fine)}
                className={attivo ? 'btn btn-accent btn-sm' : 'btn btn-sm'}
                style={attivo ? undefined : { background: '#f0ecfa', color: 'var(--accent-strong)' }}
              >
                {p.emoji} {p.label}
              </button>
            );
          })}
        </div>

        <p style={{ color: 'var(--on-card-low)', fontSize: 12, marginTop: 10 }}>
          Il bot legge Vinted solo dentro questa finestra (fuori → zero costi). Più ore =
          più costo Apify: consigliate ~6h.
        </p>
      </section>

      {/* Aggiungi carta */}
      <section className="card" style={{ padding: 20, marginBottom: 28 }}>
        <h2 style={{ ...sezioneTitolo, color: 'var(--on-card-high)' }}>➕ Aggiungi una carta</h2>
        <input
          className="field"
          placeholder="Cerca per nome o codice (es. Shanks, OP01-120)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {risultati.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
            {risultati.map((c) => (
              <li
                key={c.codice}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <span style={{ color: 'var(--on-card-mid)' }}>
                  <strong style={{ color: 'var(--on-card-high)' }}>{c.nome || c.codice}</strong>{' '}
                  <span style={{ fontSize: 12 }}>· {c.codice}{c.set ? ` · ${c.set}` : ''}</span>
                </span>
                <button className="btn btn-accent btn-sm" onClick={() => aggiungi(c.codice)}>
                  Aggiungi
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Watchlist */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={sezioneTitolo}>👀 Watchlist ({watchlist.length})</h2>
        {caricando ? (
          <p style={{ color: 'var(--text-low)' }}>Carico…</p>
        ) : watchlist.length === 0 ? (
          <div className="card" style={{ padding: 20, color: 'var(--on-card-mid)' }}>
            Nessuna carta monitorata. Aggiungine una qui sopra.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {watchlist.map((w) => (
              <div key={w.codice} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {w.carta?.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.carta.immagine_url}
                      alt={w.carta.nome}
                      width={44}
                      height={62}
                      style={{ borderRadius: 6, objectFit: 'cover' }}
                    />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ color: 'var(--on-card-high)', fontWeight: 600 }}>
                      {w.carta?.nome || w.codice}
                    </div>
                    <div style={{ color: 'var(--on-card-low)', fontSize: 12 }}>
                      {w.codice}
                      {w.carta?.set ? ` · ${w.carta.set}` : ''}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--on-card-mid)' }}>
                    <input
                      type="checkbox"
                      checked={w.attiva}
                      onChange={(e) => aggiornaWatch(w.codice, { attiva: e.target.checked })}
                    />
                    Attiva
                  </label>
                  <button className="btn btn-danger btn-sm" onClick={() => rimuovi(w.codice)}>
                    Rimuovi
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <select
                    className="field"
                    style={{ maxWidth: 190 }}
                    value={w.regola_tipo}
                    onChange={(e) =>
                      aggiornaWatch(w.codice, { regola_tipo: e.target.value as Watch['regola_tipo'] })
                    }
                  >
                    {REGOLE.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {w.regola_tipo !== 'ogni_annuncio' && (
                    <input
                      className="field"
                      style={{ maxWidth: 120 }}
                      type="number"
                      value={w.regola_valore}
                      onChange={(e) =>
                        aggiornaWatch(w.codice, { regola_valore: Number(e.target.value) })
                      }
                    />
                  )}
                  <select
                    className="field"
                    style={{ maxWidth: 110 }}
                    value={w.paese}
                    onChange={(e) => aggiornaWatch(w.codice, { paese: e.target.value })}
                  >
                    <option value="it">🇮🇹 IT</option>
                    <option value="eu">🇪🇺 EU</option>
                  </select>
                  <select
                    className="field"
                    style={{ maxWidth: 130 }}
                    value={w.priorita}
                    onChange={(e) => aggiornaWatch(w.codice, { priorita: e.target.value as Watch['priorita'] })}
                  >
                    <option value="vip">⭐ VIP</option>
                    <option value="normale">Normale</option>
                    <option value="bassa">Bassa</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ultimi affari */}
      <section>
        <h2 style={sezioneTitolo}>🚨 Ultimi affari</h2>
        {affari.length === 0 ? (
          <div className="card" style={{ padding: 20, color: 'var(--on-card-mid)' }}>
            Ancora nessun affare. Appariranno qui (e su Telegram) appena il bot ne trova uno.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {affari.map((a) => (
              <div key={a.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: 'var(--on-card-high)', fontWeight: 600 }}>
                      {a.titolo || a.codice}
                    </div>
                    <div style={{ color: 'var(--on-card-mid)', fontSize: 13, marginTop: 2 }}>
                      Vinted <strong>{a.prezzo_vinted}€</strong>
                      {a.prezzo_riferimento != null && (
                        <>
                          {' '}vs rif. {a.prezzo_riferimento}€
                          {a.sconto_perc != null && (
                            <span style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>
                              {' '}(-{Math.round(a.sconto_perc)}%)
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {a.score_motivo && (
                      <div style={{ color: 'var(--on-card-low)', fontSize: 12, marginTop: 4 }}>
                        {a.score_motivo}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15 }}>{stelle(a.score_stelle)}</div>
                    {a.url_annuncio && (
                      <a
                        className="btn btn-accent btn-sm"
                        href={a.url_annuncio}
                        target="_blank"
                        rel="noreferrer"
                        style={{ marginTop: 6 }}
                      >
                        Apri annuncio
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const sezioneTitolo: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  margin: '0 0 12px',
  color: 'var(--text-high)',
};

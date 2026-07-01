'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Affare, AppConfig, Carta, TotaleCollezione, VoceCollezione, Watch } from '@/lib/types';

// ── Scorciatoie finestra (bottoni comodi); il valore vero sono ora inizio/fine ──
const PRESET_FINESTRA: { emoji: string; label: string; inizio: number; fine: number }[] = [
  { emoji: '🌅', label: 'Mattina', inizio: 6, fine: 12 },
  { emoji: '🔆', label: 'Pomeriggio', inizio: 12, fine: 18 },
  { emoji: '🌙', label: 'Sera', inizio: 18, fine: 24 },
];

const ORE = Array.from({ length: 25 }, (_, i) => i); // 0..24

// Carta dalla ricerca live tcgapi (con prezzo) — rispecchia /api/cards?live=1.
type CartaLive = {
  codice: string;
  nome: string;
  set: string;
  rarita: string;
  tipo: string;
  immagine_url: string;
  prezzo_usd: number | null;
  prezzo_eur: number | null;
};

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
  const [collezione, setCollezione] = useState<VoceCollezione[]>([]);
  const [totale, setTotale] = useState<TotaleCollezione>({ pezzi: 0, usd: 0, eur: 0 });
  const [queryColl, setQueryColl] = useState('');
  // Risultati LIVE da tcgapi: carte con prezzo (anche non ancora in DB).
  const [risultatiColl, setRisultatiColl] = useState<CartaLive[]>([]);
  const [cercandoColl, setCercandoColl] = useState(false);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const ricarica = useCallback(async () => {
    try {
      const [w, d, c, col] = await Promise.all([
        api<{ watchlist: Watch[] }>('/api/watchlist'),
        api<{ affari: Affare[] }>('/api/deals?limit=30'),
        api<{ config: AppConfig }>('/api/config'),
        api<{ collezione: VoceCollezione[]; totale: TotaleCollezione }>('/api/collezione'),
      ]);
      setWatchlist(w.watchlist);
      setAffari(d.affari);
      setCollezione(col.collezione);
      setTotale(col.totale);
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

  // Ricerca LIVE su tcgapi per la collezione: mostra carte reali con prezzo, anche
  // quelle non ancora in DB (verranno salvate al click). Debounce un po' più lungo
  // per non sprecare il budget richieste di tcgapi (100/giorno).
  useEffect(() => {
    const q = queryColl.trim();
    if (!q) {
      setRisultatiColl([]);
      setCercandoColl(false);
      return;
    }
    setCercandoColl(true);
    const t = setTimeout(async () => {
      try {
        const { carte } = await api<{ carte: CartaLive[] }>(
          `/api/cards?live=1&q=${encodeURIComponent(q)}`,
        );
        setRisultatiColl(carte);
      } catch {
        setRisultatiColl([]);
      } finally {
        setCercandoColl(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [queryColl]);

  async function aggiungiColl(codice: string) {
    await api('/api/collezione', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice }),
    });
    setQueryColl('');
    setRisultatiColl([]);
    ricarica();
  }

  async function aggiornaColl(codice: string, campi: Partial<VoceCollezione>) {
    await api('/api/collezione', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, ...campi }),
    });
    ricarica();
  }

  async function rimuoviColl(codice: string) {
    await api(`/api/collezione?codice=${encodeURIComponent(codice)}`, { method: 'DELETE' });
    ricarica();
  }

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
    <main className="mx-auto max-w-[900px] px-4 pt-8 pb-16 sm:px-5 sm:pt-10 sm:pb-20">
      {/* Header */}
      <header className="mb-7 text-center">
        <h1
          className="m-0 font-display text-[clamp(30px,9vw,52px)] tracking-tight"
        >
          Claupiece 🏴‍☠️
        </h1>
        <p className="mx-auto mt-2.5 max-w-[520px] text-sm text-text-mid sm:text-base">
          Monitora le carte One Piece TCG. Quando su Vinted compare un affare sotto il
          prezzo di riferimento, ti arriva un alert su Telegram.
        </p>
      </header>

      {errore && (
        <div className="card mb-5 p-4" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <span style={{ color: 'var(--alert)' }}>Errore: {errore}</span>
        </div>
      )}

      {/* Finestra oraria (orari liberi) */}
      <section className="card mb-7 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="m-0 font-display text-base text-on-card-high sm:text-lg">
            🕕 Finestra di caccia
          </h2>
          <button
            className={`btn btn-sm w-full sm:w-auto ${inPausa ? 'btn-accent' : 'btn-danger'}`}
            onClick={togglePausa}
          >
            {inPausa ? '▶️ Riprendi notifiche' : '⏸️ Pausa notifiche'}
          </button>
        </div>

        {/* orari liberi */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <div className="flex flex-1 items-center gap-2.5 sm:flex-none">
            <span className="text-sm text-on-card-mid">Dalle</span>
            <select
              className="field flex-1 sm:w-auto sm:max-w-[100px]"
              value={inizio}
              onChange={(e) => salvaFinestra(Number(e.target.value), fine)}
            >
              {ORE.map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <span className="text-sm text-on-card-mid">alle</span>
            <select
              className="field flex-1 sm:w-auto sm:max-w-[100px]"
              value={fine}
              onChange={(e) => salvaFinestra(inizio, Number(e.target.value))}
            >
              {ORE.map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <span
            className="badge"
            style={durata > 7 ? { background: 'rgba(239,68,68,0.12)', color: 'var(--alert)' } : undefined}
          >
            {durata}h {durata > 7 ? '· occhio ai costi' : ''}
          </span>
        </div>

        {/* scorciatoie preset */}
        <div className="mt-3 flex flex-wrap gap-2">
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

        <p className="mt-2.5 text-xs text-on-card-low">
          Il bot legge Vinted solo dentro questa finestra (fuori → zero costi). Più ore =
          più costo Apify: consigliate ~6h.
        </p>
      </section>

      {/* Aggiungi carta */}
      <section className="card mb-7 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base text-on-card-high sm:text-lg">➕ Aggiungi una carta</h2>
        <input
          className="field"
          placeholder="Cerca per nome o codice (es. Shanks, OP01-120)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {risultati.length > 0 && (
          <ul className="mt-3 grid list-none gap-2 p-0">
            {risultati.map((c) => (
              <li
                key={c.codice}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-card px-2.5 py-2"
              >
                <span className="text-on-card-mid">
                  <strong className="text-on-card-high">{c.nome || c.codice}</strong>{' '}
                  <span className="text-xs">· {c.codice}{c.set ? ` · ${c.set}` : ''}</span>
                </span>
                <button className="btn btn-accent btn-sm w-full sm:w-auto" onClick={() => aggiungi(c.codice)}>
                  Aggiungi
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Watchlist */}
      <section className="mb-7">
        <h2 className="mb-3 font-display text-lg text-text-high">👀 Watchlist ({watchlist.length})</h2>
        {caricando ? (
          <p className="text-text-low">Carico…</p>
        ) : watchlist.length === 0 ? (
          <div className="card p-5 text-on-card-mid">
            Nessuna carta monitorata. Aggiungine una qui sopra.
          </div>
        ) : (
          <div className="grid gap-3">
            {watchlist.map((w) => (
              <div key={w.codice} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {w.carta?.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.carta.immagine_url}
                      alt={w.carta.nome}
                      width={44}
                      height={62}
                      className="rounded-md object-cover"
                    />
                  ) : null}
                  <div className="min-w-[140px] flex-1">
                    <div className="font-semibold text-on-card-high">
                      {w.carta?.nome || w.codice}
                    </div>
                    <div className="text-xs text-on-card-low">
                      {w.codice}
                      {w.carta?.set ? ` · ${w.carta.set}` : ''}
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                    <label className="flex items-center gap-1.5 text-sm text-on-card-mid">
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
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <select
                    className="field col-span-2 sm:max-w-[190px]"
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
                      className="field sm:max-w-[120px]"
                      type="number"
                      value={w.regola_valore}
                      onChange={(e) =>
                        aggiornaWatch(w.codice, { regola_valore: Number(e.target.value) })
                      }
                    />
                  )}
                  <select
                    className="field sm:max-w-[110px]"
                    value={w.paese}
                    onChange={(e) => aggiornaWatch(w.codice, { paese: e.target.value })}
                  >
                    <option value="it">🇮🇹 IT</option>
                    <option value="eu">🇪🇺 EU</option>
                  </select>
                  <select
                    className="field sm:max-w-[130px]"
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

      {/* Collezione — il raccoglitore */}
      <section className="mb-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-text-high">📚 La mia collezione ({collezione.length})</h2>
          {totale.pezzi > 0 && (
            <span className="badge text-sm">
              {totale.pezzi} pezzi · <strong>${totale.usd.toFixed(2)}</strong> (~{totale.eur.toFixed(2)}€)
            </span>
          )}
        </div>

        {/* Aggiungi alla collezione */}
        <div className="card mb-4 mt-3 p-4 sm:p-5">
          <input
            className="field"
            placeholder="Cerca una carta per nome (es. Zoro) o codice (es. OP01-025)…"
            value={queryColl}
            onChange={(e) => setQueryColl(e.target.value)}
          />
          {cercandoColl && (
            <p className="mt-2.5 text-[13px] text-on-card-low">Cerco…</p>
          )}
          {!cercandoColl && queryColl.trim() && risultatiColl.length === 0 && (
            <p className="mt-2.5 text-[13px] text-on-card-low">
              Nessuna carta trovata.
            </p>
          )}
          {risultatiColl.length > 0 && (
            <ul className="mt-3 grid list-none gap-2 p-0">
              {risultatiColl.map((c) => (
                <li
                  key={`${c.codice}-${c.nome}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-card px-2.5 py-2"
                >
                  <span className="flex items-center gap-2.5 text-on-card-mid">
                    {c.immagine_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.immagine_url} alt={c.nome} width={30} height={42} className="rounded object-cover" />
                    ) : null}
                    <span>
                      <strong className="text-on-card-high">{c.nome || c.codice}</strong>{' '}
                      <span className="text-xs">· {c.codice}{c.set ? ` · ${c.set}` : ''}</span>
                      {c.prezzo_usd != null && (
                        <span className="block text-xs text-on-card-low">
                          ${c.prezzo_usd.toFixed(2)} (~{c.prezzo_eur?.toFixed(2)}€)
                        </span>
                      )}
                    </span>
                  </span>
                  <button className="btn btn-accent btn-sm w-full sm:w-auto" onClick={() => aggiungiColl(c.codice)}>
                    + Colleziona
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {collezione.length === 0 ? (
          <div className="card p-5 text-on-card-mid">
            La collezione è vuota. Cerca una carta qui sopra e aggiungila: il valore stimato
            (mercato USA, in € indicativo) apparirà accanto.
          </div>
        ) : (
          <div className="grid gap-3">
            {collezione.map((v) => (
              <div key={v.codice} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {v.carta?.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.carta.immagine_url}
                      alt={v.carta.nome}
                      width={44}
                      height={62}
                      className="rounded-md object-cover"
                    />
                  ) : null}
                  <div className="min-w-[140px] flex-1">
                    <div className="font-semibold text-on-card-high">
                      {v.carta?.nome || v.codice}
                    </div>
                    <div className="text-xs text-on-card-low">
                      {v.codice}
                      {v.carta?.set ? ` · ${v.carta.set}` : ''}
                    </div>
                  </div>

                  <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-start">
                    <label className="flex items-center gap-1.5 text-sm text-on-card-mid">
                      Quantità
                      <input
                        className="field w-[72px]"
                        type="number"
                        min={1}
                        value={v.quantita}
                        onChange={(e) => aggiornaColl(v.codice, { quantita: Math.max(1, Number(e.target.value)) })}
                      />
                    </label>

                    <div className="text-right sm:min-w-[120px]">
                      {v.prezzo_usd != null ? (
                        <>
                          <div className="font-semibold text-on-card-high">
                            ${v.valore_usd?.toFixed(2)}{' '}
                            <span className="text-[13px] font-normal text-on-card-mid">
                              (~{v.valore_eur?.toFixed(2)}€)
                            </span>
                          </div>
                          <div className="text-[11px] text-on-card-low">
                            ${v.prezzo_usd.toFixed(2)}/pz · stima mercato USA
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-on-card-low">prezzo —</span>
                      )}
                    </div>
                  </div>

                  <button className="btn btn-danger btn-sm w-full sm:w-auto" onClick={() => rimuoviColl(v.codice)}>
                    Rimuovi
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ultimi affari */}
      <section>
        <h2 className="mb-3 font-display text-lg text-text-high">🚨 Ultimi affari</h2>
        {affari.length === 0 ? (
          <div className="card p-5 text-on-card-mid">
            Ancora nessun affare. Appariranno qui (e su Telegram) appena il bot ne trova uno.
          </div>
        ) : (
          <div className="grid gap-3">
            {affari.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-on-card-high">
                      {a.titolo || a.codice}
                    </div>
                    <div className="mt-0.5 text-[13px] text-on-card-mid">
                      Vinted <strong>{a.prezzo_vinted}€</strong>
                      {a.prezzo_riferimento != null && (
                        <>
                          {' '}vs rif. {a.prezzo_riferimento}€
                          {a.sconto_perc != null && (
                            <span className="font-semibold" style={{ color: 'var(--accent-strong)' }}>
                              {' '}(-{Math.round(a.sconto_perc)}%)
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {a.score_motivo && (
                      <div className="mt-1 text-xs text-on-card-low">
                        {a.score_motivo}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:text-right">
                    <div className="text-[15px]">{stelle(a.score_stelle)}</div>
                    {a.url_annuncio && (
                      <a
                        className="btn btn-accent btn-sm sm:mt-1.5"
                        href={a.url_annuncio}
                        target="_blank"
                        rel="noreferrer"
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

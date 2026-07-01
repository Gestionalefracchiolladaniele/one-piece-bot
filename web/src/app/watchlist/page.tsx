'use client';

import { useEffect, useState } from 'react';
import { useClaupiece, type CartaLive } from '@/lib/useClaupiece';
import type { Watch } from '@/lib/types';

const REGOLE: { key: Watch['regola_tipo']; label: string }[] = [
  { key: 'prezzo_max', label: 'Prezzo max (€)' },
  { key: 'perc_sconto', label: '% sconto min (serve CardTrader)' },
  { key: 'ogni_annuncio', label: 'Ogni annuncio' },
];

export default function WatchlistPage() {
  const c = useClaupiece();
  const { cercaLive } = c;
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<CartaLive[]>([]);
  const [cercando, setCercando] = useState(false);

  // Ricerca LIVE su tcgapi (come la collezione): il DB `carte` è vuoto finché non
  // aggiungi qualcosa, quindi la ricerca dev'essere live. Al POST la carta viene
  // salvata in anagrafica. Dipende SOLO da cercaLive (stabile), NON dall'oggetto `c`.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setRisultati([]); setCercando(false); return; }
    setCercando(true);
    const t = setTimeout(async () => {
      try { setRisultati(await cercaLive(q)); }
      catch { setRisultati([]); }
      finally { setCercando(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [query, cercaLive]);

  return (
    <main className="mx-auto max-w-[960px] px-4 pt-6 pb-16 sm:px-5 sm:pt-8">
      <header className="mb-6">
        <h1 className="m-0 font-display text-[clamp(24px,6vw,36px)] tracking-tight">👀 Watchlist</h1>
        <p className="mt-1.5 max-w-[560px] text-sm text-text-mid">
          Le carte che il bot monitora su Vinted. Per ognuna imposti la <strong>regola</strong>
          (quando è un affare), il paese e la priorità.
        </p>
      </header>

      {c.errore && (
        <div className="card mb-5 p-3.5 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: 'var(--alert)' }}>
          Errore: {c.errore}
        </div>
      )}

      {/* Aggiungi carta */}
      <section className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-1 font-display text-base text-on-card-high sm:text-lg">➕ Aggiungi una carta</h2>
        <p className="mb-3 text-xs text-on-card-low">
          Cerca per <strong>nome</strong> (es. Shanks, Luffy). La carta viene salvata in
          anagrafica quando la aggiungi.
        </p>
        <input
          className="field"
          placeholder="Cerca per nome (es. Shanks, Luffy)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {cercando && <p className="mt-2.5 text-[13px] text-on-card-low">Cerco…</p>}
        {!cercando && query.trim().length >= 2 && risultati.length === 0 && (
          <p className="mt-2.5 text-[13px] text-on-card-low">Nessuna carta trovata per “{query.trim()}”.</p>
        )}
        {risultati.length > 0 && (
          <ul className="mt-3 grid list-none gap-2 p-0">
            {risultati.map((card) => (
              <li key={`${card.codice}-${card.nome}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-card p-2.5">
                <span className="flex min-w-0 flex-1 items-center gap-2.5 text-on-card-mid">
                  {card.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.immagine_url} alt={card.nome} width={38} height={53} className="shrink-0 rounded object-cover" />
                  ) : null}
                  <span className="min-w-0">
                    <strong className="block truncate text-on-card-high">{card.nome || card.codice}</strong>
                    <span className="block text-xs text-on-card-mid">{card.codice}{card.set ? ` · ${card.set}` : ''}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {card.rarita && <span className="badge">{card.rarita}</span>}
                      {card.prezzo_usd != null && <span className="text-on-card-low">${card.prezzo_usd.toFixed(2)}</span>}
                    </span>
                  </span>
                </span>
                <button className="btn btn-accent btn-sm w-full shrink-0 sm:w-auto" onClick={() => { c.aggiungiWatch(card.codice, card); setQuery(''); }}>
                  Aggiungi
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Lista watchlist */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg text-text-high">Monitorate ({c.watchlist.length})</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => c.ricarica()}>🔄 Ricarica</button>
        </div>
        {c.caricando ? (
          <p className="text-text-low">Carico…</p>
        ) : c.watchlist.length === 0 ? (
          <div className="card p-5 text-on-card-mid">Nessuna carta monitorata. Aggiungine una qui sopra.</div>
        ) : (
          <div className="grid gap-3">
            {c.watchlist.map((w) => (
              <div key={w.codice} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {w.carta?.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.carta.immagine_url} alt={w.carta.nome} width={44} height={62} className="rounded-md object-cover" />
                  ) : null}
                  <div className="min-w-[140px] flex-1">
                    <div className="font-semibold text-on-card-high">{w.carta?.nome || w.codice}</div>
                    <div className="text-xs text-on-card-low">{w.codice}{w.carta?.set ? ` · ${w.carta.set}` : ''}</div>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                    <label className="flex items-center gap-1.5 text-sm text-on-card-mid">
                      <input type="checkbox" checked={w.attiva} onChange={(e) => c.aggiornaWatch(w.codice, { attiva: e.target.checked })} />
                      Attiva
                    </label>
                    <button className="btn btn-danger btn-sm" onClick={() => c.rimuoviWatch(w.codice)}>Rimuovi</button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <select
                    className="field col-span-2 sm:max-w-[190px]"
                    value={w.regola_tipo}
                    onChange={(e) => c.aggiornaWatch(w.codice, { regola_tipo: e.target.value as Watch['regola_tipo'] })}
                  >
                    {REGOLE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                  {w.regola_tipo !== 'ogni_annuncio' && (
                    <input
                      className="field sm:max-w-[120px]"
                      type="number"
                      value={w.regola_valore}
                      onChange={(e) => c.aggiornaWatch(w.codice, { regola_valore: Number(e.target.value) })}
                    />
                  )}
                  <select className="field sm:max-w-[110px]" value={w.paese} onChange={(e) => c.aggiornaWatch(w.codice, { paese: e.target.value })}>
                    <option value="it">🇮🇹 IT</option>
                    <option value="eu">🇪🇺 EU</option>
                  </select>
                  <select className="field sm:max-w-[130px]" value={w.priorita} onChange={(e) => c.aggiornaWatch(w.codice, { priorita: e.target.value as Watch['priorita'] })}>
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
    </main>
  );
}

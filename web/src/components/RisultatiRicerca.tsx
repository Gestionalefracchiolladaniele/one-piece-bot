'use client';

import { useMemo, useState } from 'react';
import type { CartaLive } from '@/lib/useClaupiece';

const PER_PAGINA = 10;

// Mostra i risultati della ricerca carte con:
// - filtro per rarità (bottoni; "Tutte" di default)
// - paginazione client 10/pagina con numeri (1 2 3 …), perché la ricerca torna fino
//   a 100 carte in 1 sola richiesta (il costo tcgapi è per richiesta, non per carta).
// `onAggiungi` è l'azione del bottone (Colleziona / Aggiungi); `testoBottone` la label.
export function RisultatiRicerca({
  carte,
  onAggiungi,
  testoBottone,
}: {
  carte: CartaLive[];
  onAggiungi: (c: CartaLive) => void;
  testoBottone: string;
}) {
  const [rarita, setRarita] = useState<string>(''); // '' = tutte
  const [pagina, setPagina] = useState(1);

  // Rarità disponibili tra i risultati (per i bottoni di filtro).
  const rarita_disponibili = useMemo(() => {
    const set = new Set<string>();
    for (const c of carte) if (c.rarita) set.add(c.rarita);
    return Array.from(set);
  }, [carte]);

  // Filtra per rarità selezionata.
  const filtrate = useMemo(
    () => (rarita ? carte.filter((c) => c.rarita === rarita) : carte),
    [carte, rarita],
  );

  const totPagine = Math.max(1, Math.ceil(filtrate.length / PER_PAGINA));
  const pag = Math.min(pagina, totPagine); // clamp se cambia il filtro
  const visibili = filtrate.slice((pag - 1) * PER_PAGINA, pag * PER_PAGINA);

  if (!carte.length) return null;

  return (
    <div className="mt-3">
      {/* Filtro rarità */}
      {rarita_disponibili.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => { setRarita(''); setPagina(1); }}
            className={`btn btn-sm ${rarita === '' ? 'btn-accent' : ''}`}
            style={rarita === '' ? undefined : { background: '#f0ecfa', color: 'var(--accent-strong)' }}
          >
            Tutte ({carte.length})
          </button>
          {rarita_disponibili.map((r) => (
            <button
              key={r}
              onClick={() => { setRarita(r); setPagina(1); }}
              className={`btn btn-sm ${rarita === r ? 'btn-accent' : ''}`}
              style={rarita === r ? undefined : { background: '#f0ecfa', color: 'var(--accent-strong)' }}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Lista carte della pagina corrente */}
      <ul className="grid list-none gap-2 p-0">
        {visibili.map((card) => (
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
                  {card.printing && card.printing !== 'Normal' && <span className="badge">{card.printing}</span>}
                  {card.prezzo_usd != null && (
                    <span className="text-on-card-low">${card.prezzo_usd.toFixed(2)} (~{card.prezzo_eur?.toFixed(2)}€)</span>
                  )}
                </span>
              </span>
            </span>
            <button className="btn btn-accent btn-sm w-full shrink-0 sm:w-auto" onClick={() => onAggiungi(card)}>
              {testoBottone}
            </button>
          </li>
        ))}
      </ul>

      {/* Numeri di pagina */}
      {totPagine > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {Array.from({ length: totPagine }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPagina(n)}
              className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-semibold ${
                n === pag ? 'btn-accent' : ''
              }`}
              style={n === pag ? undefined : { background: '#f0ecfa', color: 'var(--accent-strong)' }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

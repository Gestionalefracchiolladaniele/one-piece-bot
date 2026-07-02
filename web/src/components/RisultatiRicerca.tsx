'use client';

import { useMemo, useState } from 'react';
import { imgSrc, type CartaLive } from '@/lib/useClaupiece';

const PER_PAGINA = 10;

// Mostra i risultati della ricerca carte con:
// - filtro per rarità (bottoni; "Tutte" di default)
// - paginazione client 10/pagina con numeri (1 2 3 …), perché la ricerca torna fino
//   a 100 carte in 1 sola richiesta (il costo tcgapi è per richiesta, non per carta).
// - click su immagine/nome → pop-up di ANTEPRIMA (immagine grande + info + aggiungi).
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
  const [anteprima, setAnteprima] = useState<CartaLive | null>(null); // pop-up dettaglio

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
            <button
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-on-card-mid"
              onClick={() => setAnteprima(card)}
              title="Vedi dettaglio"
            >
              {card.immagine_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgSrc(card.immagine_url)} alt={card.nome} width={38} height={53} className="shrink-0 rounded object-cover transition hover:ring-2 hover:ring-[color:var(--accent)]" />
              ) : (
                <span className="flex h-[53px] w-[38px] shrink-0 items-center justify-center rounded bg-[#f0ecfa] text-lg">🃏</span>
              )}
              <span className="min-w-0">
                <strong className="block truncate text-on-card-high hover:underline">{card.nome || card.codice}</strong>
                <span className="block text-xs text-on-card-mid">{card.codice}{card.set ? ` · ${card.set}` : ''}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {card.rarita && <span className="badge">{card.rarita}</span>}
                  {card.printing && card.printing !== 'Normal' && <span className="badge">{card.printing}</span>}
                  {card.prezzo_usd != null && (
                    <span className="text-on-card-low">${card.prezzo_usd.toFixed(2)} (~{card.prezzo_eur?.toFixed(2)}€)</span>
                  )}
                </span>
              </span>
            </button>
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

      {/* Pop-up ANTEPRIMA carta (immagine grande + info + aggiungi) */}
      {anteprima && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(13,7,22,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={() => setAnteprima(null)}
        >
          <div className="card relative w-full max-w-[420px] overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex items-center justify-center p-5" style={{ background: 'linear-gradient(135deg, #2a1150, #7c3aed)' }}>
              <button
                aria-label="Chiudi"
                onClick={() => setAnteprima(null)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-[color:var(--accent-strong)]"
              >
                ×
              </button>
              {anteprima.immagine_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgSrc(anteprima.immagine_url)} alt={anteprima.nome} className="max-h-[320px] rounded-lg object-contain shadow-lg" />
              ) : (
                <div className="py-16 text-6xl">🃏</div>
              )}
            </div>
            <div className="p-5">
              <h3 className="m-0 font-display text-lg text-on-card-high">{anteprima.nome || anteprima.codice}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="badge">{anteprima.codice}</span>
                {anteprima.set && <span className="text-on-card-mid">{anteprima.set}</span>}
                {anteprima.rarita && <span className="badge">{anteprima.rarita}</span>}
                {anteprima.printing && anteprima.printing !== 'Normal' && <span className="badge">{anteprima.printing}</span>}
              </div>
              {anteprima.prezzo_usd != null && (
                <div className="mt-3 rounded-lg border border-border-card p-3">
                  <div className="text-[11px] text-on-card-low">Prezzo di mercato (stima USA)</div>
                  <div className="text-lg font-bold text-on-card-high">
                    ${anteprima.prezzo_usd.toFixed(2)}{' '}
                    {anteprima.prezzo_eur != null && (
                      <span className="text-sm font-normal text-on-card-mid">(~{anteprima.prezzo_eur.toFixed(2)}€)</span>
                    )}
                  </div>
                </div>
              )}
              <button
                className="btn btn-accent mt-4 w-full"
                onClick={() => { onAggiungi(anteprima); setAnteprima(null); }}
              >
                {testoBottone}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

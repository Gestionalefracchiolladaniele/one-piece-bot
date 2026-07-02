'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { VoceCollezione } from '@/lib/types';
import { imgSrc } from '@/lib/useClaupiece';

// ── Il RACCOGLITORE (binder) ────────────────────────────────────────────────
// Album porta-carte a doppia pagina: 3×3 = 9 carte per facciata. Su desktop mostra
// DUE facciate affiancate (18 carte, come un raccoglitore aperto); su mobile UNA
// facciata (9 carte) per leggibilità. Si sfoglia avanti/indietro con animazione.
//
// Ordinamento: per VALORE (le più preziose davanti) o per NUMERAZIONE della carta
// (ordine "da collezione": OP01-001, OP01-002…). La ricerca per nome porta
// direttamente alla facciata dove si trova la carta, evidenziandola.

const PER_FACCIATA = 9; // 3×3

type Ordine = 'valore' | 'numero';

// Chiave di ordinamento "numerica" da un codice tipo OP01-004 / ST30-001 / EB01-002_P1.
// Ordina prima per prefisso set (OP01, ST30…), poi per numero carta.
function chiaveNumero(codice: string): [string, number, string] {
  const m = codice.toUpperCase().match(/^([A-Z]+)?(\d+)?-?(\d+)?(.*)$/);
  const setPrefix = `${m?.[1] ?? ''}${(m?.[2] ?? '').padStart(2, '0')}`;
  const num = Number(m?.[3] ?? 0);
  const suffisso = m?.[4] ?? ''; // _P1, _P2… → tiene le varianti in ordine stabile
  return [setPrefix, num, suffisso];
}

export function Binder({
  voci,
  onApri,
  onAggiornaPrezzi,
}: {
  voci: VoceCollezione[];
  onApri: (v: VoceCollezione) => void;
  // Aggiorna il prezzo SOLO delle carte selezionate (chiamate tcgapi mirate).
  onAggiornaPrezzi?: (codici: string[]) => Promise<string>;
}) {
  const [ordine, setOrdine] = useState<Ordine>('valore');
  const [cerca, setCerca] = useState('');
  const [facciata, setFacciata] = useState(0); // indice della facciata SINISTRA (0-based)
  const [verso, setVerso] = useState<'next' | 'prev'>('next');
  const [trovato, setTrovato] = useState<string | null>(null); // codice evidenziato
  const [duePagine, setDuePagine] = useState(false);
  const [selezione, setSelezione] = useState<Set<string>>(new Set()); // codici spuntati
  const [modoSel, setModoSel] = useState(false); // modalità selezione attiva
  const [aggiornando, setAggiornando] = useState(false);
  const animRef = useRef(0);

  function toggleSel(codice: string) {
    setSelezione((prev) => {
      const next = new Set(prev);
      if (next.has(codice)) next.delete(codice); else next.add(codice);
      return next;
    });
  }

  async function aggiornaSelezionate() {
    if (!onAggiornaPrezzi || !selezione.size) return;
    setAggiornando(true);
    try { await onAggiornaPrezzi(Array.from(selezione)); setSelezione(new Set()); }
    finally { setAggiornando(false); }
  }

  // Desktop (≥768px) → due facciate; mobile → una. Reattivo al resize.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const upd = () => setDuePagine(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  // Carte ordinate secondo la modalità scelta.
  const ordinate = useMemo(() => {
    const arr = [...voci];
    if (ordine === 'valore') {
      arr.sort((a, b) => (b.valore_usd ?? 0) - (a.valore_usd ?? 0));
    } else {
      arr.sort((a, b) => {
        const ka = chiaveNumero(a.codice);
        const kb = chiaveNumero(b.codice);
        if (ka[0] !== kb[0]) return ka[0].localeCompare(kb[0]);
        if (ka[1] !== kb[1]) return ka[1] - kb[1];
        return ka[2].localeCompare(kb[2]);
      });
    }
    return arr;
  }, [voci, ordine]);

  const facciatePerVista = duePagine ? 2 : 1;
  const totFacciate = Math.max(1, Math.ceil(ordinate.length / PER_FACCIATA));
  // La facciata sinistra deve allinearsi al passo della vista (0,2,4… su desktop).
  const facciataClamp = Math.min(facciata, Math.max(0, totFacciate - 1));

  // Reset se cambia l'ordinamento (le posizioni cambiano).
  useEffect(() => { setFacciata(0); setTrovato(null); }, [ordine]);

  // Sfoglia con animazione coerente col verso.
  function vai(delta: number) {
    const passo = facciatePerVista;
    const next = Math.min(Math.max(0, facciataClamp + delta * passo), Math.max(0, totFacciate - 1));
    if (next === facciataClamp) return;
    setVerso(delta > 0 ? 'next' : 'prev');
    setFacciata(next);
    setTrovato(null);
    animRef.current += 1;
  }

  // Ricerca "salta a pagina": trova la prima carta che matcha e va alla sua facciata.
  function saltaA() {
    const q = cerca.trim().toLowerCase();
    if (!q) return;
    const idx = ordinate.findIndex(
      (v) => (v.carta?.nome ?? '').toLowerCase().includes(q) || v.codice.toLowerCase().includes(q),
    );
    if (idx < 0) { setTrovato('__none__'); return; }
    const facciataTarget = Math.floor(idx / PER_FACCIATA);
    // allinea al passo della vista (su desktop la facciata sinistra è pari)
    const sinistra = duePagine ? facciataTarget - (facciataTarget % 2) : facciataTarget;
    setVerso(sinistra >= facciataClamp ? 'next' : 'prev');
    setFacciata(sinistra);
    setTrovato(ordinate[idx].codice);
    animRef.current += 1;
  }

  // Le facciate attualmente visibili (1 o 2).
  const facciateVisibili = duePagine ? [facciataClamp, facciataClamp + 1] : [facciataClamp];

  function slotDi(indiceFacciata: number): (VoceCollezione | null)[] {
    const start = indiceFacciata * PER_FACCIATA;
    const fetta = ordinate.slice(start, start + PER_FACCIATA);
    // riempi sempre 9 slot (le tasche vuote restano visibili come un vero album)
    return Array.from({ length: PER_FACCIATA }, (_, i) => fetta[i] ?? null);
  }

  const primaVista = facciataClamp;
  const numeroVista = duePagine ? Math.floor(facciataClamp / 2) + 1 : facciataClamp + 1;
  const totViste = duePagine ? Math.ceil(totFacciate / 2) : totFacciate;

  return (
    <div>
      {/* Barra selezione multipla: spunta le carte e aggiorna SOLO quelle (mirato). */}
      {onAggiornaPrezzi && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border-card bg-[#f7f5fc] p-2">
          <button
            className={`btn btn-sm ${modoSel ? 'btn-accent' : ''}`}
            style={modoSel ? undefined : { background: '#fff', color: 'var(--accent-strong)' }}
            onClick={() => { setModoSel((s) => !s); setSelezione(new Set()); }}
          >
            {modoSel ? '✓ Selezione attiva' : '☑️ Seleziona carte'}
          </button>
          {modoSel && (
            <>
              <span className="text-xs text-on-card-mid">{selezione.size} selezionate</span>
              <button
                className="btn btn-accent btn-sm"
                onClick={aggiornaSelezionate}
                disabled={!selezione.size || aggiornando}
              >
                {aggiornando ? '…' : `💲 Aggiorna prezzi (${selezione.size})`}
              </button>
              <span className="text-[10px] text-on-card-low">1 richiesta tcgapi per carta selezionata</span>
            </>
          )}
        </div>
      )}

      {/* Controlli: ordinamento + ricerca salta-a-pagina */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-border-card">
          <button
            className={`px-3 py-1.5 text-sm font-semibold ${ordine === 'valore' ? 'btn-accent' : ''}`}
            style={ordine === 'valore' ? undefined : { background: '#f0ecfa', color: 'var(--accent-strong)' }}
            onClick={() => setOrdine('valore')}
          >
            💎 Valore
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-semibold ${ordine === 'numero' ? 'btn-accent' : ''}`}
            style={ordine === 'numero' ? undefined : { background: '#f0ecfa', color: 'var(--accent-strong)' }}
            onClick={() => setOrdine('numero')}
          >
            🔢 Numerazione
          </button>
        </div>
        <div className="flex min-w-[180px] flex-1 gap-2">
          <input
            className="field flex-1"
            placeholder="🔍 Trova una carta → salta alla pagina…"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saltaA(); }}
          />
          <button className="btn btn-accent btn-sm shrink-0" onClick={saltaA}>Vai</button>
        </div>
      </div>
      {trovato === '__none__' && (
        <p className="mb-2 text-[13px] text-text-low">Nessuna carta trovata per “{cerca.trim()}”.</p>
      )}

      {/* Il raccoglitore */}
      <div className="binder">
        <div key={animRef.current} className={`binder-spread ${verso === 'next' ? 'binder-anim-next' : 'binder-anim-prev'}`}>
          {facciateVisibili.map((f, i) => (
            <Fragment key={`spread-${f}`}>
              {i === 1 && <div className="binder-gutter hidden md:block" />}
              <div className="binder-page">
                {slotDi(f).map((v, j) => (
                  <div key={j} className={`binder-slot ${v ? '' : 'binder-slot--empty'}`}>
                    {v && (
                      <div
                        className={`binder-card ${trovato === v.codice ? 'binder-card--found' : ''} ${modoSel && selezione.has(v.codice) ? 'binder-card--sel' : ''}`}
                        // In modalità selezione il click SPUNTA; altrimenti apre il dettaglio.
                        onClick={() => (modoSel ? toggleSel(v.codice) : onApri(v))}
                        title={`${v.carta?.nome || v.codice}${v.prezzo_usd != null ? ` · $${v.valore_usd?.toFixed(2)}` : ''}`}
                      >
                        {v.carta?.immagine_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imgSrc(v.carta.immagine_url)} alt={v.carta?.nome || v.codice} />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center p-1 text-center">
                            <span className="text-2xl">🃏</span>
                            <span className="mt-1 text-[10px] text-text-mid">{v.codice}</span>
                          </div>
                        )}
                        {/* etichetta quantità se >1 */}
                        {v.quantita > 1 && (
                          <span className="absolute right-1 top-1 rounded-full bg-[color:var(--accent-strong)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            ×{v.quantita}
                          </span>
                        )}
                        {/* Checkbox di selezione (solo in modalità selezione) */}
                        {modoSel && (
                          <span
                            className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-md border-2 text-[11px] font-bold ${
                              selezione.has(v.codice)
                                ? 'border-white bg-[color:var(--accent-strong)] text-white'
                                : 'border-white/80 bg-black/30 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Navigazione pagine */}
      <div className="mt-3 flex items-center justify-between">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => vai(-1)}
          disabled={facciataClamp === 0}
          style={facciataClamp === 0 ? { opacity: 0.4 } : undefined}
        >
          ← Indietro
        </button>
        <span className="text-sm text-text-mid">
          Pagina {numeroVista} / {totViste}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => vai(1)}
          disabled={primaVista + facciatePerVista >= totFacciate}
          style={primaVista + facciatePerVista >= totFacciate ? { opacity: 0.4 } : undefined}
        >
          Avanti →
        </button>
      </div>
    </div>
  );
}

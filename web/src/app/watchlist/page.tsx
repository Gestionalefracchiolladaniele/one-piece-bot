'use client';

import { useState } from 'react';
import { useClaupiece, type CartaLive } from '@/lib/useClaupiece';
import { RisultatiRicerca } from '@/components/RisultatiRicerca';
import { InserisciManuale } from '@/components/InserisciManuale';
import type { Watch } from '@/lib/types';

const REGOLE: { key: Watch['regola_tipo']; label: string }[] = [
  { key: 'prezzo_max', label: 'Prezzo max (€)' },
  { key: 'perc_sconto', label: '% sconto min (serve CardTrader)' },
  { key: 'ogni_annuncio', label: 'Ogni annuncio' },
];

export default function WatchlistPage() {
  const c = useClaupiece();
  const { cercaCarte, cercaOnline } = c;
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<CartaLive[]>([]);
  const [cercando, setCercando] = useState(false);
  const [cercato, setCercato] = useState(false);
  const [online, setOnline] = useState(false); // true se i risultati vengono da tcgapi
  const [avviso, setAvviso] = useState<string | null>(null);
  const [manuale, setManuale] = useState(false);

  // Ricerca di DEFAULT nell'anagrafica locale (~4500 carte). Zero costo, zero chiamate.
  async function cerca() {
    const q = query.trim();
    if (q.length < 2) return;
    setCercando(true);
    setCercato(true);
    setOnline(false);
    try { setRisultati(await cercaCarte(q)); }
    catch { setRisultati([]); }
    finally { setCercando(false); }
  }

  // Fallback ONLINE (tcgapi, 1 richiesta) quando il DB non trova la carta.
  async function cercaWeb() {
    const q = query.trim();
    if (q.length < 2) return;
    setCercando(true);
    setCercato(true);
    setOnline(true);
    try { setRisultati(await cercaOnline(q)); }
    catch { setRisultati([]); }
    finally { setCercando(false); }
  }

  const MAX_ATTIVE = 3;
  const attive = c.watchlist.filter((w) => w.attiva).length;

  // Carte già in collezione ma NON ancora in watchlist → sceglibili senza chiamate.
  const inWatch = new Set(c.watchlist.map((w) => w.codice));
  const dallaCollezione = c.collezione.filter((v) => !inWatch.has(v.codice));

  // Attiva/disattiva rispettando il limite (blocco lato UI + messaggio).
  function toggleAttiva(codice: string, vuoiAttiva: boolean) {
    if (vuoiAttiva && attive >= MAX_ATTIVE) {
      setAvviso(`Massimo ${MAX_ATTIVE} carte attive. Metti in pausa un'altra carta prima.`);
      return;
    }
    setAvviso(null);
    c.aggiornaWatch(codice, { attiva: vuoiAttiva });
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 pt-6 pb-16 sm:px-5 sm:pt-8">
      <header className="mb-6">
        <h1 className="m-0 font-display text-[clamp(24px,6vw,36px)] tracking-tight">👀 Watchlist</h1>
        <p className="mt-1.5 max-w-[560px] text-sm text-text-mid">
          Le carte che il bot monitora su Vinted. Per ognuna imposti la <strong>regola</strong>
          (quando è un affare) e il paese. Massimo <strong>{MAX_ATTIVE} attive</strong> insieme
          (budget Apify).
        </p>
      </header>

      {(c.errore || avviso) && (
        <div className="card mb-5 p-3.5 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: 'var(--alert)' }}>
          {c.errore ? `Errore: ${c.errore}` : avviso}
        </div>
      )}

      {/* Aggiungi carta */}
      <section className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-1 font-display text-base text-on-card-high sm:text-lg">➕ Aggiungi una carta</h2>
        <p className="mb-3 text-xs text-on-card-low">
          Scrivi il <strong>nome</strong> e premi <strong>Cerca</strong> (o Invio): la ricerca
          è nel database locale delle carte (gratis, istantanea). Il prezzo viene preso solo
          al momento dell'aggiunta.
        </p>
        <div className="flex gap-2">
          <input
            className="field flex-1"
            placeholder="Nome carta (es. Shanks, Luffy)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') cerca(); }}
          />
          <button className="btn btn-accent shrink-0" onClick={cerca} disabled={cercando || query.trim().length < 2}>
            {cercando ? '…' : '🔍 Cerca'}
          </button>
        </div>
        {online && risultati.length > 0 && (
          <p className="mt-2 text-[11px] text-on-card-low">Risultati da tcgapi (con prezzo).</p>
        )}
        {!cercando && cercato && risultati.length === 0 && (
          <p className="mt-2.5 text-[13px] text-on-card-low">
            Nessuna carta trovata nel database per “{query.trim()}”.{' '}
            <button onClick={cercaWeb} className="font-semibold text-[color:var(--accent-strong)] underline">
              🌐 Cerca online (tcgapi)
            </button>{' '}oppure{' '}
            <button onClick={() => setManuale(true)} className="font-semibold text-[color:var(--accent-strong)] underline">
              inseriscila a mano
            </button>.
          </p>
        )}
        <button onClick={() => setManuale(true)} className="mt-2.5 text-[13px] font-semibold text-[color:var(--accent-strong)]">
          ✍️ Inserisci una carta a mano
        </button>
        <RisultatiRicerca
          carte={risultati}
          testoBottone="Aggiungi"
          onAggiungi={(card) => { c.aggiungiWatch(card.codice, card); setQuery(''); setRisultati([]); setCercato(false); }}
        />

        {/* Scegli da collezione: zero chiamate esterne (i dati sono già nel DB) */}
        {dallaCollezione.length > 0 && (
          <div className="mt-4 border-t border-border-card pt-3">
            <label className="mb-1.5 block text-xs font-semibold text-on-card-mid">
              📚 …oppure scegli una carta dalla tua collezione (gratis):
            </label>
            <div className="flex gap-2">
              <select
                className="field flex-1"
                value=""
                onChange={(e) => {
                  const v = dallaCollezione.find((x) => x.codice === e.target.value);
                  if (v) c.aggiungiWatch(v.codice, v.carta ? {
                    codice: v.codice, nome: v.carta.nome, set: v.carta.set, rarita: v.carta.rarita,
                    printing: '', tipo: v.carta.tipo, immagine_url: v.carta.immagine_url,
                    prezzo_usd: v.prezzo_usd, prezzo_eur: v.prezzo_eur,
                  } : undefined);
                }}
              >
                <option value="">— seleziona dalla collezione —</option>
                {dallaCollezione.map((v) => (
                  <option key={v.codice} value={v.codice}>
                    {v.carta?.nome || v.codice} · {v.codice}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Lista watchlist */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg text-text-high">
            Monitorate ({c.watchlist.length}) · <span className={attive >= MAX_ATTIVE ? 'text-[color:var(--gold)]' : ''}>{attive}/{MAX_ATTIVE} attive</span>
          </h2>
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
                      <input type="checkbox" checked={w.attiva} onChange={(e) => toggleAttiva(w.codice, e.target.checked)} />
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
                </div>

                {/* URL Vinted personalizzato (opz.): ricerca più mirata. Vuoto = auto. */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-[color:var(--accent-strong)]">
                    🔗 URL Vinted personalizzato (opzionale)
                  </summary>
                  <input
                    className="field mt-2 text-[13px]"
                    placeholder="Incolla qui l'URL di una ricerca Vinted (lascia vuoto per l'automatico)"
                    defaultValue={w.vinted_url ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (w.vinted_url ?? '')) c.aggiornaWatch(w.codice, { vinted_url: v || null });
                    }}
                  />
                  <p className="mt-1 text-[10px] text-on-card-low">
                    Cerca la carta su Vinted coi filtri che vuoi (categoria, condizione…), copia
                    l'URL dalla barra e incollalo qui: il bot userà esattamente quella ricerca.
                  </p>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pop-up inserimento manuale */}
      <InserisciManuale
        aperto={manuale}
        onChiudi={() => setManuale(false)}
        titolo="✍️ Aggiungi carta a mano"
        onSalva={(carta) => {
          c.aggiungiWatch(carta.codice, carta);
          setManuale(false);
        }}
      />
    </main>
  );
}

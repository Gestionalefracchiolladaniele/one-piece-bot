'use client';

import { useMemo, useState } from 'react';
import { useClaupiece, type CartaLive } from '@/lib/useClaupiece';
import { AzioneBtn } from '@/components/AzioneBtn';
import { CartaModal } from '@/components/CartaModal';
import { RisultatiRicerca } from '@/components/RisultatiRicerca';
import type { VoceCollezione } from '@/lib/types';

const TOP_N = 5; // quante carte mostrare di default (le più preziose)

export default function CollezionePage() {
  const c = useClaupiece();
  const { cercaLive } = c;
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<CartaLive[]>([]);
  const [cercando, setCercando] = useState(false);
  const [cercato, setCercato] = useState(false); // true dopo la prima ricerca (per il "nessun risultato")
  const [msg, setMsg] = useState<string | null>(null);
  // Ricerca LOCALE tra le carte già in collezione (per nome/codice).
  const [filtro, setFiltro] = useState('');
  // Carta aperta nel pop-up di dettaglio.
  const [dettaglio, setDettaglio] = useState<VoceCollezione | null>(null);

  // Collezione ordinata per valore decrescente.
  const ordinata = useMemo(
    () => [...c.collezione].sort((a, b) => (b.valore_usd ?? 0) - (a.valore_usd ?? 0)),
    [c.collezione],
  );

  // Cosa mostrare: se sto filtrando → tutte quelle che matchano; altrimenti solo le TOP_N.
  const daMostrare = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (f) {
      return ordinata.filter(
        (v) => (v.carta?.nome ?? '').toLowerCase().includes(f) || v.codice.toLowerCase().includes(f),
      );
    }
    return ordinata.slice(0, TOP_N);
  }, [ordinata, filtro]);

  const nascoste = !filtro.trim() && ordinata.length > TOP_N ? ordinata.length - TOP_N : 0;

  // Ricerca MANUALE su tcgapi (bottone/Invio): 1 sola richiesta per ricerca, per NON
  // bruciare il free tier (100 req/giorno account-wide). Niente auto-live mentre digiti.
  async function cerca() {
    const q = query.trim();
    if (q.length < 2) return;
    setCercando(true);
    setCercato(true);
    try { setRisultati(await cercaLive(q)); }
    catch { setRisultati([]); }
    finally { setCercando(false); }
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 pt-6 pb-16 sm:px-5 sm:pt-8">
      <header className="mb-6">
        <h1 className="m-0 font-display text-[clamp(24px,6vw,36px)] tracking-tight">📚 La mia collezione</h1>
        <p className="mt-1.5 max-w-[560px] text-sm text-text-mid">
          Le carte che possiedi e quante copie. Il valore è stimato dal mercato USA (tcgapi),
          mostrato in $ e come stima in €. Indipendente dalla watchlist.
        </p>
      </header>

      {(c.errore || msg) && (
        <div className="card mb-5 p-3.5 text-sm" style={c.errore ? { borderColor: 'rgba(239,68,68,0.4)', color: 'var(--alert)' } : undefined}>
          {c.errore ? `Errore: ${c.errore}` : msg}
        </div>
      )}

      {/* Totale + azioni */}
      <section className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <div className="text-2xl font-bold text-on-card-high">
            ${c.totale.usd.toFixed(2)} <span className="text-base font-normal text-on-card-mid">(~{c.totale.eur.toFixed(2)}€)</span>
          </div>
          <div className="text-xs text-on-card-low">{c.totale.pezzi} pezzi · {c.collezione.length} carte · stima mercato USA</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AzioneBtn
            className="btn btn-accent btn-sm"
            onClick={c.aggiornaPrezziColl}
            onEsito={setMsg}
            conferma="Aggiornare i prezzi di tutte le carte? (1 richiesta tcgapi per carta, occhio al budget 100/giorno)"
          >
            💲 Aggiorna prezzi
          </AzioneBtn>
          <button className="btn btn-ghost btn-sm" onClick={() => c.ricarica()}>🔄 Ricarica</button>
        </div>
      </section>

      {/* Aggiungi alla collezione (ricerca live) */}
      <section className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-1 font-display text-base text-on-card-high sm:text-lg">➕ Aggiungi una carta</h2>
        <p className="mb-3 text-xs text-on-card-low">
          Scrivi il <strong>nome</strong> e premi <strong>Cerca</strong> (o Invio): parte 1 sola
          ricerca (il servizio prezzi ha un limite giornaliero). Cerca il nome del personaggio
          (es. Luffy); i risultati mostrano codice/set/rarità per scegliere la variante.
        </p>
        <div className="flex gap-2">
          <input
            className="field flex-1"
            placeholder="Nome carta (es. Luffy, Zoro, Nami)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') cerca(); }}
          />
          <button className="btn btn-accent shrink-0" onClick={cerca} disabled={cercando || query.trim().length < 2}>
            {cercando ? '…' : '🔍 Cerca'}
          </button>
        </div>
        {!cercando && cercato && risultati.length === 0 && (
          <p className="mt-2.5 text-[13px] text-on-card-low">
            Nessuna carta trovata per “{query.trim()}”. Prova solo il nome (es. Luffy). Se non
            appare nulla per nessuna ricerca, potrebbe essere finito il limite giornaliero
            (si azzera a mezzanotte UTC).
          </p>
        )}
        <RisultatiRicerca
          carte={risultati}
          testoBottone="+ Colleziona"
          onAggiungi={(card) => { c.aggiungiColl(card.codice, card); setQuery(''); setRisultati([]); setCercato(false); }}
        />
      </section>

      {/* Lista collezione */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-text-high">
            {filtro.trim() ? `Risultati (${daMostrare.length})` : `Top ${TOP_N} più preziose`}
          </h2>
          <span className="text-xs text-text-low">{c.collezione.length} carte totali</span>
        </div>

        {/* Ricerca locale tra le carte già in collezione */}
        {c.collezione.length > 0 && (
          <input
            className="field mb-3"
            placeholder="🔍 Cerca nella tua collezione (nome o codice)…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        )}

        {c.caricando ? (
          <p className="text-text-low">Carico…</p>
        ) : c.collezione.length === 0 ? (
          <div className="card p-5 text-on-card-mid">
            La collezione è vuota. Cerca una carta qui sopra e aggiungila: il valore stimato apparirà accanto.
          </div>
        ) : daMostrare.length === 0 ? (
          <div className="card p-5 text-on-card-mid">Nessuna carta trovata per “{filtro.trim()}”.</div>
        ) : (
          <div className="grid gap-3">
            {daMostrare.map((v) => (
              <div key={v.codice} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {v.carta?.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.carta.immagine_url}
                      alt={v.carta.nome}
                      width={44}
                      height={62}
                      onClick={() => setDettaglio(v)}
                      className="cursor-pointer rounded-md object-cover transition hover:ring-2 hover:ring-[color:var(--accent)]"
                      title="Vedi dettaglio"
                    />
                  ) : (
                    <button onClick={() => setDettaglio(v)} className="text-2xl" title="Vedi dettaglio">🃏</button>
                  )}
                  <div className="min-w-[140px] flex-1">
                    <button onClick={() => setDettaglio(v)} className="text-left font-semibold text-on-card-high hover:underline">
                      {v.carta?.nome || v.codice}
                    </button>
                    <div className="text-xs text-on-card-low">{v.codice}{v.carta?.set ? ` · ${v.carta.set}` : ''}</div>
                  </div>

                  <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-start">
                    <label className="flex items-center gap-1.5 text-sm text-on-card-mid">
                      Quantità
                      <input
                        className="field w-[72px]"
                        type="number"
                        min={1}
                        value={v.quantita}
                        onChange={(e) => c.aggiornaColl(v.codice, { quantita: Math.max(1, Number(e.target.value)) })}
                      />
                    </label>
                    <div className="text-right sm:min-w-[120px]">
                      {v.prezzo_usd != null ? (
                        <>
                          <div className="font-semibold text-on-card-high">
                            ${v.valore_usd?.toFixed(2)}{' '}
                            <span className="text-[13px] font-normal text-on-card-mid">(~{v.valore_eur?.toFixed(2)}€)</span>
                          </div>
                          <div className="text-[11px] text-on-card-low">${v.prezzo_usd.toFixed(2)}/pz · stima USA</div>
                        </>
                      ) : (
                        <span className="text-sm text-on-card-low">prezzo —</span>
                      )}
                    </div>
                  </div>

                  <button className="btn btn-danger btn-sm w-full sm:w-auto" onClick={() => c.rimuoviColl(v.codice)}>Rimuovi</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {nascoste > 0 && (
          <p className="mt-3 text-center text-xs text-text-low">
            +{nascoste} altre carte — usa la ricerca qui sopra per trovarle.
          </p>
        )}
      </section>

      {/* Pop-up dettaglio carta */}
      <CartaModal voce={dettaglio} onClose={() => setDettaglio(null)} />
    </main>
  );
}

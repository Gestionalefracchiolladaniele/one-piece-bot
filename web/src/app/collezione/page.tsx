'use client';

import { useEffect, useState } from 'react';
import { useClaupiece, type CartaLive } from '@/lib/useClaupiece';
import { AzioneBtn } from '@/components/AzioneBtn';

export default function CollezionePage() {
  const c = useClaupiece();
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<CartaLive[]>([]);
  const [cercando, setCercando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Ricerca LIVE su tcgapi: carte reali con prezzo, anche non ancora in DB.
  // Debounce più lungo per non sprecare il budget richieste (100/giorno).
  useEffect(() => {
    const q = query.trim();
    if (!q) { setRisultati([]); setCercando(false); return; }
    setCercando(true);
    const t = setTimeout(async () => {
      try { setRisultati(await c.cercaLive(q)); }
      catch { setRisultati([]); }
      finally { setCercando(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [query, c]);

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
        <h2 className="mb-3 font-display text-base text-on-card-high sm:text-lg">➕ Aggiungi una carta</h2>
        <input
          className="field"
          placeholder="Cerca per nome (es. Zoro) o codice (es. OP01-025)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {cercando && <p className="mt-2.5 text-[13px] text-on-card-low">Cerco…</p>}
        {!cercando && query.trim() && risultati.length === 0 && (
          <p className="mt-2.5 text-[13px] text-on-card-low">Nessuna carta trovata.</p>
        )}
        {risultati.length > 0 && (
          <ul className="mt-3 grid list-none gap-2 p-0">
            {risultati.map((card) => (
              <li key={`${card.codice}-${card.nome}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-card px-2.5 py-2">
                <span className="flex items-center gap-2.5 text-on-card-mid">
                  {card.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.immagine_url} alt={card.nome} width={30} height={42} className="rounded object-cover" />
                  ) : null}
                  <span>
                    <strong className="text-on-card-high">{card.nome || card.codice}</strong>{' '}
                    <span className="text-xs">· {card.codice}{card.set ? ` · ${card.set}` : ''}</span>
                    {card.prezzo_usd != null && (
                      <span className="block text-xs text-on-card-low">${card.prezzo_usd.toFixed(2)} (~{card.prezzo_eur?.toFixed(2)}€)</span>
                    )}
                  </span>
                </span>
                <button className="btn btn-accent btn-sm w-full sm:w-auto" onClick={() => { c.aggiungiColl(card.codice); setQuery(''); }}>
                  + Colleziona
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Lista collezione */}
      <section>
        <h2 className="mb-3 font-display text-lg text-text-high">Le mie carte ({c.collezione.length})</h2>
        {c.caricando ? (
          <p className="text-text-low">Carico…</p>
        ) : c.collezione.length === 0 ? (
          <div className="card p-5 text-on-card-mid">
            La collezione è vuota. Cerca una carta qui sopra e aggiungila: il valore stimato apparirà accanto.
          </div>
        ) : (
          <div className="grid gap-3">
            {c.collezione.map((v) => (
              <div key={v.codice} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {v.carta?.immagine_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.carta.immagine_url} alt={v.carta.nome} width={44} height={62} className="rounded-md object-cover" />
                  ) : null}
                  <div className="min-w-[140px] flex-1">
                    <div className="font-semibold text-on-card-high">{v.carta?.nome || v.codice}</div>
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
      </section>
    </main>
  );
}

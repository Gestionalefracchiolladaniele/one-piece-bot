'use client';

import { useState } from 'react';
import { useClaupiece, type CartaLive } from '@/lib/useClaupiece';
import { AzioneBtn } from '@/components/AzioneBtn';
import { CartaModal } from '@/components/CartaModal';
import { RisultatiRicerca } from '@/components/RisultatiRicerca';
import { InserisciManuale } from '@/components/InserisciManuale';
import { Binder } from '@/components/Binder';
import { BarraRicerca } from '@/components/BarraRicerca';
import type { VoceCollezione } from '@/lib/types';

export default function CollezionePage() {
  const c = useClaupiece();
  const { cercaCarte, cercaOnline } = c;
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<CartaLive[]>([]);
  const [cercando, setCercando] = useState(false);
  const [cercato, setCercato] = useState(false); // true dopo la prima ricerca (per il "nessun risultato")
  const [online, setOnline] = useState(false); // true se i risultati vengono da tcgapi
  const [rarFiltro, setRarFiltro] = useState(''); // filtro rarità per la ricerca tcgapi
  const [msg, setMsg] = useState<string | null>(null);
  const [manuale, setManuale] = useState(false); // pop-up inserimento manuale
  // Codice della carta aperta nel pop-up di dettaglio (deriviamo la voce FRESCA dallo
  // stato, così il modal riflette subito quantità/prezzo aggiornati).
  const [dettaglioCodice, setDettaglioCodice] = useState<string | null>(null);
  const dettaglio = dettaglioCodice ? c.collezione.find((v) => v.codice === dettaglioCodice) ?? null : null;

  // Ricerca di DEFAULT nell'anagrafica locale (~4500 carte). Zero costo, zero chiamate.
  // Il prezzo tcgapi si prende SOLO al click "Colleziona" (POST, per il number esatto).
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

  // Fallback ONLINE (tcgapi, 1 richiesta) quando il DB non trova la carta. Con filtro
  // rarità opzionale per mirare (es. solo Leader / solo Alt Art) → meno rumore.
  async function cercaWeb() {
    const q = query.trim();
    if (q.length < 2) return;
    setCercando(true);
    setCercato(true);
    setOnline(true);
    try { setRisultati(await cercaOnline(q, { rarity: rarFiltro || undefined })); }
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

      {/* Aggiungi alla collezione */}
      <section className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base text-on-card-high sm:text-lg">➕ Aggiungi una carta</h2>
        <BarraRicerca
          query={query}
          onQuery={setQuery}
          rarita={rarFiltro}
          onRarita={setRarFiltro}
          onCercaDb={cerca}
          onCercaTcg={cercaWeb}
          onManuale={() => setManuale(true)}
          cercando={cercando}
          fonteAttiva={cercando ? (online ? 'tcg' : 'db') : null}
          placeholder="Nome carta (es. Luffy, Zoro, Nami)…"
        />
        {cercato && risultati.length > 0 && (
          <p className="mt-2.5 text-[11px] text-on-card-low">
            {online ? '🌐 Risultati da tcgapi (con prezzo).' : `🔍 ${risultati.length} risultati dal database locale.`}
          </p>
        )}
        {!cercando && cercato && risultati.length === 0 && (
          <p className="mt-2.5 text-[13px] text-on-card-low">
            {online
              ? <>Nessun risultato su tcgapi per “{query.trim()}”. Prova solo il nome, oppure </>
              : <>Nessuna carta nel database per “{query.trim()}”. Prova <button onClick={cercaWeb} className="font-semibold text-[color:var(--accent-strong)] underline">🌐 tcgapi</button> oppure </>}
            <button onClick={() => setManuale(true)} className="font-semibold text-[color:var(--accent-strong)] underline">
              inseriscila a mano
            </button>.
          </p>
        )}
        <RisultatiRicerca
          carte={risultati}
          testoBottone="+ Colleziona"
          onAggiungi={(card) => { c.aggiungiColl(card.codice, card); setQuery(''); setRisultati([]); setCercato(false); }}
        />
      </section>

      {/* Il RACCOGLITORE */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-text-high">🗂️ Il raccoglitore</h2>
          <span className="text-xs text-text-low">{c.collezione.length} carte · {c.totale.pezzi} pezzi</span>
        </div>

        {c.caricando ? (
          <p className="text-text-low">Carico…</p>
        ) : c.collezione.length === 0 ? (
          <div className="card p-5 text-on-card-mid">
            Il raccoglitore è vuoto. Cerca una carta qui sopra e aggiungila: apparirà nelle tasche
            dell’album, ordinata per valore.
          </div>
        ) : (
          <Binder
            voci={c.collezione}
            onApri={(v) => setDettaglioCodice(v.codice)}
            onAggiornaPrezzi={async (codici) => {
              const esito = await c.aggiornaPrezziCarte(codici);
              setMsg(esito);
              return esito;
            }}
          />
        )}
      </section>

      {/* Pop-up dettaglio carta — con azioni (quantità, prezzo, rimuovi) */}
      <CartaModal
        voce={dettaglio}
        onClose={() => setDettaglioCodice(null)}
        onQuantita={(codice, q) => c.aggiornaColl(codice, { quantita: q })}
        onPrezzo={(codice) => c.aggiornaPrezzoCarta(codice)}
        onRimuovi={(codice) => { c.rimuoviColl(codice); setDettaglioCodice(null); }}
        onEsito={setMsg}
      />

      {/* Pop-up inserimento manuale */}
      <InserisciManuale
        aperto={manuale}
        onChiudi={() => setManuale(false)}
        conQuantita
        titolo="✍️ Aggiungi carta a mano"
        onSalva={(carta, quantita) => {
          c.aggiungiColl(carta.codice, carta, quantita);
          setManuale(false);
        }}
      />
    </main>
  );
}

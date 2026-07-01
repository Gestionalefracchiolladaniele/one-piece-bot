'use client';

import { useEffect, useState } from 'react';
import type { CartaLive } from '@/lib/useClaupiece';

// Pop-up per inserire una carta A MANO, quando la ricerca tcgapi non la trova (o il
// limite giornaliero è esaurito). Nome + codice sono obbligatori; il resto è opzionale.
// Una (i) apre una guida su dove reperire i dati, con link cliccabili.
// `conQuantita` mostra il campo quantità (serve alla collezione, non alla watchlist).
export function InserisciManuale({
  aperto,
  onChiudi,
  onSalva,
  conQuantita,
  titolo,
}: {
  aperto: boolean;
  onChiudi: () => void;
  onSalva: (carta: CartaLive, quantita: number) => void;
  conQuantita?: boolean;
  titolo: string;
}) {
  const [nome, setNome] = useState('');
  const [codice, setCodice] = useState('');
  const [set, setSet] = useState('');
  const [rarita, setRarita] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [immagine, setImmagine] = useState('');
  const [quantita, setQuantita] = useState('1');
  const [guida, setGuida] = useState(false);

  useEffect(() => {
    if (!aperto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [aperto, onChiudi]);

  if (!aperto) return null;

  const codiceOk = codice.trim().length > 0;
  const nomeOk = nome.trim().length > 0;
  const valido = codiceOk && nomeOk;

  function salva() {
    if (!valido) return;
    const prezzoNum = prezzo.trim() ? Number(prezzo.replace(',', '.')) : null;
    const carta: CartaLive = {
      codice: codice.trim().toUpperCase(),
      nome: nome.trim(),
      set: set.trim(),
      rarita: rarita.trim(),
      printing: '',
      tipo: '',
      immagine_url: immagine.trim(),
      prezzo_usd: prezzoNum != null && !Number.isNaN(prezzoNum) ? prezzoNum : null,
      prezzo_eur: null,
    };
    onSalva(carta, Math.max(1, Number(quantita) || 1));
    // reset per il prossimo inserimento
    setNome(''); setCodice(''); setSet(''); setRarita(''); setPrezzo(''); setImmagine(''); setQuantita('1');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,7,22,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onChiudi}
    >
      <div
        className="card relative max-h-[90vh] w-full max-w-[440px] overflow-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="m-0 font-display text-lg text-on-card-high">{titolo}</h3>
          <button aria-label="Chiudi" onClick={onChiudi} className="text-xl text-on-card-mid">×</button>
        </div>

        {/* Bottone guida (i) */}
        <button
          onClick={() => setGuida((g) => !g)}
          className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--accent-strong)]"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs">i</span>
          Dove trovo questi dati? {guida ? '▲' : '▼'}
        </button>

        {guida && (
          <div className="mb-4 rounded-lg border border-border-card bg-[#f7f5fc] p-3 text-[12px] leading-relaxed text-on-card-mid">
            <p className="mt-0"><strong>Codice</strong> (es. OP01-025): è stampato sulla carta in basso a
              sinistra. Formato: sigla set + numero.</p>
            <p><strong>Prezzo</strong>: cercalo su una di queste fonti (apri, cerca la carta, copia il prezzo):</p>
            <ul className="my-1 pl-4">
              <li>
                <a href="https://www.tcgplayer.com/search/one-piece-card-game/product?q=" target="_blank" rel="noreferrer"
                   className="font-semibold text-[color:var(--accent-strong)] underline">TCGPlayer</a> — prezzi USA (USD), stessa fonte dell'app
              </li>
              <li>
                <a href="https://www.cardmarket.com/en/OnePiece" target="_blank" rel="noreferrer"
                   className="font-semibold text-[color:var(--accent-strong)] underline">Cardmarket</a> — prezzi Europa (EUR)
              </li>
              <li>
                <a href="https://onepiece-cardgame.com/cardlist" target="_blank" rel="noreferrer"
                   className="font-semibold text-[color:var(--accent-strong)] underline">Sito ufficiale</a> — per nome e codice esatto
              </li>
            </ul>
            <p className="mb-0"><strong>Immagine</strong> (opzionale): tasto destro sull'immagine della carta →
              "Copia indirizzo immagine" e incolla qui.</p>
          </div>
        )}

        {/* Campi */}
        <div className="grid gap-2.5">
          <label className="text-sm text-on-card-mid">
            Nome <span className="text-[color:var(--alert)]">*</span>
            <input className="field mt-1" placeholder="es. Monkey.D.Luffy" value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="text-sm text-on-card-mid">
            Codice <span className="text-[color:var(--alert)]">*</span>
            <input className="field mt-1" placeholder="es. OP01-025" value={codice} onChange={(e) => setCodice(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="text-sm text-on-card-mid">
              Prezzo USD
              <input className="field mt-1" type="text" inputMode="decimal" placeholder="es. 12.50" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} />
            </label>
            <label className="text-sm text-on-card-mid">
              Rarità
              <input className="field mt-1" placeholder="es. SR" value={rarita} onChange={(e) => setRarita(e.target.value)} />
            </label>
          </div>
          <label className="text-sm text-on-card-mid">
            Set
            <input className="field mt-1" placeholder="es. Romance Dawn" value={set} onChange={(e) => setSet(e.target.value)} />
          </label>
          <label className="text-sm text-on-card-mid">
            Immagine (URL)
            <input className="field mt-1" placeholder="https://…" value={immagine} onChange={(e) => setImmagine(e.target.value)} />
          </label>
          {conQuantita && (
            <label className="text-sm text-on-card-mid">
              Quantità
              <input className="field mt-1" type="number" min={1} value={quantita} onChange={(e) => setQuantita(e.target.value)} />
            </label>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn btn-accent flex-1" onClick={salva} disabled={!valido}>Salva</button>
          <button className="btn flex-1" style={{ background: '#f0ecfa', color: 'var(--accent-strong)' }} onClick={onChiudi}>Annulla</button>
        </div>
        {!valido && <p className="mt-2 text-[11px] text-on-card-low">Nome e codice sono obbligatori.</p>}
      </div>
    </div>
  );
}

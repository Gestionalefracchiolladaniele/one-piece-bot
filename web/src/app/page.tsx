'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useClaupiece, stelle } from '@/lib/useClaupiece';
import { AzioneBtn } from '@/components/AzioneBtn';

// Scorciatoie finestra (bottoni comodi); il valore vero sono ora inizio/fine.
const PRESET_FINESTRA = [
  { emoji: '🌅', label: 'Mattina', inizio: 6, fine: 12 },
  { emoji: '🔆', label: 'Pomeriggio', inizio: 12, fine: 18 },
  { emoji: '🌙', label: 'Sera', inizio: 18, fine: 24 },
];
const ORE = Array.from({ length: 25 }, (_, i) => i); // 0..24

export default function Home() {
  const c = useClaupiece();
  const [msg, setMsg] = useState<string | null>(null);

  // durata finestra (gestisce il cavallo di mezzanotte) → avviso costi
  const durata = c.fine >= c.inizio ? c.fine - c.inizio : 24 - c.inizio + c.fine;
  const valAttive = c.watchlist.filter((w) => w.attiva).length;

  return (
    <main className="mx-auto max-w-[960px] px-4 pt-6 pb-16 sm:px-5 sm:pt-8">
      <header className="mb-6">
        <h1 className="m-0 font-display text-[clamp(26px,7vw,42px)] tracking-tight">Ciao, capitano 🏴‍☠️</h1>
        <p className="mt-1.5 max-w-[560px] text-sm text-text-mid sm:text-base">
          Il tuo quartier generale: controlla la finestra di caccia, avvia una ricerca al volo
          e tieni d’occhio gli ultimi affari.
        </p>
      </header>

      {(c.errore || msg) && (
        <div
          className="card mb-5 p-3.5 text-sm"
          style={c.errore ? { borderColor: 'rgba(239,68,68,0.4)', color: 'var(--alert)' } : undefined}
        >
          {c.errore ? `Errore: ${c.errore}` : msg}
        </div>
      )}

      {/* Riepilogo — stat cards */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/watchlist" className="card p-4 no-underline transition hover:shadow-[var(--glow-accent)]">
          <div className="text-2xl font-bold text-on-card-high">{c.watchlist.length}</div>
          <div className="text-xs text-on-card-mid">Carte in watchlist</div>
          <div className="mt-0.5 text-[11px] text-on-card-low">{valAttive} attive</div>
        </Link>
        <Link href="/collezione" className="card p-4 no-underline transition hover:shadow-[var(--glow-accent)]">
          <div className="text-2xl font-bold text-on-card-high">{c.totale.pezzi}</div>
          <div className="text-xs text-on-card-mid">Pezzi in collezione</div>
          <div className="mt-0.5 text-[11px] text-on-card-low">{c.collezione.length} carte</div>
        </Link>
        <div className="card p-4">
          <div className="text-2xl font-bold text-on-card-high">${c.totale.usd.toFixed(0)}</div>
          <div className="text-xs text-on-card-mid">Valore collezione</div>
          <div className="mt-0.5 text-[11px] text-on-card-low">~{c.totale.eur.toFixed(0)}€ (stima USA)</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-on-card-high">{c.affari.length}</div>
          <div className="text-xs text-on-card-mid">Affari trovati</div>
          <div className="mt-0.5 text-[11px] text-on-card-low">{c.inPausa ? '⏸️ in pausa' : '▶️ attivo'}</div>
        </div>
      </section>

      {/* Azioni rapide */}
      <section className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base text-on-card-high sm:text-lg">⚡ Azioni rapide</h2>
        <div className="flex flex-wrap gap-2">
          <AzioneBtn
            className="btn btn-accent btn-sm"
            onClick={c.avviaCaccia}
            onEsito={setMsg}
            conferma="Avviare subito una ricerca su Vinted? (consuma un avvio Apify)"
          >
            🔎 Avvia caccia ora
          </AzioneBtn>
          <AzioneBtn className="btn btn-sm" onClick={c.inviaRiepilogo} onEsito={setMsg}>
            📤 Invia riepilogo su Telegram
          </AzioneBtn>
          <AzioneBtn className="btn btn-sm" onClick={async () => { await c.ricarica(); setMsg('Dati aggiornati.'); }} onEsito={setMsg}>
            🔄 Ricarica dati
          </AzioneBtn>
          <button
            className={`btn btn-sm ${c.inPausa ? 'btn-accent' : 'btn-danger'}`}
            onClick={() => { c.togglePausa(); setMsg(c.inPausa ? 'Notifiche riattivate.' : 'Notifiche in pausa.'); }}
          >
            {c.inPausa ? '▶️ Riprendi notifiche' : '⏸️ Pausa notifiche'}
          </button>
        </div>
        <p className="mt-2.5 text-xs text-on-card-low">
          “Avvia caccia” lancia il cron GitHub (serve token). “Invia riepilogo” manda lo stato attuale al tuo Telegram.
        </p>
      </section>

      {/* Finestra oraria */}
      <section className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-1 font-display text-base text-on-card-high sm:text-lg">🕕 Finestra di caccia</h2>
        <p className="mb-3 text-xs text-on-card-low">
          Il bot legge Vinted solo dentro questa finestra (fuori → zero costi). Consigliate ~6h.
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-1 items-center gap-2.5 sm:flex-none">
            <span className="text-sm text-on-card-mid">Dalle</span>
            <select
              className="field flex-1 sm:w-auto sm:max-w-[100px]"
              value={c.inizio}
              onChange={(e) => c.salvaFinestra(Number(e.target.value), c.fine)}
            >
              {ORE.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <span className="text-sm text-on-card-mid">alle</span>
            <select
              className="field flex-1 sm:w-auto sm:max-w-[100px]"
              value={c.fine}
              onChange={(e) => c.salvaFinestra(c.inizio, Number(e.target.value))}
            >
              {ORE.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
          <span
            className="badge"
            style={durata > 7 ? { background: 'rgba(239,68,68,0.12)', color: 'var(--alert)' } : undefined}
          >
            {durata}h {durata > 7 ? '· occhio ai costi' : ''}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {PRESET_FINESTRA.map((p) => {
            const attivo = p.inizio === c.inizio && p.fine === c.fine;
            return (
              <button
                key={p.label}
                onClick={() => c.salvaFinestra(p.inizio, p.fine)}
                className={attivo ? 'btn btn-accent btn-sm' : 'btn btn-sm'}
                style={attivo ? undefined : { background: '#f0ecfa', color: 'var(--accent-strong)' }}
              >
                {p.emoji} {p.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Ultimi affari */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg text-text-high">🚨 Ultimi affari</h2>
        </div>
        {c.caricando ? (
          <p className="text-text-low">Carico…</p>
        ) : c.affari.length === 0 ? (
          <div className="card p-5 text-on-card-mid">
            Ancora nessun affare. Appariranno qui (e su Telegram) appena il bot ne trova uno.
          </div>
        ) : (
          <div className="grid gap-3">
            {c.affari.slice(0, 8).map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-on-card-high">{a.titolo || a.codice}</div>
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
                    {a.score_motivo && <div className="mt-1 text-xs text-on-card-low">{a.score_motivo}</div>}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:text-right">
                    <div className="text-[15px]">{stelle(a.score_stelle)}</div>
                    {a.url_annuncio && (
                      <a className="btn btn-accent btn-sm sm:mt-1.5" href={a.url_annuncio} target="_blank" rel="noreferrer">
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

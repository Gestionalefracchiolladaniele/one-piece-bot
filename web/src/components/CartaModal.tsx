'use client';

import { useEffect } from 'react';
import type { VoceCollezione } from '@/lib/types';

// Pop-up dettaglio carta della collezione: immagine grande + info + prezzo/valore.
// Chiude con la X, il click sullo sfondo o il tasto Esc.
export function CartaModal({ voce, onClose }: { voce: VoceCollezione | null; onClose: () => void }) {
  useEffect(() => {
    if (!voce) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // blocca lo scroll di fondo mentre il modal è aperto
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [voce, onClose]);

  if (!voce) return null;
  const carta = voce.carta;
  const nome = carta?.nome || voce.codice;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,7,22,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="card relative w-full max-w-[420px] overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header immagine */}
        <div className="relative flex items-center justify-center p-5" style={{ background: 'linear-gradient(135deg, #2a1150, #7c3aed)' }}>
          <button
            aria-label="Chiudi"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-[color:var(--accent-strong)]"
          >
            ×
          </button>
          {carta?.immagine_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={carta.immagine_url} alt={nome} className="max-h-[300px] rounded-lg object-contain shadow-lg" />
          ) : (
            <div className="py-16 text-6xl">🏴‍☠️</div>
          )}
        </div>

        {/* corpo info */}
        <div className="p-5">
          <h3 className="m-0 font-display text-lg text-on-card-high">{nome}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="badge">{voce.codice}</span>
            {carta?.set && <span className="text-on-card-mid">{carta.set}</span>}
            {carta?.rarita && <span className="badge">{carta.rarita}</span>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border-card p-3">
              <div className="text-[11px] text-on-card-low">Prezzo unitario</div>
              <div className="text-lg font-bold text-on-card-high">
                {voce.prezzo_usd != null ? `$${voce.prezzo_usd.toFixed(2)}` : '—'}
              </div>
              {voce.prezzo_eur != null && <div className="text-[11px] text-on-card-mid">~{voce.prezzo_eur.toFixed(2)}€</div>}
            </div>
            <div className="rounded-lg border border-border-card p-3">
              <div className="text-[11px] text-on-card-low">Valore ({voce.quantita} pz)</div>
              <div className="text-lg font-bold text-on-card-high">
                {voce.valore_usd != null ? `$${voce.valore_usd.toFixed(2)}` : '—'}
              </div>
              {voce.valore_eur != null && <div className="text-[11px] text-on-card-mid">~{voce.valore_eur.toFixed(2)}€</div>}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-on-card-low">Prezzo: stima mercato USA (tcgapi/TCGPlayer).</p>
        </div>
      </div>
    </div>
  );
}

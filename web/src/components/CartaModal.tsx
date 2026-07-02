'use client';

import { useEffect } from 'react';
import type { VoceCollezione } from '@/lib/types';
import { AzioneBtn } from '@/components/AzioneBtn';

// Pop-up dettaglio carta della collezione: immagine grande + info + prezzo/valore.
// Se passate le azioni (onQuantita/onPrezzo/onRimuovi), mostra anche i controlli per
// gestire la carta direttamente dal raccoglitore. Chiude con X, sfondo o Esc.
export function CartaModal({
  voce,
  onClose,
  onQuantita,
  onPrezzo,
  onRimuovi,
  onEsito,
}: {
  voce: VoceCollezione | null;
  onClose: () => void;
  onQuantita?: (codice: string, quantita: number) => void;
  onPrezzo?: (codice: string) => Promise<string>;
  onRimuovi?: (codice: string) => void;
  onEsito?: (msg: string | null) => void;
}) {
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

          {/* Azioni (solo se fornite dal chiamante: gestione dalla collezione) */}
          {(onQuantita || onPrezzo || onRimuovi) && (
            <div className="mt-4 border-t border-border-card pt-3">
              {onQuantita && (
                <label className="mb-3 flex items-center gap-2 text-sm text-on-card-mid">
                  Quantità posseduta
                  <input
                    className="field w-[80px]"
                    type="number"
                    min={1}
                    value={voce.quantita}
                    onChange={(e) => onQuantita(voce.codice, Math.max(1, Number(e.target.value)))}
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {onPrezzo && (
                  <AzioneBtn
                    className="btn btn-sm flex-1"
                    onClick={() => onPrezzo(voce.codice)}
                    onEsito={onEsito}
                  >
                    💲 Aggiorna prezzo
                  </AzioneBtn>
                )}
                {onRimuovi && (
                  <button className="btn btn-danger btn-sm flex-1" onClick={() => onRimuovi(voce.codice)}>
                    🗑️ Rimuovi
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

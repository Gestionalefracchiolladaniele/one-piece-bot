'use client';

import { useState } from 'react';
import { RARITA_TCG } from '@/lib/useClaupiece';

// Barra di ricerca condivisa (collezione + watchlist): design pulito e coerente.
// Due azioni distinte e chiare:
//  - 🔍 Cerca   → ricerca nel DB locale (gratis, istantanea) [azione primaria]
//  - 🌐 tcgapi  → ricerca online con prezzo (1 richiesta) [azione secondaria]
// Il filtro rarità (per la ricerca tcgapi) e "inserisci a mano" stanno in una riga
// discreta sotto, senza affollare. Niente stato interno se non l'apertura del filtro:
// query/rarità sono controllate dal genitore.
export function BarraRicerca({
  query,
  onQuery,
  rarita,
  onRarita,
  onCercaDb,
  onCercaTcg,
  onManuale,
  cercando,
  fonteAttiva, // 'db' | 'tcg' | null → per lo spinner sul bottone giusto
  placeholder,
}: {
  query: string;
  onQuery: (v: string) => void;
  rarita: string;
  onRarita: (v: string) => void;
  onCercaDb: () => void;
  onCercaTcg: () => void;
  onManuale: () => void;
  cercando: boolean;
  fonteAttiva: 'db' | 'tcg' | null;
  placeholder: string;
}) {
  const [filtroAperto, setFiltroAperto] = useState(false);
  const disabilitato = cercando || query.trim().length < 2;

  return (
    <div>
      {/* Riga principale: input + due bottoni allineati */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field flex-1"
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCercaDb(); }}
        />
        <div className="flex gap-2">
          <button
            className="btn btn-accent flex-1 shrink-0 sm:flex-none"
            onClick={onCercaDb}
            disabled={disabilitato}
          >
            {cercando && fonteAttiva === 'db' ? '…' : '🔍 Cerca'}
          </button>
          <button
            className="btn flex-1 shrink-0 sm:flex-none"
            style={{ background: '#f0ecfa', color: 'var(--accent-strong)' }}
            onClick={onCercaTcg}
            disabled={disabilitato}
            title="Cerca online su tcgapi (usa 1 richiesta del limite giornaliero)"
          >
            {cercando && fonteAttiva === 'tcg' ? '…' : '🌐 tcgapi'}
          </button>
        </div>
      </div>

      {/* Riga discreta: filtro rarità (sx) + inserisci a mano (dx) */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          onClick={() => setFiltroAperto((v) => !v)}
          className="flex items-center gap-1 text-[12px] font-medium text-on-card-mid transition hover:text-[color:var(--accent-strong)]"
        >
          <span>⚙️ Filtro rarità</span>
          {rarita && <span className="badge">{rarita}</span>}
          <span className="text-[10px]">{filtroAperto ? '▲' : '▾'}</span>
        </button>
        <button
          onClick={onManuale}
          className="text-[12px] font-medium text-on-card-mid transition hover:text-[color:var(--accent-strong)]"
        >
          ✍️ Inserisci a mano
        </button>
      </div>

      {/* Pannello filtro rarità (chip cliccabili, solo per la ricerca tcgapi) */}
      {filtroAperto && (
        <div className="mt-2 rounded-lg border border-border-card bg-[#f7f5fc] p-2.5">
          <p className="mb-2 text-[11px] text-on-card-low">
            Restringe la ricerca <strong>🌐 tcgapi</strong> a una rarità (es. Leader, Alt Art):
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onRarita('')}
              className={`btn btn-sm ${rarita === '' ? 'btn-accent' : ''}`}
              style={rarita === '' ? undefined : { background: '#fff', color: 'var(--accent-strong)' }}
            >
              Tutte
            </button>
            {RARITA_TCG.map((r) => (
              <button
                key={r}
                onClick={() => onRarita(r)}
                className={`btn btn-sm ${rarita === r ? 'btn-accent' : ''}`}
                style={rarita === r ? undefined : { background: '#fff', color: 'var(--accent-strong)' }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { RARITA_TCG, CATEGORIE_TCG } from '@/lib/useClaupiece';

// Barra di ricerca condivisa (collezione + watchlist): design pulito e coerente.
// Due azioni distinte e chiare:
//  - 🔍 Cerca   → ricerca nel DB locale (gratis, istantanea) [azione primaria]
//  - 🌐 tcgapi  → ricerca online con prezzo (1 richiesta) [azione secondaria]
// Un unico bottone "Filtro" che, aperto, mostra DUE righe: Categoria (tipo carta) e
// Rarità. I filtri valgono per entrambe le ricerche. "Inserisci a mano" a destra.
export function BarraRicerca({
  query,
  onQuery,
  categoria,
  onCategoria,
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
  categoria: string;
  onCategoria: (v: string) => void;
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
  const nFiltri = (categoria ? 1 : 0) + (rarita ? 1 : 0);

  // Riga di chip riutilizzabile (Tutte + valori).
  const RigaChip = ({
    label, valori, attivo, onScegli,
  }: {
    label: string; valori: string[]; attivo: string; onScegli: (v: string) => void;
  }) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[74px] shrink-0 text-[11px] font-semibold text-on-card-mid">{label}</span>
      <button
        onClick={() => onScegli('')}
        className={`btn btn-sm ${attivo === '' ? 'btn-accent' : ''}`}
        style={attivo === '' ? undefined : { background: '#fff', color: 'var(--accent-strong)' }}
      >
        Tutte
      </button>
      {valori.map((v) => (
        <button
          key={v}
          onClick={() => onScegli(v)}
          className={`btn btn-sm ${attivo === v ? 'btn-accent' : ''}`}
          style={attivo === v ? undefined : { background: '#fff', color: 'var(--accent-strong)' }}
        >
          {v}
        </button>
      ))}
    </div>
  );

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

      {/* Riga discreta: bottone filtro (sx) + inserisci a mano (dx) */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          onClick={() => setFiltroAperto((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-on-card-mid transition hover:text-[color:var(--accent-strong)]"
        >
          <span>⚙️ Filtri</span>
          {nFiltri > 0 && <span className="badge">{nFiltri}</span>}
          <span className="text-[10px]">{filtroAperto ? '▲' : '▾'}</span>
        </button>
        <button
          onClick={onManuale}
          className="text-[12px] font-medium text-on-card-mid transition hover:text-[color:var(--accent-strong)]"
        >
          ✍️ Inserisci a mano
        </button>
      </div>

      {/* Pannello filtri: Categoria (sopra) + Rarità (sotto). Valgono per Cerca e tcgapi. */}
      {filtroAperto && (
        <div className="mt-2 space-y-2.5 rounded-lg border border-border-card bg-[#f7f5fc] p-3">
          <RigaChip label="Categoria" valori={CATEGORIE_TCG} attivo={categoria} onScegli={onCategoria} />
          <RigaChip label="Rarità" valori={RARITA_TCG} attivo={rarita} onScegli={onRarita} />
          <p className="text-[10px] text-on-card-low">
            I filtri valgono sia per <strong>🔍 Cerca</strong> sia per <strong>🌐 tcgapi</strong>.
          </p>
        </div>
      )}
    </div>
  );
}

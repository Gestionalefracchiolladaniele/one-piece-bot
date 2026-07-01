'use client';

// Hook condiviso: unica fonte di verità per lo stato dell'app (watchlist, affari,
// config/finestra, collezione) + tutte le azioni verso le API route. Le tre pagine
// (Home, Watchlist, Collezione) lo consumano, così la logica non è duplicata.

import { useCallback, useEffect, useState } from 'react';
import type { Affare, AppConfig, Carta, TotaleCollezione, VoceCollezione, Watch } from './types';

// Carta dalla ricerca live tcgapi (con prezzo) — rispecchia /api/cards?live=1.
export type CartaLive = {
  codice: string;
  nome: string;
  set: string;
  rarita: string;
  printing: string;
  tipo: string;
  immagine_url: string;
  prezzo_usd: number | null;
  prezzo_eur: number | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'errore');
  return j as T;
}

export function useClaupiece() {
  const [watchlist, setWatchlist] = useState<Watch[]>([]);
  const [affari, setAffari] = useState<Affare[]>([]);
  const [inizio, setInizio] = useState(18);
  const [fine, setFine] = useState(24);
  const [inPausa, setInPausa] = useState(false);
  const [collezione, setCollezione] = useState<VoceCollezione[]>([]);
  const [totale, setTotale] = useState<TotaleCollezione>({ pezzi: 0, usd: 0, eur: 0 });
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const ricarica = useCallback(async () => {
    try {
      const [w, d, c, col] = await Promise.all([
        api<{ watchlist: Watch[] }>('/api/watchlist'),
        api<{ affari: Affare[] }>('/api/deals?limit=30'),
        api<{ config: AppConfig }>('/api/config'),
        api<{ collezione: VoceCollezione[]; totale: TotaleCollezione }>('/api/collezione'),
      ]);
      setWatchlist(w.watchlist);
      setAffari(d.affari);
      setCollezione(col.collezione);
      setTotale(col.totale);
      if (c.config) {
        if (c.config.finestra_inizio != null) setInizio(c.config.finestra_inizio);
        if (c.config.finestra_fine != null) setFine(c.config.finestra_fine);
        setInPausa(!!c.config.in_pausa);
      }
      setErrore(null);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => {
    ricarica();
  }, [ricarica]);

  // ── Watchlist ──
  const cercaCarte = useCallback(async (q: string): Promise<Carta[]> => {
    if (!q.trim()) return [];
    const { carte } = await api<{ carte: Carta[] }>(`/api/cards?q=${encodeURIComponent(q.trim())}`);
    return carte;
  }, []);

  const aggiungiWatch = useCallback(async (codice: string) => {
    await api('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice }),
    });
    ricarica();
  }, [ricarica]);

  const aggiornaWatch = useCallback(async (codice: string, campi: Partial<Watch>) => {
    await api('/api/watchlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, ...campi }),
    });
    ricarica();
  }, [ricarica]);

  const rimuoviWatch = useCallback(async (codice: string) => {
    await api(`/api/watchlist?codice=${encodeURIComponent(codice)}`, { method: 'DELETE' });
    ricarica();
  }, [ricarica]);

  // ── Collezione (ricerca live tcgapi) ──
  const cercaLive = useCallback(async (q: string): Promise<CartaLive[]> => {
    if (!q.trim()) return [];
    const { carte } = await api<{ carte: CartaLive[] }>(`/api/cards?live=1&q=${encodeURIComponent(q.trim())}`);
    return carte;
  }, []);

  const aggiungiColl = useCallback(async (codice: string) => {
    await api('/api/collezione', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice }),
    });
    ricarica();
  }, [ricarica]);

  const aggiornaColl = useCallback(async (codice: string, campi: Partial<VoceCollezione>) => {
    await api('/api/collezione', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, ...campi }),
    });
    ricarica();
  }, [ricarica]);

  const rimuoviColl = useCallback(async (codice: string) => {
    await api(`/api/collezione?codice=${encodeURIComponent(codice)}`, { method: 'DELETE' });
    ricarica();
  }, [ricarica]);

  // ── Config / finestra ──
  const salvaFinestra = useCallback(async (nuovoInizio: number, nuovaFine: number) => {
    setInizio(nuovoInizio);
    setFine(nuovaFine);
    await api('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finestra_inizio: nuovoInizio, finestra_fine: nuovaFine }),
    });
  }, []);

  const togglePausa = useCallback(async () => {
    const nuovo = !inPausa;
    setInPausa(nuovo);
    await api('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ in_pausa: nuovo }),
    });
  }, [inPausa]);

  // ── Azioni operative (ritornano un messaggio d'esito da mostrare) ──
  const aggiornaPrezziColl = useCallback(async (): Promise<string> => {
    const r = await api<{ aggiornate: number; totali: number }>('/api/collezione/prezzi', {
      method: 'POST',
    });
    ricarica();
    return `Prezzi aggiornati: ${r.aggiornate}/${r.totali} carte.`;
  }, [ricarica]);

  const avviaCaccia = useCallback(async (): Promise<string> => {
    const r = await api<{ ok: boolean; msg: string }>('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'avvia_caccia' }),
    });
    return r.msg;
  }, []);

  const inviaRiepilogo = useCallback(async (): Promise<string> => {
    const r = await api<{ ok: boolean; msg: string }>('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invia_riepilogo' }),
    });
    return r.msg;
  }, []);

  return {
    // stato
    watchlist, affari, inizio, fine, inPausa, collezione, totale, caricando, errore,
    // azioni
    ricarica, cercaCarte, aggiungiWatch, aggiornaWatch, rimuoviWatch,
    cercaLive, aggiungiColl, aggiornaColl, rimuoviColl,
    salvaFinestra, togglePausa,
    aggiornaPrezziColl, avviaCaccia, inviaRiepilogo,
  };
}

export function stelle(n: number | null): string {
  return '⭐'.repeat(Math.max(0, Math.min(5, n ?? 0)));
}

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

  // ── Ricerca carte ──
  // DEFAULT: cerca nell'anagrafica LOCALE (~4500 carte da punk-records). Zero costo,
  // zero chiamate esterne. Ritorna CartaLive (prezzo null: verrà preso all'aggiunta).
  const cercaCarte = useCallback(async (q: string): Promise<CartaLive[]> => {
    if (q.trim().length < 2) return [];
    const { carte } = await api<{ carte: CartaLive[] }>(`/api/cards?q=${encodeURIComponent(q.trim())}`);
    return carte;
  }, []);

  // Ricarica MIRATA: solo la watchlist / solo la collezione (non tutti e 4 i fetch),
  // usata dopo un'aggiunta per riflettere l'anagrafica arricchita dal server.
  const ricaricaWatch = useCallback(async () => {
    const w = await api<{ watchlist: Watch[] }>('/api/watchlist');
    setWatchlist(w.watchlist);
  }, []);
  const ricaricaColl = useCallback(async () => {
    const col = await api<{ collezione: VoceCollezione[]; totale: TotaleCollezione }>('/api/collezione');
    setCollezione(col.collezione);
    setTotale(col.totale);
  }, []);

  // `carta` = dati dalla ricerca live, passati così la route salva l'anagrafica
  // senza dover ri-cercare per codice su tcgapi (che cerca solo per nome).
  const aggiungiWatch = useCallback(async (codice: string, carta?: CartaLive) => {
    await api('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, carta }),
    });
    ricaricaWatch(); // un solo fetch, non ricarica() completo
  }, [ricaricaWatch]);

  // Ottimistico: aggiorna subito lo stato locale (UI istantanea), poi PATCH in
  // background. Se il server rifiuta, risincronizza dalla watchlist.
  const aggiornaWatch = useCallback((codice: string, campi: Partial<Watch>) => {
    setWatchlist((prev) => prev.map((w) => (w.codice === codice ? { ...w, ...campi } : w)));
    api('/api/watchlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, ...campi }),
    }).catch(() => ricaricaWatch());
  }, [ricaricaWatch]);

  const rimuoviWatch = useCallback((codice: string) => {
    setWatchlist((prev) => prev.filter((w) => w.codice !== codice)); // sparisce subito
    api(`/api/watchlist?codice=${encodeURIComponent(codice)}`, { method: 'DELETE' })
      .catch(() => ricaricaWatch());
  }, [ricaricaWatch]);

  // Fallback ONLINE: cerca su tcgapi (con prezzo). Usato solo quando il DB non trova
  // la carta (bottone "🌐 tcgapi"). Costa 1 richiesta del budget 100/giorno. Filtri
  // opzionali (rarity/printing) per mirare la ricerca online → risultato più preciso.
  const cercaOnline = useCallback(async (q: string, filtri?: { rarity?: string; printing?: string }): Promise<CartaLive[]> => {
    if (q.trim().length < 2) return [];
    const params = new URLSearchParams({ live: '1', q: q.trim() });
    if (filtri?.rarity) params.set('rarity', filtri.rarity);
    if (filtri?.printing) params.set('printing', filtri.printing);
    const { carte } = await api<{ carte: CartaLive[] }>(`/api/cards?${params.toString()}`);
    return carte;
  }, []);

  const aggiungiColl = useCallback(async (codice: string, carta?: CartaLive, quantita?: number) => {
    await api('/api/collezione', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, carta, quantita }),
    });
    ricaricaColl(); // un solo fetch (serve per valore/totale ricalcolati dal server)
  }, [ricaricaColl]);

  // Ottimistico su quantità: aggiorna subito riga + totale localmente, poi PATCH.
  const aggiornaColl = useCallback((codice: string, campi: Partial<VoceCollezione>) => {
    setCollezione((prev) => {
      const next = prev.map((v) => {
        if (v.codice !== codice) return v;
        const nv = { ...v, ...campi };
        // ricalcola il valore riga se cambia la quantità (prezzo unitario invariato)
        if (campi.quantita != null && nv.prezzo_usd != null) {
          nv.valore_usd = Math.round(nv.prezzo_usd * nv.quantita * 100) / 100;
          nv.valore_eur = nv.prezzo_eur != null ? Math.round(nv.prezzo_eur * nv.quantita * 100) / 100 : null;
        }
        return nv;
      });
      // ricalcola i totali dallo stato aggiornato
      const pezzi = next.reduce((s, v) => s + v.quantita, 0);
      const usd = Math.round(next.reduce((s, v) => s + (v.valore_usd ?? 0), 0) * 100) / 100;
      const eur = Math.round(next.reduce((s, v) => s + (v.valore_eur ?? 0), 0) * 100) / 100;
      setTotale({ pezzi, usd, eur });
      return next;
    });
    api('/api/collezione', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, ...campi }),
    }).catch(() => ricaricaColl());
  }, [ricaricaColl]);

  const rimuoviColl = useCallback((codice: string) => {
    setCollezione((prev) => {
      const next = prev.filter((v) => v.codice !== codice);
      const pezzi = next.reduce((s, v) => s + v.quantita, 0);
      const usd = Math.round(next.reduce((s, v) => s + (v.valore_usd ?? 0), 0) * 100) / 100;
      const eur = Math.round(next.reduce((s, v) => s + (v.valore_eur ?? 0), 0) * 100) / 100;
      setTotale({ pezzi, usd, eur });
      return next;
    });
    api(`/api/collezione?codice=${encodeURIComponent(codice)}`, { method: 'DELETE' })
      .catch(() => ricaricaColl());
  }, [ricaricaColl]);

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
    await ricaricaColl();
    return `Prezzi aggiornati: ${r.aggiornate}/${r.totali} carte.`;
  }, [ricaricaColl]);

  // Aggiorna il prezzo di UNA sola carta (1 richiesta tcgapi) — evita di risprecare
  // richieste su carte già aggiornate.
  const aggiornaPrezzoCarta = useCallback(async (codice: string): Promise<string> => {
    const r = await api<{ aggiornate: number }>(
      `/api/collezione/prezzi?codice=${encodeURIComponent(codice)}`,
      { method: 'POST' },
    );
    await ricaricaColl();
    return r.aggiornate ? `Prezzo di ${codice} aggiornato.` : `Nessun prezzo trovato per ${codice}.`;
  }, [ricaricaColl]);

  // Aggiorna il prezzo SOLO delle carte selezionate (1 richiesta tcgapi per carta) →
  // chiamate mirate, si spende solo su ciò che serve (budget 100/giorno).
  const aggiornaPrezziCarte = useCallback(async (codici: string[]): Promise<string> => {
    if (!codici.length) return 'Nessuna carta selezionata.';
    const r = await api<{ aggiornate: number; totali: number }>(
      `/api/collezione/prezzi?codici=${encodeURIComponent(codici.join(','))}`,
      { method: 'POST' },
    );
    await ricaricaColl();
    return `Prezzi aggiornati: ${r.aggiornate}/${r.totali} carte selezionate.`;
  }, [ricaricaColl]);

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
    ricarica, cercaCarte, cercaOnline, aggiungiWatch, aggiornaWatch, rimuoviWatch,
    aggiungiColl, aggiornaColl, rimuoviColl,
    salvaFinestra, togglePausa,
    aggiornaPrezziColl, aggiornaPrezzoCarta, aggiornaPrezziCarte, avviaCaccia, inviaRiepilogo,
  };
}

export function stelle(n: number | null): string {
  return '⭐'.repeat(Math.max(0, Math.min(5, n ?? 0)));
}

// Rarità One Piece TCG (come le etichetta tcgapi) per il filtro della ricerca online.
export const RARITA_TCG = [
  'Leader', 'Common', 'Uncommon', 'Rare', 'SuperRare', 'SecretRare',
  'Special', 'TreasureRare', 'Promo',
];

// URL immagine sicuro per il browser. Le immagini ufficiali One Piece bloccano il
// cross-origin (CORP: same-site) → le facciamo passare dal nostro proxy /api/img,
// così vengono servite dal nostro dominio e il browser le mostra. Gli altri URL
// (es. foto manuali incollate dall'utente) restano invariati.
export function imgSrc(url?: string | null): string {
  if (!url) return '';
  if (/(^https?:\/\/)?([a-z-]+\.)?onepiece-cardgame\.com\//i.test(url)) {
    return `/api/img?u=${encodeURIComponent(url)}`;
  }
  return url;
}

// Client tcgapi.dev lato server (Next route handlers). Ricerca carte One Piece
// con prezzi (mercato USA/TCGPlayer, USD). Mostrati anche in € come stima (cambio).
// Free tier: 100 richieste/giorno. Header X-API-Key. Mai usare dal client.

import { env } from './env';

// Riga carta normalizzata → rispecchia la tabella `carte` + prezzi indicativi.
export type CartaLive = {
  codice: string;       // `number` su tcgapi (es. OP01-120)
  nome: string;
  set: string;
  rarita: string;
  tipo: string;
  immagine_url: string;
  prezzo_usd: number | null;
  prezzo_eur: number | null;
};

// Prezzo di riferimento: mediana (robusta), poi market, poi low.
function prezzoScelto(card: any): number | null {
  for (const campo of ['median_price', 'market_price', 'low_price', 'lowest_with_shipping']) {
    const v = card?.[campo];
    if (v != null && Number(v) > 0) return Number(v);
  }
  return null;
}

function normalizza(card: any): CartaLive | null {
  const codice = String(card?.number ?? '').trim().toUpperCase();
  if (!codice) return null;
  const usd = prezzoScelto(card);
  const eur = usd != null ? Math.round(usd * env.cambioUsdEur * 100) / 100 : null;
  return {
    codice,
    nome: String(card?.name ?? '').trim(),
    set: String(card?.set_name ?? '').trim(),
    rarita: String(card?.rarity ?? '').trim(),
    tipo: String(card?.product_type ?? '').trim(),
    immagine_url: String(card?.image_url ?? '').trim(),
    prezzo_usd: usd,
    prezzo_eur: eur,
  };
}

// Cerca carte per nome/testo. 1 sola chiamata (una pagina). Ritorna [] se la key
// manca o la chiamata fallisce (la UI lo gestisce mostrando "nessun risultato").
export async function cercaLive(q: string, perPage = 20): Promise<CartaLive[]> {
  if (!env.tcgapiKey || !q.trim()) return [];
  const url =
    `${env.tcgapiBase}/search?game=${encodeURIComponent(env.tcgapiGameSlug)}` +
    `&q=${encodeURIComponent(q.trim())}&per_page=${perPage}&page=1`;
  try {
    const r = await fetch(url, {
      headers: { 'X-API-Key': env.tcgapiKey, Accept: 'application/json' },
      // Non cachiamo: i prezzi cambiano e il budget è per-giorno, non per-chiamata.
      cache: 'no-store',
    });
    if (!r.ok) return [];
    const j = await r.json();
    return ((j?.data ?? []) as any[])
      .map(normalizza)
      .filter((c): c is CartaLive => c != null);
  } catch {
    return [];
  }
}

// Trova UNA carta per codice esatto (es. OP01-120): cerca per codice come testo e
// filtra sul `number`. Usata quando si aggiunge in collezione per salvare anagrafica
// + prezzo. Ritorna null se non trovata.
export async function cartaPerCodice(codice: string): Promise<CartaLive | null> {
  const cod = codice.trim().toUpperCase();
  if (!cod) return null;
  const risultati = await cercaLive(cod, 30);
  return risultati.find((c) => c.codice === cod) ?? null;
}

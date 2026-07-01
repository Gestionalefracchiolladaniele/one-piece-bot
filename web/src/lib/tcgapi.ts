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
  printing: string;     // Normal/Foil — aiuta a distinguere le varianti
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
    printing: String(card?.printing ?? '').trim(),
    tipo: String(card?.product_type ?? '').trim(),
    immagine_url: String(card?.image_url ?? '').trim(),
    prezzo_usd: usd,
    prezzo_eur: eur,
  };
}

// Riconosce un codice carta One Piece (es. OP01-025, ST30-001, EB01-006).
const RE_CODICE = /^[A-Z]{1,4}\d{0,2}-\d{1,3}$/i;

// Chiamata grezza a /search (una pagina). Ritorna le carte normalizzate.
async function rawSearch(q: string, perPage: number): Promise<CartaLive[]> {
  const url =
    `${env.tcgapiBase}/search?game=${encodeURIComponent(env.tcgapiGameSlug)}` +
    `&q=${encodeURIComponent(q)}&per_page=${perPage}&page=1`;
  const r = await fetch(url, {
    headers: { 'X-API-Key': env.tcgapiKey, Accept: 'application/json' },
    cache: 'no-store', // i prezzi cambiano; il budget è per-giorno, non per-chiamata
  });
  if (!r.ok) return [];
  const j = await r.json();
  return ((j?.data ?? []) as any[]).map(normalizza).filter((c): c is CartaLive => c != null);
}

// Cerca carte per NOME (tcgapi cerca solo nel nome, min 2 caratteri). Se l'utente
// digita un codice esatto (es. OP05-067), tcgapi non lo trova per `number`: proviamo
// comunque come testo (becca le carte che hanno il codice nel nome) e teniamo solo
// il match esatto. Per nomi normali, ricerca testuale diretta ordinata per rilevanza.
// Ritorna [] se la key manca o la chiamata fallisce (la UI mostra "nessun risultato").
export async function cercaLive(q: string, perPage = 20): Promise<CartaLive[]> {
  const query = q.trim();
  if (!env.tcgapiKey || query.length < 2) return [];
  try {
    const risultati = await rawSearch(query, perPage);
    // Se era un codice, restringi al number esatto (se qualcuno matcha davvero).
    if (RE_CODICE.test(query)) {
      const cod = query.toUpperCase();
      const esatte = risultati.filter((c) => c.codice === cod);
      return esatte.length ? esatte : risultati;
    }
    return risultati;
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
  const risultati = await cercaLive(cod, 50);
  return risultati.find((c) => c.codice === cod) ?? null;
}

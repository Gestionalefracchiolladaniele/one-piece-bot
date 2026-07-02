import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cercaLive, type CartaLive } from '@/lib/tcgapi';

// GET /api/cards?q=shanks         → ricerca nell'ANAGRAFICA locale (DB, ~4500 carte
//                                    da punk-records). ZERO chiamate esterne, zero costo.
//                                    È la ricerca di DEFAULT: autopopola mentre l'utente
//                                    sceglie la carta; il prezzo tcgapi si prende SOLO al
//                                    click "Colleziona/Aggiungi" (POST, per il number esatto).
// GET /api/cards?q=shanks&live=1  → ricerca LIVE su tcgapi (con prezzo). Fallback quando
//                                    il DB non trova la carta (bottone "Cerca online").
//                                    Costa 1 richiesta del budget 100/giorno.

// Riga DB `carte` → formato CartaLive (stesso shape della ricerca tcgapi, così i
// componenti UI sono identici). Prezzo null: lo si recupererà al momento dell'aggiunta.
function daDb(c: {
  codice: string; nome: string; set: string; rarita: string; tipo: string; immagine_url: string;
}): CartaLive {
  return {
    codice: c.codice,
    nome: c.nome,
    set: c.set,
    rarita: c.rarita,
    printing: '',
    tipo: c.tipo,
    immagine_url: c.immagine_url,
    prezzo_usd: null,
    prezzo_eur: null,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const live = url.searchParams.get('live') === '1';
  if (q.length < 2) return NextResponse.json({ carte: [] });

  // Ricerca live tcgapi (fallback esplicito, con prezzo).
  if (live) {
    const carte = await cercaLive(q, 100);
    return NextResponse.json({ carte, live: true });
  }

  // Ricerca di default: anagrafica locale (nome o codice). Nessun costo esterno.
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('carte')
    .select('codice, nome, set, rarita, tipo, immagine_url')
    .or(`nome.ilike.%${q}%,codice.ilike.%${q}%`)
    .limit(120);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ordina per rilevanza: match esatto/inizio-nome prima, poi per codice. Le varianti
  // (stesso nome, codici _P1/_P2) restano vicine. Il prezzo lo darà il POST alla scelta.
  const ql = q.toLowerCase();
  const carte = (data ?? [])
    .map(daDb)
    .sort((a, b) => {
      const an = a.nome.toLowerCase();
      const bn = b.nome.toLowerCase();
      const ap = an === ql ? 0 : an.startsWith(ql) ? 1 : 2;
      const bp = bn === ql ? 0 : bn.startsWith(ql) ? 1 : 2;
      if (ap !== bp) return ap - bp;
      return a.codice.localeCompare(b.codice);
    });
  return NextResponse.json({ carte });
}

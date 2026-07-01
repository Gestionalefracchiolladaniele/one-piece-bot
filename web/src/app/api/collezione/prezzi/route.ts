import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cartaPerCodice } from '@/lib/tcgapi';

// POST /api/collezione/prezzi        → aggiorna TUTTE le carte in collezione.
// POST /api/collezione/prezzi?codice=OP01-025 → aggiorna SOLO quella carta.
// Rilegge i prezzi tcgapi (USD) e li salva nello storico. 1 richiesta tcgapi per
// carta → il singolo evita di risprecare richieste su carte già aggiornate.
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const solo = new URL(req.url).searchParams.get('codice')?.trim().toUpperCase();

  let codici: string[];
  if (solo) {
    codici = [solo];
  } else {
    const { data: coll, error } = await sb.from('collezione').select('codice');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    codici = (coll ?? []).map((c) => c.codice);
  }
  if (!codici.length) return NextResponse.json({ aggiornate: 0, totali: 0 });

  let aggiornate = 0;
  for (const codice of codici) {
    const live = await cartaPerCodice(codice).catch(() => null);
    if (live?.prezzo_usd != null) {
      await sb.from('prezzi_riferimento').insert({
        codice, fonte: 'tcgapi', prezzo: live.prezzo_usd, valuta: 'USD',
      });
      aggiornate++;
    }
  }
  return NextResponse.json({ aggiornate, totali: codici.length });
}

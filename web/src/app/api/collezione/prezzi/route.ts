import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cartaPerCodice } from '@/lib/tcgapi';

// POST /api/collezione/prezzi → rilegge i prezzi tcgapi (USD) delle carte in
// collezione e li salva nello storico. Attenzione al budget tcgapi (100 req/giorno):
// una chiamata per carta, quindi va usato con parsimonia (bottone manuale, non auto).
export async function POST() {
  const sb = supabaseAdmin();
  const { data: coll, error } = await sb.from('collezione').select('codice');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const codici = (coll ?? []).map((c) => c.codice);
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

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cartaPerCodice } from '@/lib/tcgapi';

// POST /api/collezione/prezzi                  → aggiorna TUTTE le carte in collezione.
// POST /api/collezione/prezzi?codice=OP01-025   → aggiorna SOLO quella carta.
// POST /api/collezione/prezzi?codici=A,B,C       → aggiorna SOLO le carte selezionate.
// Rilegge i prezzi tcgapi (USD) e li salva nello storico. 1 richiesta tcgapi per
// carta → aggiornare solo le selezionate risparmia il budget (100/giorno).
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const solo = url.searchParams.get('codice')?.trim().toUpperCase();
  const lista = url.searchParams.get('codici');

  let codici: string[];
  if (solo) {
    codici = [solo];
  } else if (lista) {
    // Lista esplicita di codici selezionati (spunte nel raccoglitore).
    codici = lista.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
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

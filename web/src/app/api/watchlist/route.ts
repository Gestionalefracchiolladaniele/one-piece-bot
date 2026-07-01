import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Tutte le letture/scritture passano dal service role (RLS deny-all sullo schema).

// GET → la watchlist completa, arricchita con l'anagrafica carta e l'ultimo prezzo.
export async function GET() {
  const sb = supabaseAdmin();
  const { data: watch, error } = await sb
    .from('watchlist')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const codici = (watch ?? []).map((w) => w.codice);
  const { data: carte } = codici.length
    ? await sb.from('carte').select('*').in('codice', codici)
    : { data: [] as any[] };
  const perCodice = new Map((carte ?? []).map((c) => [c.codice, c]));

  const arricchita = (watch ?? []).map((w) => ({ ...w, carta: perCodice.get(w.codice) ?? null }));
  return NextResponse.json({ watchlist: arricchita });
}

// POST → aggiunge (o aggiorna) una carta in watchlist. Body: { codice, ...campi }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const codice = String(body.codice ?? '').trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });

  const record = {
    codice,
    attiva: body.attiva ?? true,
    priorita: body.priorita ?? 'normale',
    // Default prezzo_max: funziona senza CardTrader (perc_sconto richiede il riferimento).
    regola_tipo: body.regola_tipo ?? 'prezzo_max',
    regola_valore: body.regola_valore ?? 30,
    paese: body.paese ?? 'it',
  };
  const sb = supabaseAdmin();
  const { error } = await sb.from('watchlist').upsert(record);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH → aggiorna i campi di una carta in watchlist. Body: { codice, ...campi }.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const codice = String(body.codice ?? '').trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });
  const { codice: _c, carta: _carta, ...campi } = body;
  const sb = supabaseAdmin();
  const { error } = await sb.from('watchlist').update(campi).eq('codice', codice);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE → rimuove una carta. Query: ?codice=OP01-120.
export async function DELETE(req: Request) {
  const codice = new URL(req.url).searchParams.get('codice')?.trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });
  const sb = supabaseAdmin();
  const { error } = await sb.from('watchlist').delete().eq('codice', codice);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

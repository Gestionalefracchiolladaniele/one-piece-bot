import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET → la config globale (finestra oraria a orari liberi, pausa, ecc.).
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('config').select('*').eq('id', 1).limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const cfg = data?.[0] ?? { id: 1, finestra_inizio: 18, finestra_fine: 24, in_pausa: false };
  return NextResponse.json({ config: cfg });
}

// PATCH → aggiorna la config. Body: { finestra_inizio?, finestra_fine?, in_pausa? }.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const record: Record<string, unknown> = { id: 1 };

  if (body.finestra_inizio != null) {
    const h = Number(body.finestra_inizio);
    if (Number.isInteger(h) && h >= 0 && h <= 24) record.finestra_inizio = h;
  }
  if (body.finestra_fine != null) {
    const h = Number(body.finestra_fine);
    if (Number.isInteger(h) && h >= 0 && h <= 24) record.finestra_fine = h;
  }
  if (typeof body.in_pausa === 'boolean') record.in_pausa = body.in_pausa;

  const sb = supabaseAdmin();
  const { error } = await sb.from('config').upsert(record);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

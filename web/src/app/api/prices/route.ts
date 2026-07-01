import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/prices?codice=OP01-120 → storico prezzi di riferimento (grafico dashboard).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const codice = (url.searchParams.get('codice') ?? '').trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });
  const fonte = url.searchParams.get('fonte') ?? 'cardtrader';

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('prezzi_riferimento')
    .select('*')
    .eq('codice', codice)
    .eq('fonte', fonte)
    .order('timestamp', { ascending: true })
    .limit(120);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ storico: data ?? [] });
}

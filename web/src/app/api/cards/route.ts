import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/cards?q=shanks → ricerca carte per nome o codice (per aggiungere in watchlist).
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ carte: [] });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('carte')
    .select('*')
    .or(`nome.ilike.%${q}%,codice.ilike.%${q}%`)
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ carte: data ?? [] });
}

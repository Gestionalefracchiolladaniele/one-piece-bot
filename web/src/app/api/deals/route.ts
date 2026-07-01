import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/deals → ultimi affari trovati (per la sezione "affari" della dashboard).
export async function GET(req: Request) {
  const limite = Number(new URL(req.url).searchParams.get('limit') ?? 50);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('affari')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(Math.min(200, Math.max(1, limite)));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ affari: data ?? [] });
}

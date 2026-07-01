import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cercaLive } from '@/lib/tcgapi';

// GET /api/cards?q=shanks         → ricerca nel DB locale (carte già note).
// GET /api/cards?q=shanks&live=1  → ricerca LIVE su tcgapi (carte con prezzo, anche
//                                    quelle non ancora in DB). Usata dalla collezione:
//                                    l'utente scrive il nome e vede subito le carte reali;
//                                    il salvataggio in DB avviene al click (POST collezione).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const live = url.searchParams.get('live') === '1';
  if (!q) return NextResponse.json({ carte: [] });

  if (live) {
    const carte = await cercaLive(q, 100);
    return NextResponse.json({ carte, live: true });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('carte')
    .select('*')
    .or(`nome.ilike.%${q}%,codice.ilike.%${q}%`)
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ carte: data ?? [] });
}

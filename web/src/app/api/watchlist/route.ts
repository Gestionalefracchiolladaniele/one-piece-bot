import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cartaPerCodice, type CartaLive } from '@/lib/tcgapi';

// Tutte le letture/scritture passano dal service role (RLS deny-all sullo schema).

// La watchlist ha una FK su `carte`: se la carta non è ancora in anagrafica la
// salviamo PRIMA. Preferiamo i dati carta passati dal client (dalla ricerca live);
// fallback su tcgapi per codice. Ritorna true se la carta è disponibile in `carte`.
async function assicuraCarta(
  sb: ReturnType<typeof supabaseAdmin>,
  codice: string,
  carta?: Partial<CartaLive>,
): Promise<boolean> {
  const { data: esistente } = await sb.from('carte').select('codice').eq('codice', codice).limit(1);
  if (esistente?.length) return true;

  let dati: CartaLive | null = null;
  if (carta?.nome) {
    dati = {
      codice, nome: carta.nome, set: carta.set ?? '', rarita: carta.rarita ?? '',
      printing: carta.printing ?? '', tipo: carta.tipo ?? '',
      immagine_url: carta.immagine_url ?? '',
      prezzo_usd: carta.prezzo_usd ?? null, prezzo_eur: carta.prezzo_eur ?? null,
    };
  } else {
    try { dati = await cartaPerCodice(codice); } catch { dati = null; }
  }
  if (!dati) return false;

  const { error: eCarta } = await sb.from('carte').upsert({
    codice, nome: dati.nome, set: dati.set, rarita: dati.rarita,
    tipo: dati.tipo, immagine_url: dati.immagine_url, lingua: 'en',
  });
  if (eCarta) return false;
  if (dati.prezzo_usd != null) {
    await sb.from('prezzi_riferimento').insert({
      codice, fonte: 'tcgapi', prezzo: dati.prezzo_usd, valuta: 'USD',
    });
  }
  return true;
}

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

  const sb = supabaseAdmin();
  // Garantisce l'anagrafica (evita la violazione della FK watchlist→carte).
  const ok = await assicuraCarta(sb, codice.toUpperCase(), body.carta);
  if (!ok) {
    return NextResponse.json(
      { error: `Impossibile salvare la carta ${codice}. Riprova selezionandola dalla ricerca.` },
      { status: 404 },
    );
  }

  const record = {
    codice: codice.toUpperCase(),
    attiva: body.attiva ?? true,
    priorita: body.priorita ?? 'normale',
    // Default prezzo_max: funziona senza CardTrader (perc_sconto richiede il riferimento).
    regola_tipo: body.regola_tipo ?? 'prezzo_max',
    regola_valore: body.regola_valore ?? 30,
    paese: body.paese ?? 'it',
  };
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

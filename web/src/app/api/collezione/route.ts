import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cartaPerCodice, type CartaLive } from '@/lib/tcgapi';

// ── Il "raccoglitore": le carte che possiedi + quante copie. ──────────────────
// Il valore NON è salvato qui: si calcola a runtime dall'ultimo prezzo noto in
// prezzi_riferimento (fonte 'tcgapi', in USD) × quantità, e si mostra anche in €
// (stima: i prezzi tcgapi sono mercato USA). Tutto via service role (RLS deny-all).

// Cambio USD→EUR di stima (i prezzi tcgapi sono in USD/TCGPlayer). Sovrascrivibile
// con env CAMBIO_USD_EUR; è solo un ordine di grandezza, non un tasso preciso.
const CAMBIO_USD_EUR = Number(process.env.CAMBIO_USD_EUR ?? '0.92');

// GET → collezione completa, arricchita con anagrafica carta, prezzo unitario
// (USD+EUR) e valore riga (prezzo × quantità). Include i totali di collezione.
export async function GET() {
  const sb = supabaseAdmin();
  const { data: coll, error } = await sb
    .from('collezione')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const codici = (coll ?? []).map((c) => c.codice);
  if (!codici.length) {
    return NextResponse.json({ collezione: [], totale: { pezzi: 0, usd: 0, eur: 0 } });
  }

  // Anagrafica delle carte in collezione.
  const { data: carte } = await sb.from('carte').select('*').in('codice', codici);
  const perCodice = new Map((carte ?? []).map((c) => [c.codice, c]));

  // Ultimo prezzo noto per ogni carta (fonte tcgapi, in USD). Prendiamo i più
  // recenti e teniamo il primo per codice (già ordinati desc per timestamp).
  const { data: prezzi } = await sb
    .from('prezzi_riferimento')
    .select('codice, prezzo, valuta, timestamp')
    .in('codice', codici)
    .order('timestamp', { ascending: false });
  const prezzoDi = new Map<string, number>();
  for (const p of prezzi ?? []) {
    if (!prezzoDi.has(p.codice)) prezzoDi.set(p.codice, Number(p.prezzo));
  }

  let totPezzi = 0;
  let totUsd = 0;
  const arricchita = (coll ?? []).map((c) => {
    const usdUnit = prezzoDi.get(c.codice) ?? null; // prezzo unitario in USD
    const eurUnit = usdUnit != null ? Math.round(usdUnit * CAMBIO_USD_EUR * 100) / 100 : null;
    const valoreUsd = usdUnit != null ? Math.round(usdUnit * c.quantita * 100) / 100 : null;
    const valoreEur = eurUnit != null ? Math.round(eurUnit * c.quantita * 100) / 100 : null;
    totPezzi += c.quantita;
    if (valoreUsd != null) totUsd += valoreUsd;
    return {
      ...c,
      carta: perCodice.get(c.codice) ?? null,
      prezzo_usd: usdUnit,
      prezzo_eur: eurUnit,
      valore_usd: valoreUsd,
      valore_eur: valoreEur,
    };
  });

  const totale = {
    pezzi: totPezzi,
    usd: Math.round(totUsd * 100) / 100,
    eur: Math.round(totUsd * CAMBIO_USD_EUR * 100) / 100,
  };
  return NextResponse.json({ collezione: arricchita, totale });
}

// Garantisce che la carta esista in anagrafica (`carte`), evitando la violazione
// della FK. Preferisce i dati carta passati dal client (già disponibili dalla
// ricerca live: nome, set, prezzo, immagine) — così NON serve ri-cercare per codice
// su tcgapi (che cerca solo per nome → il codice esatto spesso non si trova).
// Se il client non passa i dati, come fallback prova cartaPerCodice.
// Ritorna true se la carta è disponibile in `carte`, false se impossibile.
async function assicuraCarta(
  sb: ReturnType<typeof supabaseAdmin>,
  codice: string,
  carta?: Partial<CartaLive>,
): Promise<boolean> {
  const { data: esistente } = await sb.from('carte').select('codice').eq('codice', codice).limit(1);
  if (esistente?.length) return true;

  // Dati dal client (preferiti) o fallback su tcgapi per codice.
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
    codice: dati.codice || codice, nome: dati.nome, set: dati.set, rarita: dati.rarita,
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

// POST → aggiunge/aggiorna una carta in collezione.
// Body: { codice, quantita?, note?, carta? } dove `carta` sono i dati dalla ricerca
// live (nome/set/prezzo/immagine): li usiamo per salvare l'anagrafica senza ri-cercare.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const codice = String(body.codice ?? '').trim().toUpperCase();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });

  const sb = supabaseAdmin();
  const ok = await assicuraCarta(sb, codice, body.carta);
  if (!ok) {
    return NextResponse.json(
      { error: `Impossibile salvare la carta ${codice}. Riprova selezionandola dalla ricerca.` },
      { status: 404 },
    );
  }

  const record = {
    codice,
    quantita: Math.max(1, Number(body.quantita ?? 1)),
    note: String(body.note ?? ''),
  };
  const { error } = await sb.from('collezione').upsert(record);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH → aggiorna quantità/note di una carta. Body: { codice, ...campi }.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const codice = String(body.codice ?? '').trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });
  const { codice: _c, carta: _carta, ...campi } = body;
  if (campi.quantita != null) campi.quantita = Math.max(1, Number(campi.quantita));
  const sb = supabaseAdmin();
  const { error } = await sb.from('collezione').update(campi).eq('codice', codice);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE → rimuove una carta. Query: ?codice=OP01-120.
export async function DELETE(req: Request) {
  const codice = new URL(req.url).searchParams.get('codice')?.trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });
  const sb = supabaseAdmin();
  const { error } = await sb.from('collezione').delete().eq('codice', codice);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

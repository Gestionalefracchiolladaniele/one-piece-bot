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

// Garantisce che la carta esista in anagrafica (`carte`) e prova a salvarne il prezzo.
//
// Flusso (dopo il rebrand ricerca-da-DB): l'anagrafica delle ~4500 carte è già nel
// DB (punk-records), quindi di norma la carta ESISTE già → non tocchiamo `carte`.
// Il prezzo però NON è nel DB (punk-records non ha prezzi): al momento dell'aggiunta
// facciamo UNA chiamata tcgapi MIRATA sul `number` esatto per registrarlo. È la
// chiamata "buona" (1 sola, precisa) invece di ri-cercare per nome.
//
// Priorità dati carta: (1) prezzo già passato dal client (ricerca live) → nessuna
// chiamata; (2) altrimenti tcgapi per codice esatto; (3) dati anagrafica dal client
// (foto manuale, ecc.) per l'upsert se la carta non fosse nel DB.
// Ritorna true se la carta è disponibile in `carte`, false se impossibile.
async function assicuraCarta(
  sb: ReturnType<typeof supabaseAdmin>,
  codice: string,
  carta?: Partial<CartaLive>,
): Promise<boolean> {
  const { data: esistente } = await sb.from('carte').select('codice').eq('codice', codice).limit(1);
  const giaInDb = !!esistente?.length;

  // Prezzo: se il client l'ha già (ricerca live), usiamo quello. Altrimenti chiamata
  // tcgapi mirata sul codice esatto (1 richiesta) per ottenere il prezzo di mercato.
  let prezzoUsd = carta?.prezzo_usd ?? null;
  let datiTcg: CartaLive | null = null;
  if (prezzoUsd == null) {
    try { datiTcg = await cartaPerCodice(codice); } catch { datiTcg = null; }
    prezzoUsd = datiTcg?.prezzo_usd ?? null;
  }

  // Se la carta non è ancora in `carte` (es. inserimento manuale, o codice non nel
  // dataset), la creiamo dai dati disponibili (client > tcgapi).
  if (!giaInDb) {
    const nome = carta?.nome ?? datiTcg?.nome ?? '';
    if (!nome) return false; // niente di sensato da salvare
    const { error: eCarta } = await sb.from('carte').upsert({
      codice,
      nome,
      set: carta?.set ?? datiTcg?.set ?? '',
      rarita: carta?.rarita ?? datiTcg?.rarita ?? '',
      tipo: carta?.tipo ?? datiTcg?.tipo ?? '',
      immagine_url: carta?.immagine_url ?? datiTcg?.immagine_url ?? '',
      lingua: 'en',
    });
    if (eCarta) return false;
  } else if (carta?.immagine_url) {
    // Carta già nota ma l'utente ha fornito una foto propria (inserimento manuale):
    // aggiorniamo solo l'immagine, senza sovrascrivere il resto dell'anagrafica.
    await sb.from('carte').update({ immagine_url: carta.immagine_url }).eq('codice', codice);
  }

  if (prezzoUsd != null) {
    await sb.from('prezzi_riferimento').insert({
      codice, fonte: 'tcgapi', prezzo: prezzoUsd, valuta: 'USD',
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

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cartaPerCodice, type CartaLive } from '@/lib/tcgapi';

// Tutte le letture/scritture passano dal service role (RLS deny-all sullo schema).

// La watchlist ha una FK su `carte`: la carta deve esistere in anagrafica. Con la
// ricerca-da-DB (punk-records) di norma esiste già → non serve fare nulla. Casi da
// gestire: (a) inserimento MANUALE di un codice non nel dataset → creiamo la carta
// dai dati del client (incl. foto propria); (b) carta nota ma foto manuale fornita →
// aggiorniamo solo l'immagine. Il prezzo per la watchlist non è indispensabile (serve
// solo a perc_sconto), ma se il client non l'ha lo prendiamo con 1 chiamata mirata.
// Ritorna true se la carta è disponibile in `carte`.
async function assicuraCarta(
  sb: ReturnType<typeof supabaseAdmin>,
  codice: string,
  carta?: Partial<CartaLive>,
): Promise<boolean> {
  const { data: esistente } = await sb.from('carte').select('codice').eq('codice', codice).limit(1);
  const giaInDb = !!esistente?.length;

  let prezzoUsd = carta?.prezzo_usd ?? null;
  let datiTcg: CartaLive | null = null;
  if (prezzoUsd == null && !giaInDb) {
    // Solo se non è nel DB proviamo tcgapi (per riempire anagrafica mancante).
    try { datiTcg = await cartaPerCodice(codice); } catch { datiTcg = null; }
    prezzoUsd = datiTcg?.prezzo_usd ?? null;
  }

  if (!giaInDb) {
    const nome = carta?.nome ?? datiTcg?.nome ?? '';
    if (!nome) return false;
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
    await sb.from('carte').update({ immagine_url: carta.immagine_url }).eq('codice', codice);
  }

  if (prezzoUsd != null) {
    await sb.from('prezzi_riferimento').insert({
      codice, fonte: 'tcgapi', prezzo: prezzoUsd, valuta: 'USD',
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

// Massimo carte ATTIVE contemporaneamente (budget Apify: la caccia gira su queste).
const MAX_ATTIVE = 3;

// Conta le carte attive, escludendo opzionalmente un codice (quello che sto per cambiare).
async function contaAttive(sb: ReturnType<typeof supabaseAdmin>, esclusoCodice?: string): Promise<number> {
  const { data } = await sb.from('watchlist').select('codice').eq('attiva', true);
  return (data ?? []).filter((w) => w.codice !== esclusoCodice).length;
}

// POST → aggiunge (o aggiorna) una carta in watchlist. Body: { codice, ...campi }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const codice = String(body.codice ?? '').trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });

  const sb = supabaseAdmin();
  const cod = codice.toUpperCase();

  // Nuove carte entrano ATTIVE per default: se saremmo già a MAX_ATTIVE, le aggiungiamo
  // in PAUSA (attiva=false) invece di rifiutare, così l'utente la ritrova e può attivarla.
  const attivaRichiesta = body.attiva ?? true;
  const attiva = attivaRichiesta && (await contaAttive(sb, cod)) < MAX_ATTIVE;

  // Garantisce l'anagrafica (evita la violazione della FK watchlist→carte).
  const ok = await assicuraCarta(sb, cod, body.carta);
  if (!ok) {
    return NextResponse.json(
      { error: `Impossibile salvare la carta ${codice}. Riprova selezionandola dalla ricerca.` },
      { status: 404 },
    );
  }

  const record = {
    codice: cod,
    attiva,
    priorita: body.priorita ?? 'normale',
    // Default prezzo_max: funziona senza CardTrader (perc_sconto richiede il riferimento).
    regola_tipo: body.regola_tipo ?? 'prezzo_max',
    regola_valore: body.regola_valore ?? 30,
    paese: body.paese ?? 'it',
  };
  const { error } = await sb.from('watchlist').upsert(record);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, attiva, limite: !attiva && attivaRichiesta ? MAX_ATTIVE : undefined });
}

// PATCH → aggiorna i campi di una carta in watchlist. Body: { codice, ...campi }.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const codice = String(body.codice ?? '').trim();
  if (!codice) return NextResponse.json({ error: 'codice mancante' }, { status: 400 });
  const { codice: _c, carta: _carta, ...campi } = body;
  const sb = supabaseAdmin();

  // Se si sta ATTIVANDO la carta, rispetta il limite di MAX_ATTIVE.
  if (campi.attiva === true) {
    const attive = await contaAttive(sb, codice.toUpperCase());
    if (attive >= MAX_ATTIVE) {
      return NextResponse.json(
        { error: `Puoi avere al massimo ${MAX_ATTIVE} carte attive. Metti in pausa un'altra carta prima.` },
        { status: 409 },
      );
    }
  }

  const { error } = await sb.from('watchlist').update(campi).eq('codice', codice.toUpperCase());
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

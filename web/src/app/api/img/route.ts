import { NextResponse } from 'next/server';

// Proxy immagini carte. Le immagini ufficiali One Piece
// (en.onepiece-cardgame.com) inviano `Cross-Origin-Resource-Policy: same-site`,
// che impedisce al browser di mostrarle quando la pagina è su un altro dominio
// (es. la nostra app su vercel.app) → icona rotta. Le scarichiamo SERVER-SIDE (dove
// CORP non si applica) e le ri-serviamo dal NOSTRO dominio, così il browser le vede
// come "stesso sito" e le mostra. Cache lunga: le immagini carta non cambiano mai.
//
// GET /api/img?u=<url-immagine-encoded>

// Domini da cui accettiamo di proxare (evita che la route diventi un open proxy).
const HOST_CONSENTITI = ['en.onepiece-cardgame.com', 'onepiece-cardgame.com'];

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u');
  if (!u) return NextResponse.json({ error: 'url mancante' }, { status: 400 });

  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return NextResponse.json({ error: 'url non valido' }, { status: 400 });
  }
  if (target.protocol !== 'https:' || !HOST_CONSENTITI.includes(target.hostname)) {
    return NextResponse.json({ error: 'host non consentito' }, { status: 403 });
  }

  try {
    const r = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Claupiece image proxy)' },
      // Le immagini carta sono statiche → cache aggressiva a monte.
      cache: 'force-cache',
    });
    if (!r.ok) return NextResponse.json({ error: 'immagine non trovata' }, { status: 404 });

    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': r.headers.get('content-type') ?? 'image/png',
        // 30 giorni sul browser/CDN: le immagini non cambiano.
        'Cache-Control': 'public, max-age=2592000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'errore nel recupero' }, { status: 502 });
  }
}

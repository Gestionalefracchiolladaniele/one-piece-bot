import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';

// POST /api/actions  — azioni "operative" della dashboard.
// Body: { action: 'avvia_caccia' | 'invia_riepilogo' }.
//  - avvia_caccia   → lancia il cron Vinted su GitHub Actions (workflow_dispatch),
//                     così puoi cacciare subito senza aspettare l'ora. Serve un
//                     token GitHub con actions:write (env GITHUB_ACTIONS_TOKEN).
//  - invia_riepilogo→ manda su Telegram lo stato attuale (watchlist, ultimi affari,
//                     valore collezione). Utile come "ping" e per verificare il bot.

async function avviaCaccia(): Promise<{ ok: boolean; msg: string }> {
  if (!env.githubToken || !env.githubRepo) {
    return { ok: false, msg: 'GitHub non configurato (GITHUB_ACTIONS_TOKEN + GITHUB_REPO).' };
  }
  const url = `https://api.github.com/repos/${env.githubRepo}/actions/workflows/${env.githubWorkflow}/dispatches`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: env.githubRef }),
  });
  if (r.status === 204) return { ok: true, msg: 'Caccia avviata! Controlla Telegram tra poco.' };
  const testo = await r.text().catch(() => '');
  return { ok: false, msg: `GitHub ha risposto ${r.status}. ${testo.slice(0, 140)}` };
}

async function inviaRiepilogo(): Promise<{ ok: boolean; msg: string }> {
  if (!env.telegramBotToken || !env.telegramChatId) {
    return { ok: false, msg: 'Telegram non configurato (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID).' };
  }
  const sb = supabaseAdmin();
  const [{ data: wl }, { data: aff }, { data: coll }] = await Promise.all([
    sb.from('watchlist').select('codice, attiva'),
    sb.from('affari').select('titolo, codice, score_stelle').order('timestamp', { ascending: false }).limit(3),
    sb.from('collezione').select('codice, quantita'),
  ]);

  const attive = (wl ?? []).filter((w) => w.attiva).length;
  const pezzi = (coll ?? []).reduce((s, c) => s + (c.quantita ?? 0), 0);
  const righe = [
    '📊 *Riepilogo Claupiece*',
    '',
    `👀 Watchlist: ${wl?.length ?? 0} carte (${attive} attive)`,
    `📚 Collezione: ${coll?.length ?? 0} carte · ${pezzi} pezzi`,
    '',
    '🚨 Ultimi affari:',
    ...(aff?.length
      ? aff.map((a) => `  ${'⭐'.repeat(a.score_stelle ?? 0)} ${a.titolo || a.codice}`)
      : ['  nessuno ancora']),
  ];

  const r = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.telegramChatId, text: righe.join('\n'), parse_mode: 'Markdown' }),
  });
  if (r.ok) return { ok: true, msg: 'Riepilogo inviato su Telegram.' };
  return { ok: false, msg: 'Telegram ha rifiutato il messaggio (controlla token/chat id).' };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String((body as { action?: string }).action ?? '');

  let esito: { ok: boolean; msg: string };
  if (action === 'avvia_caccia') esito = await avviaCaccia();
  else if (action === 'invia_riepilogo') esito = await inviaRiepilogo();
  else return NextResponse.json({ error: 'azione sconosciuta' }, { status: 400 });

  return NextResponse.json(esito, { status: esito.ok ? 200 : 502 });
}

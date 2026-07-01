import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { cartaPerCodice } from '@/lib/tcgapi';

// ── Webhook Telegram (bot di consultazione PERSONALE) ─────────────────────────
// Sostituisce il vecchio bot_handler.py in polling (che non gira su serverless).
// Telegram fa POST qui a ogni messaggio; noi rispondiamo chiamando la Bot API.
// Comandi: /help /app /affari /watchlist /finestra /pausa /riprendi /prezzo.
//
// Sicurezza: Telegram invia l'header X-Telegram-Bot-Api-Secret-Token (impostato
// quando si registra il webhook); lo confrontiamo con TELEGRAM_WEBHOOK_SECRET.
// In più filtriamo sul TELEGRAM_CHAT_ID: risponde solo al proprietario.

const API = (metodo: string) =>
  `https://api.telegram.org/bot${env.telegramBotToken}/${metodo}`;

// Invia un messaggio di testo (Markdown) al chat.
async function invia(chatId: number | string, testo: string, extra: Record<string, unknown> = {}) {
  await fetch(API('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: testo,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...extra,
    }),
  });
}

async function rispondiCallback(callbackId: string) {
  await fetch(API('answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

async function modificaTesto(chatId: number | string, messageId: number, testo: string) {
  await fetch(API('editMessageText'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: testo,
      parse_mode: 'Markdown',
    }),
  });
}

const TESTO_HELP = [
  '🏴‍☠️ *Claupiece* — comandi:',
  '',
  '/app — apri la dashboard',
  '/affari — ultimi affari trovati',
  '/watchlist — le carte che segui',
  '/finestra — finestra oraria (modificabile)',
  '/prezzo `CODICE` — prezzo di riferimento (es. /prezzo OP01-120)',
  '/pausa — sospendi le notifiche',
  '/riprendi — riattiva le notifiche',
  '/help — questa lista',
].join('\n');

function stelle(n: number): string {
  return '⭐'.repeat(Math.max(0, Math.min(5, n)));
}

function descriviRegola(tipo: string, val: number): string {
  if (tipo === 'prezzo_max') return `≤ ${val}€`;
  if (tipo === 'perc_sconto') return `≥ ${val}% sconto`;
  return 'ogni annuncio';
}

// Tastiera preset finestra (gli orari liberi si scelgono dalla dashboard).
const KB_FINESTRA = {
  inline_keyboard: [
    [
      { text: '🌅 6–12', callback_data: 'fin:6:12' },
      { text: '🔆 12–18', callback_data: 'fin:12:18' },
      { text: '🌙 18–24', callback_data: 'fin:18:24' },
    ],
    [
      { text: '🕖 7–13', callback_data: 'fin:7:13' },
      { text: '🕐 13–19', callback_data: 'fin:13:19' },
      { text: '🌃 20–2', callback_data: 'fin:20:2' },
    ],
  ],
};

// Solo il proprietario può usare il bot. Se TELEGRAM_CHAT_ID non è impostato,
// lascia passare (setup iniziale), come nel vecchio bot_handler.py.
function autorizzato(chatId: number | string): boolean {
  if (!env.telegramChatId) return true;
  return String(chatId) === String(env.telegramChatId);
}

// ── Handler dei comandi ───────────────────────────────────────────────────────
async function gestisciComando(chatId: number, testo: string) {
  const [cmdRaw, ...args] = testo.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@.*$/, ''); // /prezzo@BotName → /prezzo
  const sb = supabaseAdmin();

  switch (cmd) {
    case '/start':
    case '/help':
      return invia(chatId, TESTO_HELP);

    case '/app': {
      if (!env.webAppUrl) return invia(chatId, 'Dashboard non configurata (imposta NEXT_PUBLIC_WEB_APP_URL).');
      return invia(chatId, 'La tua dashboard:', {
        reply_markup: { inline_keyboard: [[{ text: '🖥 Apri Claupiece', url: env.webAppUrl }]] },
      });
    }

    case '/affari': {
      const { data, error } = await sb
        .from('affari')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(5);
      if (error) return invia(chatId, `Errore nel leggere gli affari: ${error.message}`);
      if (!data?.length) return invia(chatId, 'Ancora nessun affare trovato. 🕵️');
      const righe = ['🚨 *Ultimi affari:*', ''];
      for (const a of data) {
        const titolo = a.titolo || a.codice || 'Carta';
        const link = a.url_annuncio ? `[${titolo}](${a.url_annuncio})` : titolo;
        let info = a.prezzo_vinted != null ? `${a.prezzo_vinted}€` : '';
        if (a.sconto_perc != null) info += ` (-${Math.round(a.sconto_perc)}%)`;
        righe.push(`${stelle(a.score_stelle ?? 0)} ${link} — ${info}`);
      }
      return invia(chatId, righe.join('\n'));
    }

    case '/watchlist': {
      const { data: wl, error } = await sb.from('watchlist').select('*');
      if (error) return invia(chatId, `Errore nel leggere la watchlist: ${error.message}`);
      if (!wl?.length) return invia(chatId, 'Watchlist vuota. Aggiungi carte dalla dashboard (/app).');
      const codici = wl.map((w) => w.codice);
      const { data: carte } = await sb.from('carte').select('codice, nome').in('codice', codici);
      const nomeDi = new Map((carte ?? []).map((c) => [c.codice, c.nome]));
      const righe = ['👀 *Watchlist:*', ''];
      for (const w of wl) {
        const nome = nomeDi.get(w.codice) || w.codice;
        const stato = w.attiva ? '✅' : '⏸';
        righe.push(
          `${stato} *${nome}* (${w.codice}) — ${descriviRegola(w.regola_tipo, w.regola_valore)} · ${(w.paese ?? 'it').toUpperCase()}`,
        );
      }
      return invia(chatId, righe.join('\n'));
    }

    case '/finestra': {
      const { data } = await sb.from('config').select('*').eq('id', 1).limit(1);
      const cfg = data?.[0] ?? { finestra_inizio: 18, finestra_fine: 24 };
      const i = String(cfg.finestra_inizio ?? 18).padStart(2, '0');
      const f = String(cfg.finestra_fine ?? 24).padStart(2, '0');
      return invia(
        chatId,
        `🕕 Finestra attiva: *${i}:00 – ${f}:00*.\nScegli una nuova finestra (o usa la dashboard per orari personalizzati):`,
        { reply_markup: KB_FINESTRA },
      );
    }

    case '/pausa':
      await sb.from('config').upsert({ id: 1, in_pausa: true });
      return invia(chatId, '⏸️ Notifiche in pausa. Riattivale con /riprendi.');

    case '/riprendi':
      await sb.from('config').upsert({ id: 1, in_pausa: false });
      return invia(chatId, '▶️ Notifiche riattivate. Torno a caccia di affari!');

    case '/prezzo': {
      const codice = (args[0] ?? '').trim().toUpperCase();
      if (!codice) return invia(chatId, 'Uso: /prezzo CODICE — es. /prezzo OP01-120');
      // Ultimo prezzo noto dal DB (istantaneo).
      const { data: prezzi } = await sb
        .from('prezzi_riferimento')
        .select('prezzo, valuta, fonte, timestamp')
        .eq('codice', codice)
        .order('timestamp', { ascending: false })
        .limit(1);
      const { data: carte } = await sb.from('carte').select('nome').eq('codice', codice).limit(1);
      const nome = carte?.[0]?.nome || codice;
      const riga = prezzi?.[0];
      if (riga?.prezzo != null) {
        const val = riga.valuta === 'USD' ? `$${riga.prezzo}` : `${riga.prezzo}€`;
        return invia(chatId, `💶 *${nome}* (${codice})\nRiferimento: *${val}* (${riga.fonte})`);
      }
      // Non in cache: prova a risolverlo live da tcgapi (USD).
      await invia(chatId, 'Cerco il prezzo… ⏳');
      const live = await cartaPerCodice(codice).catch(() => null);
      if (!live || live.prezzo_usd == null) {
        return invia(chatId, `Nessun prezzo trovato per ${codice}.`);
      }
      await sb.from('prezzi_riferimento').insert({
        codice, fonte: 'tcgapi', prezzo: live.prezzo_usd, valuta: 'USD',
      });
      return invia(chatId, `💶 *${live.nome || nome}* (${codice})\nRiferimento: *$${live.prezzo_usd}* (tcgapi, mercato USA)`);
    }

    default:
      return invia(chatId, 'Comando non riconosciuto. /help per la lista.');
  }
}

async function gestisciCallback(chatId: number, messageId: number, callbackId: string, data: string) {
  await rispondiCallback(callbackId);
  if (data.startsWith('fin:')) {
    const [, i, f] = data.split(':');
    await supabaseAdmin()
      .from('config')
      .upsert({ id: 1, finestra_inizio: Number(i), finestra_fine: Number(f) });
    const ii = i.padStart(2, '0');
    const ff = f.padStart(2, '0');
    await modificaTesto(chatId, messageId, `✅ Finestra impostata: *${ii}:00 – ${ff}:00*.`);
  }
}

export async function POST(req: Request) {
  // Verifica secret token (se configurato).
  if (env.telegramWebhookSecret) {
    const secret = req.headers.get('x-telegram-bot-api-secret-token');
    if (secret !== env.telegramWebhookSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }
  if (!env.telegramBotToken) {
    return NextResponse.json({ ok: false, error: 'bot token mancante' }, { status: 500 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true }); // ignora payload non validi

  try {
    // Messaggio testuale (comando).
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      if (autorizzato(chatId)) await gestisciComando(chatId, update.message.text);
    }
    // Pressione di un bottone inline.
    else if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      if (chatId && autorizzato(chatId)) {
        await gestisciCallback(chatId, cq.message.message_id, cq.id, cq.data ?? '');
      } else {
        await rispondiCallback(cq.id);
      }
    }
  } catch {
    // Non propaghiamo l'errore: rispondiamo 200 comunque, così Telegram non
    // ritenta all'infinito lo stesso update.
  }

  // Telegram si aspetta 200 per considerare l'update consegnato.
  return NextResponse.json({ ok: true });
}

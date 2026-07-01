// Lettura centralizzata delle env. La SERVICE ROLE key è server-only: non usarla
// mai in un client component (Next la escluderebbe comunque dal bundle client).

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  // tcgapi.dev — ricerca live carte + prezzi (server-only). Free tier 100/giorno.
  tcgapiKey: process.env.TCGAPI_KEY ?? '',
  tcgapiBase: process.env.TCGAPI_API_BASE ?? 'https://api.tcgapi.dev/v1',
  tcgapiGameSlug: process.env.TCGAPI_GAME_SLUG ?? 'one-piece-card-game',
  cambioUsdEur: Number(process.env.CAMBIO_USD_EUR ?? '0.92'),
  // Telegram (webhook bot, server-only). Il chat id limita l'uso al proprietario.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  // Secret condiviso col webhook Telegram (header X-Telegram-Bot-Api-Secret-Token).
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
  // URL pubblico della dashboard (per il comando /app).
  webAppUrl: process.env.NEXT_PUBLIC_WEB_APP_URL ?? process.env.WEB_APP_URL ?? '',
  // GitHub — per avviare manualmente il cron Vinted (workflow_dispatch) dal bottone
  // "Avvia caccia ora". Token con permesso 'actions:write' sul repo. Opzionale:
  // se manca, il bottone mostra un avviso invece di lanciare.
  githubToken: process.env.GITHUB_ACTIONS_TOKEN ?? '',
  githubRepo: process.env.GITHUB_REPO ?? '', // es. "Gestionalefracchiolladaniele/one-piece-bot"
  githubWorkflow: process.env.GITHUB_WORKFLOW_FILE ?? 'cron_runner.yml',
  githubRef: process.env.GITHUB_REF_BRANCH ?? 'main',
};

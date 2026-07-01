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
};

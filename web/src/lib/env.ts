// Lettura centralizzata delle env. La SERVICE ROLE key è server-only: non usarla
// mai in un client component (Next la escluderebbe comunque dal bundle client).

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

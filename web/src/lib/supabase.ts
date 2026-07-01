import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Client anon (browser) — protetto da RLS. Con lo schema Claupiece (RLS deny-all,
// nessuna policy pubblica) il client anon NON legge nulla: tutte le letture/scritture
// passano dalle API route server (service role). Lo teniamo per completezza/futuro.
let _browser: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient {
  if (!_browser) {
    _browser = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false },
    });
  }
  return _browser;
}

// Client service-role — SOLO server (API route). Bypassa RLS. Mai importarlo da un
// client component.
let _admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl, env.supabaseServiceRole, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}

import { createClient as supabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@operis/types/database';
import { basePath } from '@/runtime/navigation';
let client: SupabaseClient<Database> | undefined;
export function isConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado.');
  client ??= supabaseClient<Database>(url, key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'operis:' + basePath + ':' + new URL(url).hostname + ':auth',
    },
  });
  return client;
}

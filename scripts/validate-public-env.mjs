import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function publicSettings(env) {
  const app = new URL(env.NEXT_PUBLIC_APP_URL || 'invalid');
  const supabase = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'invalid');
  for (const url of [app, supabase])
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Use URLs HTTPS completas, sem senha, query ou fragmento.');
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(app.pathname))
    throw new Error('O caminho do site contém caracteres não suportados.');
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) {
    if(!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key))throw new Error('Chave pública inválida.');
    let role;
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
    } catch {
      /* validated below */
    }
    if (role !== 'anon')
      throw new Error(
        'Use a Publishable key (ou anon). Nunca use secret/service_role nas variáveis públicas.',
      );
  }
  const base = app.pathname.replace(/\/$/, '');
  return {
    NEXT_PUBLIC_APP_URL: app.origin + base + '/',
    NEXT_PUBLIC_BASE_PATH: base,
    NEXT_PUBLIC_SUPABASE_URL: supabase.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const settings = publicSettings(process.env);
  if (process.env.GITHUB_ENV)
    await appendFile(
      process.env.GITHUB_ENV,
      Object.entries(settings)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n',
    );
  console.log('Configuração pública validada. Caminho do site:', settings.NEXT_PUBLIC_BASE_PATH || '/');
}

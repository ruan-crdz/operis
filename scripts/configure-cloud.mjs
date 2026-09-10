// Explicit deployment-only administration. Never imported into the application.
import { publicSettings } from './validate-public-env.mjs';
const settings = publicSettings(process.env);
const ref = process.env.SUPABASE_PROJECT_REF,
  token = process.env.SUPABASE_ACCESS_TOKEN;
if (!/^[a-z]{20}$/.test(ref ?? '') || !token)
  throw new Error('Preencha SUPABASE_PROJECT_REF e o secret SUPABASE_ACCESS_TOKEN no GitHub.');
async function request(endpoint, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      `Supabase: falha na configuração (${response.status}). Confira o token, o projeto e as permissões. Nenhuma credencial foi registrada.`,
    );
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const rows = await request('database/query', {
  query: "select value from operis_private.edge_secrets where name='import_signing_key'",
  read_only: true,
});
const signingKey = rows?.[0]?.value;
if (typeof signingKey !== 'string' || signingKey.length < 32)
  throw new Error('Aplique todas as migrations antes de configurar a função.');
await request('secrets', [
  { name: 'OPERIS_IMPORT_SIGNING_KEY', value: signingKey },
  { name: 'ALLOWED_ORIGINS', value: new URL(settings.NEXT_PUBLIC_APP_URL).origin },
]);
console.log(
  'Função configurada: origem do site e chave interna de processamento. Valores privados não foram exibidos.',
);

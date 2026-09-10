import { requirePermission } from './auth/context';
import { check } from './actions/helpers';
export async function downloadFile(href: string) {
  const match = /^\/api\/(documents|imports)\/([0-9a-f-]{36})(?:\/file)?$/.exec(href);
  if (!match) throw new Error('Arquivo inválido.');
  const table = match[1] === 'documents' ? 'documents' : 'imports';
  const { db, orgId } = await requirePermission(`${table}.read`);
  const { data, error } = await db
    .from(table)
    .select('storage_path,original_filename')
    .eq('organization_id', orgId)
    .eq('id', match[2]!)
    .single();
  check(error);
  if (!data) throw new Error('Arquivo não encontrado.');
  const signed = await db.storage
    .from('documents')
    .createSignedUrl(data.storage_path, 60, { download: data.original_filename });
  check(signed.error);
  if (signed.data) window.location.assign(signed.data.signedUrl);
}

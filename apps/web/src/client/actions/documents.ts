import { z } from 'zod';
import { requirePermission } from '@/client/auth/context';
import { competenceSchema } from '@operis/domain';
import { invokeEdge } from '@/client/edge';
import { action, check, id, text, nullable } from './helpers';
export async function uploadDocument(form: FormData) {
  return action(async () => {
    await invokeEdge('upload-document', form);
    return { ok: true, message: 'Documento armazenado com segurança.' };
  });
}
export async function uploadAvatar(form: FormData) {
  return action(async () => {
    await invokeEdge('upload-avatar', form);
    return { ok: true, message: 'Foto de perfil atualizada.' };
  });
}
export async function createDocumentRequest(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('documents.manage');
    const values = z
      .object({
        title: z.string().trim().min(3).max(200),
        client_id: z.uuid(),
        competence: competenceSchema,
        due_date: z.iso.date().nullable(),
      })
      .parse({ ...Object.fromEntries(form), due_date: nullable(form, 'due_date') });
    const labels = z
      .array(z.string().trim().min(1).max(200))
      .min(1)
      .max(50)
      .parse(
        text(form, 'items')
          .split('\n')
          .map((v) => v.trim())
          .filter(Boolean),
      );
    const { error } = await db.rpc('create_document_request', {
      org_id: orgId,
      target_client: values.client_id,
      title: values.title,
      competence: values.competence,
      due: values.due_date ?? undefined,
      labels,
    });
    check(error);

    return { ok: true, message: 'Solicitação criada. Acompanhe os itens em Documentos.' };
  });
}
export async function updateRequestItem(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('documents.manage');
    const status = z
      .enum(['pending', 'received', 'validating', 'accepted', 'rejected'])
      .parse(text(form, 'status'));
    const document_id = nullable(form, 'document_id');
    if (document_id) z.uuid().parse(document_id);
    if (['received', 'validating', 'accepted'].includes(status) && !document_id)
      throw new Error('Vincule o documento recebido antes de avançar o item.');
    const { error } = await db
      .from('document_request_items')
      .update({ status, document_id })
      .eq('organization_id', orgId)
      .eq('id', id(form))
      .select('id')
      .single();
    check(error);

    return { ok: true, message: 'Item da solicitação atualizado.' };
  });
}

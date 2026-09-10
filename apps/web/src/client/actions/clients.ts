import { redirect } from '@/runtime/navigation';
import { clientSchema, competenceSchema } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { action, check, id, text } from './helpers';
export async function saveClient(form: FormData) {
  return action(async () => {
    const editing = Boolean(text(form, 'id'));
    const { db, orgId } = await requirePermission(editing ? 'clients.update' : 'clients.create');
    const values = clientSchema.parse(Object.fromEntries(form));
    if (editing) {
      const { error } = await db
        .from('clients')
        .update(values)
        .eq('organization_id', orgId)
        .eq('id', id(form))
        .select('id')
        .single();
      check(error);

      return { ok: true, message: 'Cliente atualizado.' };
    }
    const { data, error } = await db
      .from('clients')
      .insert({ ...values, organization_id: orgId })
      .select('id')
      .single();
    check(error);

    redirect(`/app/clientes/${data!.id}`);
  });
}
export async function archiveClient(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('clients.archive');
    const { error } = await db
      .from('clients')
      .update({ archived_at: text(form, 'restore') === 'true' ? null : new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('id', id(form))
      .select('id')
      .single();
    check(error);

    return {
      ok: true,
      message:
        text(form, 'restore') === 'true'
          ? 'Cliente reativado.'
          : 'Cliente arquivado. Seu histórico foi preservado.',
    };
  });
}
export async function createCompetence(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('clients.update');
    const { error } = await db.from('competencies').insert({
      organization_id: orgId,
      client_id: id(form, 'client_id'),
      month: competenceSchema.parse(text(form, 'month')),
    });
    check(error);

    return { ok: true, message: 'Competência criada.' };
  });
}
export async function updateCompetence(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('clients.update');
    const status = text(form, 'status');
    if (!['open', 'review', 'closed'].includes(status)) throw new Error('Status inválido.');
    const { error } = await db
      .from('competencies')
      .update({ status })
      .eq('organization_id', orgId)
      .eq('id', id(form))
      .select('id')
      .single();
    check(error);

    return { ok: true, message: 'Competência atualizada.' };
  });
}

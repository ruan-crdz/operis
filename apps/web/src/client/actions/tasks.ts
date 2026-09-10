import { z } from 'zod';
import { redirect } from '@/runtime/navigation';
import { taskSchema, taskStatuses } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { action, check, id, text, nullable } from './helpers';
export async function saveTask(form: FormData) {
  return action(async () => {
    const editing = Boolean(text(form, 'id'));
    const { db, orgId } = await requirePermission(editing ? 'tasks.update' : 'tasks.create');
    const values = taskSchema.parse({
      ...Object.fromEntries(form),
      department_id: nullable(form, 'department_id'),
      assignee_id: nullable(form, 'assignee_id'),
      due_date: nullable(form, 'due_date'),
      blocked_reason: nullable(form, 'blocked_reason'),
    });
    if (editing) {
      const version = z.coerce.number().int().positive().parse(text(form, 'version'));
      const { data, error } = await db
        .from('tasks')
        .update(values)
        .eq('organization_id', orgId)
        .eq('id', id(form))
        .eq('version', version)
        .select('id');
      check(error);
      if (!data?.length)
        throw new Error('Esta tarefa foi alterada por outra pessoa. Recarregue para ver a versão atual.');

      return { ok: true, message: 'Tarefa atualizada.' };
    }
    const { data, error } = await db
      .from('tasks')
      .insert({ ...values, organization_id: orgId })
      .select('id')
      .single();
    check(error);

    redirect(`/app/tarefas/${data!.id}`);
  });
}
export async function moveTask(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('tasks.update');
    const status = z.enum(taskStatuses).parse(text(form, 'status')),
      version = z.coerce.number().int().positive().parse(text(form, 'version'));
    const blocked_reason = nullable(form, 'blocked_reason');
    if (status === 'blocked' && !blocked_reason?.trim()) throw new Error('Informe o motivo do bloqueio.');
    const { data, error } = await db
      .from('tasks')
      .update({ status, blocked_reason })
      .eq('organization_id', orgId)
      .eq('id', id(form))
      .eq('version', version)
      .select('*');
    check(error);
    if (!data?.length) throw new Error('A tarefa mudou. Atualize o quadro antes de mover novamente.');

    return { ok: true, message: 'Tarefa movida.', data: data[0] };
  });
}
export async function addComment(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('tasks.update');
    const body = z.string().trim().min(1, 'Escreva seu comentário.').max(5000).parse(text(form, 'body'));
    const { error } = await db
      .from('task_comments')
      .insert({ organization_id: orgId, task_id: id(form, 'task_id'), body });
    check(error);

    return { ok: true, message: 'Comentário registrado.' };
  });
}
export async function setDependency(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('tasks.update');
    const { error } = await db.rpc('set_task_dependency', {
      task_id: id(form, 'task_id'),
      dependency_id: id(form, 'dependency_id'),
      remove_dependency: text(form, 'remove') === 'true',
    });
    check(error);

    return { ok: true, message: 'Dependência atualizada.' };
  });
}

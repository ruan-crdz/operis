import { z } from 'zod';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { taskStatuses } from '@operis/domain';
export async function listTasks(params: Record<string, string | undefined>, mine = false) {
  const { db, orgId, user } = await requirePermission('tasks.read');
  let query = db
    .from('tasks')
    .select('*,clients(name)')
    .eq('organization_id', orgId)
    .order('due_date', { nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (mine) query = query.eq('assignee_id', user.id).neq('status', 'completed');
  if (z.uuid().safeParse(params.department).success) query = query.eq('department_id', params.department!);
  if (z.uuid().safeParse(params.client).success) query = query.eq('client_id', params.client!);
  if (params.competence) query = query.eq('competence', params.competence);
  if (taskStatuses.includes(params.status as (typeof taskStatuses)[number]))
    query = query.eq('status', params.status!);
  if (params.q) query = query.ilike('title', `%${params.q.replace(/[%_\\]/g, '').slice(0, 100)}%`);
  const { data, error } = await query;
  check(error);
  return data ?? [];
}

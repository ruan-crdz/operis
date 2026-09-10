import { getContext } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { today } from '@operis/domain';
export async function getOptions() {
  const { db, orgId } = await getContext();
  const [clients, departments, members, roles] = await Promise.all([
    db
      .from('clients')
      .select('id,name')
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .order('name')
      .limit(500),
    db.from('departments').select('id,name').eq('organization_id', orgId).order('name').limit(100),
    db
      .from('organization_members')
      .select('user_id,profiles!organization_members_user_id_fkey(full_name)')
      .eq('organization_id', orgId)
      .limit(500),
    db.from('roles').select('id,name').eq('organization_id', orgId).order('name').limit(100),
  ]);
  [clients, departments, members, roles].forEach((r) => check(r.error));
  return {
    clients: (clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    departments: (departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
    members: (members.data ?? []).map((m) => ({
      value: m.user_id,
      label: m.profiles?.full_name || 'Colaborador',
    })),
    roles: (roles.data ?? []).map((r) => ({ value: r.id, label: r.name })),
  };
}
export async function getDashboard() {
  const { db, orgId, user, permissions } = await getContext();
  const date = today();
  const countTasks = (type: string) => {
    let query = db.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
    if (type === 'overdue') query = query.lt('due_date', date).neq('status', 'completed');
    else if (type === 'today') query = query.eq('due_date', date).neq('status', 'completed');
    else query = query.eq('status', type);
    return query;
  };
  const [overdue, due, waiting, review, tasks, requests, imports, clients] = await Promise.all([
    countTasks('overdue'),
    countTasks('today'),
    countTasks('waiting_client'),
    countTasks('review'),
    db
      .from('tasks')
      .select('*,clients(name)')
      .eq('organization_id', orgId)
      .eq('assignee_id', user.id)
      .neq('status', 'completed')
      .order('due_date', { nullsFirst: false })
      .limit(8),
    db
      .from('document_requests')
      .select('*,clients(name),document_request_items(id,status)')
      .eq('organization_id', orgId)
      .order('due_date', { nullsFirst: false })
      .limit(5),
    db
      .from('imports')
      .select('id,original_filename,status,row_count,created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(4),
    db
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('archived_at', null),
  ]);
  [overdue, due, waiting, review, tasks, requests, imports, clients].forEach((r) => check(r.error));
  return {
    overdue: overdue.count ?? 0,
    due: due.count ?? 0,
    waiting: waiting.count ?? 0,
    review: review.count ?? 0,
    tasks: tasks.data ?? [],
    requests: requests.data ?? [],
    imports: imports.data ?? [],
    clients: clients.count ?? 0,
    permissions,
  };
}
export async function searchRecords(query: string) {
  const { db, orgId } = await getContext();
  const safe = query
    .replace(/[%_\\,()]/g, '')
    .trim()
    .slice(0, 100);
  if (safe.length < 2) return { clients: [], tasks: [] };
  const [clients, tasks] = await Promise.all([
    db.from('clients').select('id,name').eq('organization_id', orgId).ilike('name', `%${safe}%`).limit(8),
    db.from('tasks').select('id,title').eq('organization_id', orgId).ilike('title', `%${safe}%`).limit(8),
  ]);
  check(clients.error);
  check(tasks.error);
  return { clients: clients.data ?? [], tasks: tasks.data ?? [] };
}

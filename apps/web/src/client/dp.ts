import {
  processHealth,
  workflowProgress,
  type ProcessStatus,
  type WorkflowStepRunStatus,
} from '@operis/domain';
import { getContext, requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';

export async function getDpPortfolio(filters: Record<string, string | undefined>) {
  const { db, orgId } = await requirePermission('processes.read');
  const page = Math.max(1, Number(filters.page) || 1);
  const size = 50;
  let query = db
    .from('department_processes')
    .select('*,clients(name)', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('due_at', { ascending: true })
    .range((page - 1) * size, page * size - 1);
  if (filters.competence) query = query.eq('competence', filters.competence);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.owner) query = query.eq('owner_id', filters.owner);
  if (filters.q) query = query.ilike('clients.name', `%${filters.q.replace(/[%_,()]/g, '')}%`);
  const processes = await query;
  check(processes.error);
  const ids = processes.data?.map((item) => item.id) ?? [];
  const [runs, validations, occurrences, collection] = ids.length
    ? await Promise.all([
        db
          .from('workflow_step_runs')
          .select('process_id,status')
          .eq('organization_id', orgId)
          .in('process_id', ids),
        db
          .from('dp_validation_results')
          .select('process_id,severity,resolved_at')
          .eq('organization_id', orgId)
          .in('process_id', ids)
          .is('resolved_at', null),
        db.from('dp_occurrences').select('process_id').eq('organization_id', orgId).in('process_id', ids),
        db
          .from('dp_collection_items')
          .select('process_id,response')
          .eq('organization_id', orgId)
          .in('process_id', ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  [runs, validations, occurrences, collection].forEach((result) => check(result.error));
  const rows = (processes.data ?? []).map((process) => {
    const processRuns = runs.data?.filter((run) => run.process_id === process.id) ?? [];
    const issues = validations.data?.filter((issue) => issue.process_id === process.id) ?? [];
    const progress = workflowProgress(
      processRuns.map((run) => ({ required: true, status: run.status as WorkflowStepRunStatus })),
    );
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.filter((issue) => issue.severity === 'warning').length;
    return {
      ...process,
      progress,
      errors,
      warnings,
      occurrences: occurrences.data?.filter((item) => item.process_id === process.id).length ?? 0,
      pendingCollection:
        collection.data?.filter((item) => item.process_id === process.id && item.response === 'pending')
          .length ?? 0,
      health: processHealth({
        status: process.status as ProcessStatus,
        dueAt: process.due_at,
        blockingErrors: errors,
        warnings,
      }),
    };
  });
  return { rows, page, total: processes.count ?? rows.length, size };
}

export async function getDpDashboard(competence: string) {
  const { db, orgId } = await requirePermission('processes.read');
  const [{ data: processes, error }, { count: clients, error: clientsError }] = await Promise.all([
    db
      .from('department_processes')
      .select('id,status,due_at')
      .eq('organization_id', orgId)
      .eq('competence', competence)
      .limit(500),
    db
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('archived_at', null),
  ]);
  check(error);
  check(clientsError);
  const list = processes ?? [];
  const overdue = list.filter(
    (p) => p.status !== 'completed' && p.due_at && new Date(p.due_at) < new Date(),
  ).length;
  return {
    clients: clients ?? 0,
    opened: list.length,
    completed: list.filter((p) => p.status === 'completed').length,
    attention: list.filter((p) => ['requires_attention', 'blocked'].includes(p.status)).length,
    review: list.filter((p) => p.status === 'awaiting_review').length,
    overdue,
  };
}

export async function getDpCockpit(clientId: string, competence: string) {
  const { db, orgId, user, permissions } = await requirePermission('processes.read');
  const processResult = await db
    .from('department_processes')
    .select('*,clients(name)')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .eq('competence', competence)
    .maybeSingle();
  check(processResult.error);
  if (!processResult.data)
    return {
      process: null,
      user,
      permissions,
      members: [],
      steps: [],
      collection: [],
      occurrences: [],
      employees: [],
      validations: [],
      approvals: [],
      evidence: [],
      documents: [],
      previous: [],
      history: [],
    };
  const process = processResult.data;
  const [year, month] = competence.split('-').map(Number);
  const previousCompetence = new Date(Date.UTC(year!, month! - 2, 1)).toISOString().slice(0, 7);
  const [
    steps,
    collection,
    occurrences,
    employees,
    validations,
    approvals,
    evidence,
    documents,
    history,
    members,
  ] = await Promise.all([
    db
      .from('workflow_step_runs')
      .select('*,workflow_steps(*)')
      .eq('organization_id', orgId)
      .eq('process_id', process.id)
      .order('created_at'),
    db
      .from('dp_collection_items')
      .select('*')
      .eq('organization_id', orgId)
      .eq('process_id', process.id)
      .order('position'),
    db
      .from('dp_occurrences')
      .select('*,employees(name,cpf)')
      .eq('organization_id', orgId)
      .eq('process_id', process.id)
      .order('effective_date'),
    db
      .from('employees')
      .select('*')
      .eq('organization_id', orgId)
      .eq('client_id', clientId)
      .order('name')
      .limit(1000),
    db
      .from('dp_validation_results')
      .select('*')
      .eq('organization_id', orgId)
      .eq('process_id', process.id)
      .order('created_at', { ascending: false }),
    db
      .from('process_approvals')
      .select('*')
      .eq('organization_id', orgId)
      .eq('process_id', process.id)
      .order('requested_at', { ascending: false }),
    db
      .from('process_evidence')
      .select('*')
      .eq('organization_id', orgId)
      .eq('process_id', process.id)
      .order('created_at', { ascending: false }),
    db
      .from('documents')
      .select('*')
      .eq('organization_id', orgId)
      .eq('client_id', clientId)
      .eq('competence', competence)
      .order('created_at', { ascending: false }),
    db
      .from('audit_logs')
      .select('id,action,actor_id,metadata,created_at')
      .eq('organization_id', orgId)
      .eq('entity_id', process.id)
      .order('created_at', { ascending: false })
      .limit(50),
    getContext().then((ctx) => ctx.members),
  ]);
  // The prior-competence comparison is loaded separately because occurrences reference a competence id.
  const priorProcess = await db
    .from('department_processes')
    .select('id')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .eq('competence', previousCompetence)
    .maybeSingle();
  const priorOccurrences = priorProcess.data
    ? await db
        .from('dp_occurrences')
        .select('type')
        .eq('organization_id', orgId)
        .eq('process_id', priorProcess.data.id)
    : { data: [], error: null };
  [
    steps,
    collection,
    occurrences,
    employees,
    validations,
    approvals,
    evidence,
    documents,
    history,
    priorProcess,
    priorOccurrences,
  ].forEach((result) => check(result.error));
  return {
    process,
    user,
    permissions,
    members,
    steps: steps.data ?? [],
    collection: collection.data ?? [],
    occurrences: occurrences.data ?? [],
    employees: employees.data ?? [],
    validations: validations.data ?? [],
    approvals: approvals.data ?? [],
    evidence: evidence.data ?? [],
    documents: documents.data ?? [],
    previous: priorOccurrences.data ?? [],
    history: history.data ?? [],
  };
}

export async function getDpPending() {
  const { db, orgId } = await requirePermission('processes.read');
  const [validations, collection, steps] = await Promise.all([
    db
      .from('dp_validation_results')
      .select('*,department_processes(competence,client_id,clients(name))')
      .eq('organization_id', orgId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('dp_collection_items')
      .select('*,department_processes(competence,client_id,clients(name))')
      .eq('organization_id', orgId)
      .eq('response', 'pending')
      .limit(100),
    db
      .from('workflow_step_runs')
      .select('*,workflow_steps(name),department_processes(competence,client_id,due_at,clients(name))')
      .eq('organization_id', orgId)
      .in('status', ['blocked', 'failed'])
      .limit(100),
  ]);
  [validations, collection, steps].forEach((result) => check(result.error));
  return { validations: validations.data ?? [], collection: collection.data ?? [], steps: steps.data ?? [] };
}

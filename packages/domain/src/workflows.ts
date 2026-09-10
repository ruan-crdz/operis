export const workflowStepKinds = [
  'manual',
  'automatic',
  'approval',
  'wait',
  'condition',
  'integration',
] as const;
export type WorkflowStepKind = (typeof workflowStepKinds)[number];
export const workflowStepRunStatuses = [
  'pending',
  'ready',
  'in_progress',
  'waiting',
  'completed',
  'skipped',
  'failed',
  'blocked',
] as const;
export type WorkflowStepRunStatus = (typeof workflowStepRunStatuses)[number];
export const processStatuses = [
  'not_started',
  'collecting_information',
  'waiting_client',
  'ready',
  'in_progress',
  'requires_attention',
  'awaiting_review',
  'approved',
  'completed',
  'blocked',
] as const;
export type ProcessStatus = (typeof processStatuses)[number];
export type ProcessHealth = 'on_track' | 'attention' | 'at_risk' | 'overdue' | 'blocked';
export type WorkflowVersion = {
  id: string;
  workflowId: string;
  version: number;
  publishedAt: string | null;
  steps: readonly {
    id: string;
    name: string;
    kind: WorkflowStepKind;
    required?: boolean;
    dependsOn: readonly string[];
  }[];
};
export type WorkflowRun = {
  id: string;
  organizationId: string;
  workflowVersionId: string;
  status: ProcessStatus;
  correlationId: string;
};
export function assertWorkflowVersionEditable(version: WorkflowVersion) {
  if (version.publishedAt) throw new Error('Crie uma nova versão para alterar um workflow publicado.');
}
export function validateWorkflowGraph(steps: WorkflowVersion['steps']) {
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length) return ['Cada etapa precisa de um identificador único.'];
  const errors: string[] = [];
  for (const step of steps)
    for (const dependency of step.dependsOn)
      if (!ids.has(dependency)) errors.push(`A dependência ${dependency} não existe.`);
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const step = steps.find((item) => item.id === id);
    if (step?.dependsOn.some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (steps.some((step) => visit(step.id))) errors.push('O workflow não pode conter ciclos.');
  return errors;
}
const transitions: Record<WorkflowStepRunStatus, readonly WorkflowStepRunStatus[]> = {
  pending: ['ready', 'skipped'],
  ready: ['in_progress', 'waiting', 'completed', 'skipped', 'blocked'],
  in_progress: ['waiting', 'completed', 'failed', 'blocked'],
  waiting: ['ready', 'in_progress', 'completed', 'blocked'],
  completed: [],
  skipped: [],
  failed: ['ready', 'in_progress'],
  blocked: ['ready', 'in_progress'],
};
export function canTransitionWorkflowStep(
  from: WorkflowStepRunStatus,
  to: WorkflowStepRunStatus,
  dependenciesComplete = true,
) {
  return (
    transitions[from].includes(to) && (!['in_progress', 'completed'].includes(to) || dependenciesComplete)
  );
}
export function workflowProgress(steps: readonly { required: boolean; status: WorkflowStepRunStatus }[]) {
  const applicable = steps.filter((step) => step.required && step.status !== 'skipped');
  const completed = applicable.filter((step) => step.status === 'completed').length;
  return {
    completed,
    applicable: applicable.length,
    percentage: applicable.length ? Math.round((completed / applicable.length) * 100) : 100,
  };
}
export function processHealth(input: {
  status: ProcessStatus;
  dueAt: string | null;
  now?: Date;
  blockingErrors?: number;
  warnings?: number;
}): ProcessHealth {
  if (input.status === 'blocked') return 'blocked';
  if (input.status === 'completed') return 'on_track';
  if ((input.blockingErrors ?? 0) > 0) return 'attention';
  if (input.dueAt) {
    const due = new Date(input.dueAt).getTime(),
      now = (input.now ?? new Date()).getTime();
    if (due < now) return 'overdue';
    if (due - now <= 48 * 3600_000) return 'at_risk';
  }
  return (input.warnings ?? 0) > 0 ? 'attention' : 'on_track';
}
export const occurrenceTypes = [
  'admission',
  'termination',
  'vacation',
  'leave',
  'salary_change',
  'role_change',
  'work_schedule_change',
  'dependent_change',
  'variable_earning',
  'variable_discount',
  'overtime',
  'absence',
  'bonus',
  'commission',
  'other',
] as const;
export type OccurrenceType = (typeof occurrenceTypes)[number];
export type ValidationIssue = {
  ruleId: string;
  ruleVersion: number;
  category: 'data_quality' | 'operational' | 'legal' | 'financial' | 'integration';
  severity: 'error' | 'warning' | 'info';
  entityType: string;
  entityId: string | null;
  message: string;
};
export type ValidationRule<T> = {
  id: string;
  version: number;
  category: ValidationIssue['category'];
  severity: ValidationIssue['severity'];
  appliesTo: string;
  evaluate(context: T): ValidationIssue[];
};
export function validateOccurrence(input: {
  type: OccurrenceType;
  employeeId?: string | null;
  effectiveDate: string;
  competence: string;
}) {
  const issues: ValidationIssue[] = [];
  if (!['admission', 'other'].includes(input.type) && !input.employeeId)
    issues.push({
      ruleId: 'occurrence.employee.required',
      ruleVersion: 1,
      category: 'operational',
      severity: 'error',
      entityType: 'occurrence',
      entityId: null,
      message: 'Selecione o colaborador desta movimentação.',
    });
  if (input.effectiveDate.slice(0, 7) !== input.competence)
    issues.push({
      ruleId: 'occurrence.date.competence',
      ruleVersion: 1,
      category: 'operational',
      severity: 'error',
      entityType: 'occurrence',
      entityId: null,
      message: 'Data da movimentação está fora da competência.',
    });
  return issues;
}
export function canApproveProcess(input: {
  preparedBy: string | null;
  reviewer: string;
  requireDistinctReviewer: boolean;
  blockingErrors: number;
}) {
  return (
    input.blockingErrors === 0 && (!input.requireDistinctReviewer || input.preparedBy !== input.reviewer)
  );
}
export function canCompleteProcess(input: {
  requiredStepsIncomplete: number;
  blockingErrors: number;
  approved: boolean;
}) {
  return input.requiredStepsIncomplete === 0 && input.blockingErrors === 0 && input.approved;
}
export function compareCompetenceOccurrences(
  current: readonly OccurrenceType[],
  previous: readonly OccurrenceType[],
) {
  const count = (items: readonly OccurrenceType[]) =>
    items.reduce<Partial<Record<OccurrenceType, number>>>(
      (result, item) => ({ ...result, [item]: (result[item] ?? 0) + 1 }),
      {},
    );
  const a = count(current),
    b = count(previous);
  return occurrenceTypes
    .map((type) => ({
      type,
      current: a[type] ?? 0,
      previous: b[type] ?? 0,
      difference: (a[type] ?? 0) - (b[type] ?? 0),
    }))
    .filter((item) => item.current || item.previous);
}
export function maskCpf(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : 'CPF protegido';
}

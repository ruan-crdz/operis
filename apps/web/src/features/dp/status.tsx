import { Badge } from '@operis/ui';

export const processStatusLabels: Record<string, string> = {
  not_started: 'Não iniciado',
  collecting_information: 'Coletando informações',
  waiting_client: 'Aguardando cliente',
  ready: 'Pronto',
  in_progress: 'Em andamento',
  requires_attention: 'Requer atenção',
  awaiting_review: 'Aguardando revisão',
  approved: 'Aprovado',
  completed: 'Concluído',
  blocked: 'Bloqueado',
};
export const healthLabels: Record<string, string> = {
  on_track: 'No prazo',
  attention: 'Atenção',
  at_risk: 'Em risco',
  overdue: 'Atrasado',
  blocked: 'Bloqueado',
};
export const stepStatusLabels: Record<string, string> = {
  pending: 'Bloqueada por dependência',
  ready: 'Pronta',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  completed: 'Concluída',
  skipped: 'Não aplicável',
  failed: 'Falhou',
  blocked: 'Bloqueada',
};
export const occurrenceLabels: Record<string, string> = {
  admission: 'Admissão',
  termination: 'Desligamento',
  vacation: 'Férias',
  leave: 'Afastamento',
  salary_change: 'Alteração salarial',
  role_change: 'Alteração de cargo',
  work_schedule_change: 'Alteração de jornada',
  dependent_change: 'Alteração de dependente',
  variable_earning: 'Provento variável',
  variable_discount: 'Desconto variável',
  overtime: 'Horas extras',
  absence: 'Falta',
  bonus: 'Bonificação',
  commission: 'Comissão',
  other: 'Outro',
};
const tone = (value: string) =>
  value === 'completed' || value === 'approved' || value === 'on_track'
    ? 'success'
    : value === 'blocked' || value === 'overdue' || value === 'failed'
      ? 'danger'
      : value === 'requires_attention' ||
          value === 'attention' ||
          value === 'at_risk' ||
          value === 'waiting_client'
        ? 'warning'
        : value === 'awaiting_review'
          ? 'ai'
          : 'neutral';
export function ProcessBadge({ status }: { status: string }) {
  return <Badge tone={tone(status)}>{processStatusLabels[status] ?? status}</Badge>;
}
export function HealthBadge({ health }: { health: string }) {
  return <Badge tone={tone(health)}>{healthLabels[health] ?? health}</Badge>;
}
export function StepBadge({ status }: { status: string }) {
  return <Badge tone={tone(status)}>{stepStatusLabels[status] ?? status}</Badge>;
}

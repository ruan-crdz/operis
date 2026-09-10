import Link from '@/runtime/link';
import { getDpCockpit } from '@/client/dp';
import {
  workflowProgress,
  maskCpf,
  occurrenceTypes,
  compareCompetenceOccurrences,
  type WorkflowStepRunStatus,
  type OccurrenceType,
} from '@operis/domain';
import { ActionButton, ActionForm } from '@/features/forms/action-form';
import {
  addDpOccurrence,
  completeDpProcess,
  reopenDpProcess,
  requestDpReview,
  resolveDpValidation,
  reviewDpProcess,
  updateDpCollection,
  updateDpStep,
  validateDpProcess,
} from '@/client/actions/dp';
import { occurrenceLabels, ProcessBadge, StepBadge } from '@/features/dp/status';
import { Alert, Badge, EmptyState, PageHeader, Panel } from '@operis/ui';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  ListChecks,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : 'Não informado';

export default async function DpCockpit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const clientId = params.client ?? '';
  const competence = params.competence ?? '';
  const data = await getDpCockpit(clientId, competence);
  if (!data.process)
    return (
      <>
        <PageHeader
          eyebrow="Departamento Pessoal"
          title="Competência não aberta"
          description="O cliente ainda não possui processo nesta competência."
        />
        <Panel>
          <EmptyState
            title="Processo não encontrado"
            description="Volte à carteira e abra a competência para este cliente."
            action={
              <Link className="button button-primary" href={`/app/departamentos/dp?competence=${competence}`}>
                Voltar à carteira
              </Link>
            }
          />
        </Panel>
      </>
    );
  const process = data.process;
  const progress = workflowProgress(
    data.steps.map((run) => ({
      required: run.workflow_steps?.required ?? true,
      status: run.status as WorkflowStepRunStatus,
    })),
  );
  const errors = data.validations.filter((v) => v.severity === 'error' && !v.resolved_at);
  const warnings = data.validations.filter((v) => v.severity === 'warning' && !v.resolved_at);
  const pendingCollection = data.collection.filter((item) => item.response === 'pending').length;
  const comparison = compareCompetenceOccurrences(
    data.occurrences.map((item) => item.type as OccurrenceType),
    data.previous.map((item) => item.type as OccurrenceType),
  );
  const canManage = data.permissions.has('processes.manage');
  const canReview = data.permissions.has('processes.review');
  const employeeOptions = [
    { value: '', label: 'Sem colaborador (admissão/outro)' },
    ...data.employees.map((employee) => ({ value: employee.id, label: employee.name })),
  ];
  const documentOptions = [
    { value: '', label: 'Sem documento vinculado' },
    ...data.documents.map((document) => ({ value: document.id, label: document.original_filename })),
  ];
  return (
    <>
      <PageHeader
        eyebrow={`DP · ${competence}`}
        title={process.clients?.name ?? 'Competência de DP'}
        description="Cockpit operacional com coleta, movimentações, validação, revisão e evidências."
        actions={
          <div className="actions">
            <Link className="button button-secondary" href={`/app/departamentos/dp?competence=${competence}`}>
              <ArrowLeft size={16} /> Carteira
            </Link>
            <ProcessBadge status={process.status} />
          </div>
        }
      />
      <div className="process-summary panel panel-pad">
        <div>
          <span className="muted">Progresso do workflow</span>
          <strong>{progress.percentage}%</strong>
          <div className="progress-track">
            <span style={{ width: `${progress.percentage}%` }} />
          </div>
          <small>
            {progress.completed} de {progress.applicable} etapas obrigatórias
          </small>
        </div>
        <div>
          <span className="muted">Prazo</span>
          <strong>{formatDate(process.due_at)}</strong>
          <small>Versão do processo {process.version}</small>
        </div>
        <div>
          <span className="muted">Pendências</span>
          <strong>{errors.length + warnings.length + pendingCollection}</strong>
          <small>
            {errors.length} erros · {warnings.length} avisos · {pendingCollection} confirmações
          </small>
        </div>
      </div>
      {errors.length > 0 && (
        <Alert tone="danger">
          Há {errors.length} erro(s) bloqueante(s). Resolva-os antes da revisão e da conclusão.
        </Alert>
      )}
      <div className="cockpit-grid">
        <div className="stack">
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <ListChecks size={18} /> Etapas do workflow
              </h2>
              <Badge tone="ai">v{process.workflow_version_id.slice(0, 8)}</Badge>
            </div>
            {data.steps
              .sort((a, b) => (a.workflow_steps?.position ?? 0) - (b.workflow_steps?.position ?? 0))
              .map((run) => (
                <div className="workflow-row" key={run.id}>
                  <div className="workflow-index">{run.workflow_steps?.position}</div>
                  <div className="workflow-main">
                    <div className="actions">
                      <strong>{run.workflow_steps?.name}</strong>
                      <StepBadge status={run.status} />
                      {run.workflow_steps?.kind === 'automatic' && <Badge tone="ai">Automática</Badge>}
                    </div>
                    {run.error && <small className="field-error">{run.error}</small>}
                    <small className="muted">
                      {run.workflow_steps?.expected_duration_minutes ?? '—'} min estimados
                    </small>
                  </div>
                  {canManage &&
                    ['ready', 'in_progress', 'waiting', 'blocked', 'failed'].includes(run.status) && (
                      <div className="actions">
                        {run.status === 'ready' && (
                          <ActionButton
                            action={updateDpStep}
                            fields={{ id: run.id, version: String(run.version), status: 'in_progress' }}
                          >
                            Iniciar
                          </ActionButton>
                        )}
                        {['ready', 'in_progress', 'waiting', 'blocked', 'failed'].includes(run.status) &&
                          run.workflow_steps?.kind !== 'approval' && (
                            <ActionButton
                              action={updateDpStep}
                              fields={{ id: run.id, version: String(run.version), status: 'completed' }}
                              variant="primary"
                            >
                              Concluir
                            </ActionButton>
                          )}
                      </div>
                    )}
                </div>
              ))}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <ClipboardCheck size={18} /> Checklist de coleta
              </h2>
              <Badge tone={pendingCollection ? 'warning' : 'success'}>
                {data.collection.length - pendingCollection}/{data.collection.length}
              </Badge>
            </div>
            {data.collection.map((item) => (
              <details className="collection-row" key={item.id}>
                <summary>
                  <span>{item.label}</span>
                  <Badge tone={item.response === 'pending' ? 'warning' : 'success'}>
                    {item.response === 'pending' ? 'Pendente' : 'Respondido'}
                  </Badge>
                </summary>
                <div className="panel-pad">
                  <ActionForm
                    action={updateDpCollection}
                    submit="Salvar item"
                    hidden={{ id: item.id }}
                    columns
                    disabled={!data.permissions.has('dp.manage')}
                    fields={[
                      {
                        name: 'response',
                        label: 'Resposta estruturada',
                        type: 'select',
                        required: true,
                        value: item.response,
                        options: [
                          { value: 'pending', label: 'Pendente' },
                          { value: 'has_information', label: 'Há informação/movimentação' },
                          { value: 'no_occurrence', label: 'Sem ocorrência' },
                          { value: 'not_applicable', label: 'Não aplicável' },
                        ],
                      },
                      {
                        name: 'status',
                        label: 'Situação',
                        type: 'select',
                        required: true,
                        value: item.status,
                        options: [
                          { value: 'not_requested', label: 'Não solicitado' },
                          { value: 'requested', label: 'Solicitado' },
                          { value: 'waiting', label: 'Aguardando' },
                          { value: 'received', label: 'Recebido' },
                          { value: 'validated', label: 'Validado' },
                          { value: 'not_applicable', label: 'Não aplicável' },
                          { value: 'rejected', label: 'Rejeitado' },
                        ],
                      },
                      {
                        name: 'document_id',
                        label: 'Evidência documental',
                        type: 'select',
                        value: item.document_id ?? '',
                        options: documentOptions,
                      },
                      {
                        name: 'notes',
                        label: 'Observações',
                        type: 'textarea',
                        value: item.notes,
                        full: true,
                      },
                    ]}
                  />
                </div>
              </details>
            ))}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <UsersRound size={18} /> Movimentações e ocorrências
              </h2>
              <Badge tone="neutral">{data.occurrences.length}</Badge>
            </div>
            {data.occurrences.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{occurrenceLabels[item.type] ?? item.type}</strong>
                  <small className="muted" style={{ display: 'block' }}>
                    {item.employees?.name ?? 'Sem colaborador'} · {formatDate(item.effective_date)} ·{' '}
                    {item.source}
                  </small>
                </div>
                <Badge tone={item.status === 'validated' ? 'success' : 'warning'}>{item.status}</Badge>
              </div>
            ))}
            {!data.occurrences.length && (
              <EmptyState
                title="Nenhuma movimentação"
                description="Registre ocorrências ou confirme ausência no checklist."
              />
            )}
            {data.permissions.has('occurrences.manage') && (
              <div className="panel-pad" style={{ borderTop: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: 16 }}>Registrar movimentação</h3>
                <ActionForm
                  action={addDpOccurrence}
                  submit="Registrar ocorrência"
                  hidden={{ process_id: process.id }}
                  columns
                  fields={[
                    {
                      name: 'type',
                      label: 'Tipo',
                      type: 'select',
                      required: true,
                      options: occurrenceTypes.map((value) => ({
                        value,
                        label: occurrenceLabels[value] ?? value,
                      })),
                    },
                    { name: 'employee_id', label: 'Colaborador', type: 'select', options: employeeOptions },
                    {
                      name: 'effective_date',
                      label: 'Data efetiva',
                      type: 'date',
                      required: true,
                      value: `${competence}-01`,
                    },
                    {
                      name: 'source',
                      label: 'Origem',
                      type: 'select',
                      required: true,
                      options: [
                        { value: 'manual', label: 'Registro manual' },
                        { value: 'spreadsheet', label: 'Planilha' },
                        { value: 'document', label: 'Documento' },
                        { value: 'client', label: 'Cliente' },
                      ],
                    },
                    { name: 'document_id', label: 'Documento', type: 'select', options: documentOptions },
                    { name: 'notes', label: 'Observações', type: 'textarea', full: true },
                  ]}
                />
              </div>
            )}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <ShieldCheck size={18} /> Validações determinísticas
              </h2>
              <div className="actions">
                <Badge tone={errors.length ? 'danger' : 'success'}>{errors.length} erros</Badge>
                <Badge tone={warnings.length ? 'warning' : 'neutral'}>{warnings.length} avisos</Badge>
              </div>
            </div>
            {data.validations.map((item) => (
              <details className="collection-row" key={item.id}>
                <summary>
                  <span>{item.message}</span>
                  <Badge
                    tone={item.resolved_at ? 'success' : item.severity === 'error' ? 'danger' : 'warning'}
                  >
                    {item.resolved_at ? 'Resolvida' : item.severity}
                  </Badge>
                </summary>
                {!item.resolved_at && data.permissions.has('dp.review') && (
                  <div className="panel-pad">
                    <ActionForm
                      action={resolveDpValidation}
                      hidden={{ id: item.id }}
                      submit="Resolver com justificativa"
                      fields={[
                        {
                          name: 'resolution',
                          label: 'Justificativa da resolução',
                          type: 'textarea',
                          required: true,
                        },
                      ]}
                    />
                  </div>
                )}
              </details>
            ))}
            {!data.validations.length && (
              <EmptyState
                title="Ainda não validado"
                description="Execute as regras para conferir dados e pendências antes da revisão."
              />
            )}
            {data.permissions.has('dp.manage') && (
              <div className="panel-pad" style={{ borderTop: '1px solid var(--border)' }}>
                <ActionButton
                  action={validateDpProcess}
                  fields={{ process_id: process.id }}
                  variant="primary"
                >
                  Executar validação
                </ActionButton>
              </div>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel className="panel-pad">
            <h2 className="actions">
              <ShieldCheck size={18} /> Revisão e aprovação
            </h2>
            <p className="muted" style={{ margin: '12px 0 18px' }}>
              O workflow exige uma segunda pessoa para aprovar. Quem preparou não pode aprovar o próprio
              processo.
            </p>
            {canManage && process.status !== 'awaiting_review' && process.status !== 'completed' && (
              <ActionButton
                action={requestDpReview}
                fields={{ process_id: process.id, version: String(process.version) }}
                confirm="Enviar este processo para revisão?"
              >
                Solicitar revisão
              </ActionButton>
            )}
            {canReview && process.status === 'awaiting_review' && (
              <div className="stack">
                <ActionButton
                  action={reviewDpProcess}
                  fields={{ process_id: process.id, version: String(process.version), decision: 'approved' }}
                  variant="primary"
                >
                  Aprovar
                </ActionButton>
                <ActionForm
                  action={reviewDpProcess}
                  hidden={{ process_id: process.id, version: String(process.version), decision: 'returned' }}
                  submit="Devolver para ajuste"
                  fields={[
                    { name: 'comment', label: 'Motivo da devolução', type: 'textarea', required: true },
                  ]}
                />
              </div>
            )}
            {canManage && process.status === 'approved' && (
              <div style={{ marginTop: 12 }}>
                <ActionButton
                  action={completeDpProcess}
                  fields={{ process_id: process.id, version: String(process.version) }}
                  confirm="Concluir a competência?"
                  variant="primary"
                >
                  <CheckCircle2 size={16} /> Concluir competência
                </ActionButton>
              </div>
            )}
            {canReview && process.status === 'completed' && (
              <div style={{ marginTop: 12 }}>
                <ActionForm
                  action={reopenDpProcess}
                  hidden={{ process_id: process.id }}
                  submit="Reabrir competência"
                  fields={[{ name: 'reason', label: 'Justificativa', type: 'textarea', required: true }]}
                />
              </div>
            )}
            {data.approvals.map((item) => (
              <div key={item.id} className="timeline-item">
                <Badge
                  tone={
                    item.decision === 'approved' ? 'success' : item.decision === 'returned' ? 'danger' : 'ai'
                  }
                >
                  {item.decision}
                </Badge>
                <small className="muted">{formatDate(item.decided_at ?? item.requested_at)}</small>
                {item.comment && <p>{item.comment}</p>}
              </div>
            ))}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <UserRound size={18} /> Colaboradores
              </h2>
              <Badge tone="neutral">{data.employees.length}</Badge>
            </div>
            {data.employees.slice(0, 20).map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small className="muted" style={{ display: 'block' }}>
                    {maskCpf(item.cpf)}
                  </small>
                </div>
                <Badge tone={item.status === 'active' ? 'success' : 'neutral'}>{item.status}</Badge>
              </div>
            ))}
            {!data.employees.length && (
              <EmptyState
                title="Sem colaboradores"
                description="Conclua uma importação validada do cadastro de empregados."
              />
            )}
            <div className="panel-pad" style={{ borderTop: '1px solid var(--border)' }}>
              <Link
                className="button button-secondary"
                href={`/app/importacoes/nova?client=${clientId}&competence=${competence}`}
              >
                Importar cadastro
              </Link>
            </div>
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <History size={18} /> Comparativo mensal
              </h2>
            </div>
            {comparison.length ? (
              comparison.map((item) => (
                <div className="list-row" key={item.type}>
                  <span>{occurrenceLabels[item.type]}</span>
                  <strong>
                    {item.previous} → {item.current} ({item.difference >= 0 ? '+' : ''}
                    {item.difference})
                  </strong>
                </div>
              ))
            ) : (
              <EmptyState
                title="Sem base comparável"
                description="O comparativo aparecerá quando houver movimentações nesta competência ou na anterior."
              />
            )}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <History size={18} /> Histórico
              </h2>
            </div>
            {data.history.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.action.replaceAll('.', ' · ')}</strong>
                  <small className="muted" style={{ display: 'block' }}>
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                      new Date(item.created_at),
                    )}
                  </small>
                </div>
              </div>
            ))}
            {!data.history.length && (
              <EmptyState
                title="Sem eventos"
                description="As ações deste processo aparecerão na linha do tempo."
              />
            )}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <FileText size={18} /> Documentos e evidências
              </h2>
              <Badge tone="neutral">{data.documents.length + data.evidence.length}</Badge>
            </div>
            {data.documents.map((item) => (
              <Link className="list-row" href={`/api/documents/${item.id}`} key={item.id}>
                <span>{item.original_filename}</span>
                <Badge tone="neutral">{item.category}</Badge>
              </Link>
            ))}
            {!data.documents.length && (
              <EmptyState
                title="Sem documentos"
                description="Envie documentos pela área central e vincule-os ao checklist."
              />
            )}
          </Panel>
          <Panel className="panel-pad">
            <h2 className="actions">
              <Archive size={18} /> Folha e resumo
            </h2>
            <p className="muted" style={{ marginTop: 12 }}>
              Esta fase organiza entradas, revisão e evidências. O Operis não calcula folha, não transmite
              eSocial e não substitui o sistema oficial.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

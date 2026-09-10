import Link from '@/runtime/link';
import { notFound } from '@/runtime/navigation';
import { PageHeader, Panel, Badge, EmptyState } from '@operis/ui';
import { statusLabels, formatDate } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { TaskDependencies } from '@/features/tasks/dependencies';
import { TaskForm } from '@/features/tasks/task-form';
import { ActionForm } from '@/features/forms/action-form';
import { addComment } from '@/client/actions/tasks';
export default async function TaskDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { db, orgId, permissions } = await requirePermission('tasks.read');
  const { data: task, error } = await db
    .from('tasks')
    .select('*,clients(name),departments(name),profiles!tasks_created_by_fkey(full_name)')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  check(error);
  if (!task) notFound();
  const [comments, history] = await Promise.all([
    db
      .from('task_comments')
      .select('*,profiles(full_name)')
      .eq('organization_id', orgId)
      .eq('task_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('audit_logs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  check(comments.error);
  check(history.error);
  if ((await searchParams).edit === 'true' && permissions.has('tasks.update'))
    return (
      <>
        <PageHeader eyebrow={task.clients?.name} title="Editar tarefa" />
        <Panel className="panel-pad">{await TaskForm({ task })}</Panel>
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow={`${task.clients?.name} · ${task.competence}`}
        title={task.title}
        actions={
          <>
            <Badge
              tone={
                task.status === 'completed' ? 'success' : task.status === 'blocked' ? 'danger' : 'neutral'
              }
            >
              {statusLabels[task.status as keyof typeof statusLabels]}
            </Badge>
            {permissions.has('tasks.update') && (
              <Link href={`?edit=true`} className="button button-secondary">
                Editar tarefa
              </Link>
            )}
          </>
        }
      />
      <div className="detail-grid">
        <div className="stack">
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 16 }}>Orientações</h2>
            <p className="pre-wrap muted">{task.description || 'Nenhuma orientação adicional.'}</p>
            {task.blocked_reason && (
              <p className="alert alert-warning" style={{ marginTop: 20 }}>
                Motivo do bloqueio: {task.blocked_reason}
              </p>
            )}
          </Panel>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 24 }}>Comentários</h2>
            {permissions.has('tasks.update') && (
              <ActionForm
                action={addComment}
                submit="Publicar comentário"
                hidden={{ task_id: id }}
                fields={[
                  {
                    name: 'body',
                    label: 'Seu comentário',
                    type: 'textarea',
                    required: true,
                    placeholder: 'Registre um contexto ou uma atualização…',
                  },
                ]}
              />
            )}
            <div className="timeline" style={{ padding: 0, marginTop: 24 }}>
              {comments.data?.map((c) => (
                <article key={c.id} className="timeline-item">
                  <h3>{c.profiles?.full_name || 'Colaborador'}</h3>
                  <p className="pre-wrap">{c.body}</p>
                  <small>{formatDate(c.created_at)}</small>
                </article>
              ))}
            </div>
            {!comments.data?.length && (
              <p className="muted" style={{ marginTop: 20 }}>
                Ainda não há comentários nesta tarefa.
              </p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          {await TaskDependencies({ taskId: id })}
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 24 }}>Contexto da tarefa</h2>
            <dl className="detail-meta">
              <div>
                <dt>Cliente</dt>
                <dd>
                  <Link href={`/app/clientes/${task.client_id}`}>{task.clients?.name}</Link>
                </dd>
              </div>
              <div>
                <dt>Competência</dt>
                <dd>{task.competence}</dd>
              </div>
              <div>
                <dt>Departamento</dt>
                <dd>{task.departments?.name ?? 'Não definido'}</dd>
              </div>
              <div>
                <dt>Prazo</dt>
                <dd>{formatDate(task.due_date)}</dd>
              </div>
              <div>
                <dt>Criada por</dt>
                <dd>{task.profiles?.full_name}</dd>
              </div>
              <div>
                <dt>Identificação</dt>
                <dd className="mono">{task.id.slice(0, 8)}</dd>
              </div>
            </dl>
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2>Histórico de alterações</h2>
            </div>
            {history.data?.length ? (
              <div className="timeline">
                {history.data.map((log) => (
                  <div className="timeline-item" key={log.id}>
                    <p style={{ fontSize: 12 }}>
                      {log.action === 'tasks.insert' ? 'Tarefa criada' : 'Tarefa atualizada'}
                    </p>
                    <small>{formatDate(log.created_at)}</small>
                    {log.metadata &&
                      typeof log.metadata === 'object' &&
                      !Array.isArray(log.metadata) &&
                      log.metadata.status && (
                        <small>
                          Status: {statusLabels[String(log.metadata.status) as keyof typeof statusLabels]}
                        </small>
                      )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Histórico protegido"
                description="A consulta da auditoria depende do seu papel de acesso."
              />
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

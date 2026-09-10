import Link from '@/runtime/link';
import { ArrowUpRight, CheckSquare, Clock, FileSpreadsheet, Plus } from 'lucide-react';
import { Badge, EmptyState, PageHeader, Panel, Stat } from '@operis/ui';
import { formatDate, statusLabels, today } from '@operis/domain';
import { getContext } from '@/client/auth/context';
import { getDashboard } from '@/client/queries';
export default async function Dashboard() {
  const ctx = await getContext();
  const data = await getDashboard();
  return (
    <>
      <PageHeader
        eyebrow="Seu escritório, em movimento"
        title={`Olá, ${ctx.profile.full_name.split(' ')[0] || 'bem-vindo'}.`}
        description="Tudo o que precisa da sua atenção, em um só lugar."
        actions={
          <>
            <span className="muted" style={{ fontSize: 12, marginRight: 8 }}>
              {formatDate(today())}
            </span>
            {ctx.permissions.has('tasks.create') && (
              <Link href="/app/tarefas/nova" className="button button-primary">
                <Plus size={16} />
                Nova tarefa
              </Link>
            )}
          </>
        }
      />
      <div className="stats">
        <Stat
          label="Tarefas atrasadas"
          value={data.overdue}
          caption="Precisam de atenção agora"
          tone="danger"
        />
        <Stat label="Vencendo hoje" value={data.due} caption="Prioridades do dia" tone="warning" />
        <Stat label="Aguardando cliente" value={data.waiting} caption="Próximo passo fora do escritório" />
        <Stat label="Em revisão" value={data.review} caption="Prontas para uma conferência" tone="ai" />
      </div>
      <div className="dashboard-grid">
        <div className="stack">
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <CheckSquare size={18} />
                Minha fila de trabalho
              </h2>
              <Link href="/app/fila" className="actions muted" style={{ fontSize: 12 }}>
                Ver minha fila <ArrowUpRight size={14} />
              </Link>
            </div>
            {data.tasks.length ? (
              data.tasks.map((task) => (
                <Link key={task.id} href={`/app/tarefas/${task.id}`} className="list-row">
                  <div className="list-title">
                    <span className="row-icon">
                      <CheckSquare size={16} />
                    </span>
                    <div>
                      {task.title}
                      <small>
                        {task.clients?.name} · {task.competence}
                      </small>
                    </div>
                  </div>
                  <div className="actions">
                    <Badge
                      tone={
                        task.status === 'review'
                          ? 'ai'
                          : task.status === 'waiting_client'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {statusLabels[task.status as keyof typeof statusLabels]}
                    </Badge>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {formatDate(task.due_date)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                title="Sua fila está livre"
                description="As tarefas atribuídas a você aparecerão aqui, ordenadas pelo prazo."
                action={
                  ctx.permissions.has('tasks.create') ? (
                    <Link href="/app/tarefas/nova" className="button button-secondary">
                      Criar primeira tarefa
                    </Link>
                  ) : undefined
                }
              />
            )}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <Clock size={18} />
                Documentos solicitados
              </h2>
              <Link href="/app/documentos" className="muted" style={{ fontSize: 12 }}>
                Ver documentos ↗
              </Link>
            </div>
            {data.requests.length ? (
              data.requests.map((request) => {
                const total = request.document_request_items.length,
                  received = request.document_request_items.filter((i) => i.status === 'accepted').length;
                return (
                  <div className="list-row" key={request.id}>
                    <div>
                      <Link href="/app/documentos">{request.title}</Link>
                      <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                        {request.clients?.name} · Prazo {formatDate(request.due_date)}
                      </small>
                    </div>
                    <Badge tone={received === total ? 'success' : 'warning'}>
                      {received}/{total} aceitos
                    </Badge>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="Nenhuma solicitação aberta"
                description="Solicite documentos aos seus clientes e acompanhe o recebimento."
                action={
                  ctx.permissions.has('documents.manage') ? (
                    <Link href="/app/documentos/solicitar" className="button button-secondary">
                      Solicitar documentos
                    </Link>
                  ) : undefined
                }
              />
            )}
          </Panel>
        </div>
        <aside className="stack">
          <div className="operational-note">
            <p className="eyebrow" style={{ margin: 0 }}>
              Visão da operação
            </p>
            <h2 style={{ marginTop: 12 }}>
              {data.clients} {data.clients === 1 ? 'cliente ativo' : 'clientes ativos'}
            </h2>
            <p>Acompanhe a operação de cada empresa, com tarefas, documentos e competências conectados.</p>
            <Link
              href="/app/clientes"
              className="button button-ghost button-sm"
              style={{ marginTop: 12, paddingLeft: 0 }}
            >
              Abrir carteira <ArrowUpRight size={14} />
            </Link>
          </div>
          <Panel>
            <div className="panel-heading">
              <h2>Últimas importações</h2>
              <FileSpreadsheet size={16} className="muted" />
            </div>
            {data.imports.length ? (
              data.imports.map((item) => (
                <Link key={item.id} className="list-row" href={`/app/importacoes/${item.id}`}>
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.original_filename}
                    </p>
                    <small className="muted">{formatDate(item.created_at)}</small>
                    <div style={{ marginTop: 8 }}>
                      <Badge
                        tone={
                          item.status === 'completed' ? 'success' : item.status === 'failed' ? 'danger' : 'ai'
                        }
                      >
                        {
                          (
                            {
                              completed: 'Concluída',
                              mapping: 'Em mapeamento',
                              awaiting_approval: 'Em revisão',
                              approved: 'Na fila',
                              processing: 'Processando',
                              failed: 'Falhou',
                              cancelled: 'Cancelada',
                            } as Record<string, string>
                          )[item.status]
                        }
                      </Badge>
                    </div>
                  </div>
                  <ArrowUpRight size={14} />
                </Link>
              ))
            ) : (
              <EmptyState
                title="Arquivos em ordem"
                description="Suas importações recentes aparecerão aqui."
              />
            )}
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <Link href="/app/importacoes" className="button button-secondary" style={{ width: '100%' }}>
                Abrir importações
              </Link>
            </div>
          </Panel>
          <p className="muted" style={{ fontSize: 11, padding: '0 8px' }}>
            Os indicadores refletem os registros acessíveis ao seu perfil neste escritório.
          </p>
        </aside>
      </div>
    </>
  );
}

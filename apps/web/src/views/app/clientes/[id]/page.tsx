import Link from '@/runtime/link';
import { notFound } from '@/runtime/navigation';
import { Badge, EmptyState, PageHeader, Panel } from '@operis/ui';
import { formatDate, statusLabels, today } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { ClientForm } from '@/features/clients/client-form';
import { ActionButton, ActionForm } from '@/features/forms/action-form';
import { archiveClient, createCompetence, updateCompetence } from '@/client/actions/clients';
import { LedgerPanel } from '@/features/ledger/panel';
export default async function ClientDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; competence?: string; account?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab, competence, account } = await searchParams;
  const tab = rawTab ?? 'overview';
  const { db, orgId, permissions } = await requirePermission('clients.read');
  const { data: client, error } = await db
    .from('clients')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  check(error);
  if (!client) notFound();
  const [tasks, docs, competencies, history, snapshots] = await Promise.all([
    db
      .from('tasks')
      .select('*')
      .eq('organization_id', orgId)
      .eq('client_id', id)
      .order('due_date', { nullsFirst: false })
      .limit(50),
    db
      .from('documents')
      .select('*')
      .eq('organization_id', orgId)
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    db
      .from('competencies')
      .select('*')
      .eq('organization_id', orgId)
      .eq('client_id', id)
      .order('month', { ascending: false })
      .limit(36),
    db
      .from('audit_logs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    db
      .from('employee_snapshots')
      .select('id,employee_name,competence,admission_date')
      .eq('organization_id', orgId)
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  [tasks, docs, competencies, history, snapshots].forEach((r) => check(r.error));
  const tabs = [
    ['overview', 'Visão geral'],
    ['tasks', 'Tarefas'],
    ['documents', 'Documentos'],
    ['competencies', 'Competências'],
    ['ledger', 'Contábil'],
    ['employees', 'Colaboradores importados'],
    ['history', 'Histórico'],
    ['settings', 'Configurações'],
  ];
  return (
    <>
      <PageHeader
        eyebrow="Carteira de clientes"
        title={client.name}
        description={client.trade_name || client.tax_id || 'Cadastro do cliente'}
        actions={
          <>
            <Badge tone={client.archived_at ? 'neutral' : 'success'}>
              {client.archived_at ? 'Arquivado' : 'Ativo'}
            </Badge>
            {permissions.has('tasks.create') && (
              <Link href={`/app/tarefas/nova?client=${id}`} className="button button-primary">
                Nova tarefa
              </Link>
            )}
          </>
        }
      />
      <nav className="tabs" aria-label="Áreas do cliente">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`?tab=${key}`} className={tab === key ? 'active' : ''}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'settings' ? (
        <Panel className="panel-pad">
          {permissions.has('clients.update') ? (
            <>
              {await ClientForm({ client })}
              {permissions.has('clients.archive') && (
                <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                  <ActionButton
                    action={archiveClient}
                    fields={{ id, restore: String(Boolean(client.archived_at)) }}
                    variant={client.archived_at ? 'secondary' : 'danger'}
                    confirm={
                      client.archived_at
                        ? undefined
                        : `Arquivar ${client.name}? A empresa sairá da carteira ativa. Tarefas e documentos serão preservados.`
                    }
                  >
                    {client.archived_at ? 'Reativar cliente' : 'Arquivar cliente'}
                  </ActionButton>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title="Acesso de consulta"
              description="Seu papel não permite alterar o cadastro deste cliente."
            />
          )}
        </Panel>
      ) : tab === 'tasks' ? (
        <Panel>
          {tasks.data?.length ? (
            tasks.data.map((t) => (
              <Link key={t.id} href={`/app/tarefas/${t.id}`} className="list-row">
                <span>
                  {t.title}
                  <small className="muted" style={{ display: 'block' }}>
                    {t.competence} · {formatDate(t.due_date)}
                  </small>
                </span>
                <Badge>{statusLabels[t.status as keyof typeof statusLabels]}</Badge>
              </Link>
            ))
          ) : (
            <EmptyState
              title="Nenhuma tarefa para este cliente"
              description="Cadastre a primeira tarefa para acompanhar a operação."
            />
          )}
        </Panel>
      ) : tab === 'documents' ? (
        <Panel>
          {docs.data?.length ? (
            docs.data.map((d) => (
              <div className="list-row" key={d.id}>
                <span>
                  {d.original_filename}
                  <small className="muted" style={{ display: 'block' }}>
                    {d.competence}
                  </small>
                </span>
                <Link className="button button-secondary button-sm" href={`/api/documents/${d.id}`}>
                  Baixar
                </Link>
              </div>
            ))
          ) : (
            <EmptyState
              title="Nenhum documento"
              description="Envie um arquivo para este cliente na área de documentos."
              action={
                <Link className="button button-secondary" href="/app/documentos/enviar">
                  Enviar documento
                </Link>
              }
            />
          )}
        </Panel>
      ) : tab === 'competencies' ? (
        <div className="detail-grid">
          <Panel>
            {competencies.data?.length ? (
              competencies.data.map((c) => (
                <div className="list-row" key={c.id}>
                  <div>
                    <span className="mono">{c.month}</span>
                    <div style={{ marginTop: 8 }}>
                      <Badge tone={c.status === 'closed' ? 'success' : 'neutral'}>
                        {
                          (
                            { open: 'Aberta', review: 'Em revisão', closed: 'Encerrada' } as Record<
                              string,
                              string
                            >
                          )[c.status]
                        }
                      </Badge>
                    </div>
                  </div>
                  {permissions.has('clients.update') && (
                    <ActionForm
                      action={updateCompetence}
                      submit="Atualizar"
                      hidden={{ id: c.id }}
                      fields={[
                        {
                          name: 'status',
                          label: 'Situação',
                          type: 'select',
                          value: c.status,
                          options: [
                            { value: 'open', label: 'Aberta' },
                            { value: 'review', label: 'Em revisão' },
                            { value: 'closed', label: 'Encerrada' },
                          ],
                        },
                      ]}
                    />
                  )}
                </div>
              ))
            ) : (
              <EmptyState
                title="Nenhuma competência aberta"
                description="Abra uma competência para organizar o período de trabalho."
              />
            )}
          </Panel>
          {permissions.has('clients.update') && (
            <Panel className="panel-pad">
              <h2 style={{ marginBottom: 24 }}>Abrir competência</h2>
              <ActionForm
                action={createCompetence}
                submit="Criar competência"
                hidden={{ client_id: id }}
                fields={[
                  {
                    name: 'month',
                    label: 'Competência',
                    type: 'month',
                    value: today().slice(0, 7),
                    required: true,
                  },
                ]}
              />
            </Panel>
          )}
        </div>
      ) : tab === 'employees' ? (
        <Panel>
          {snapshots.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Competência</th>
                    <th>Admissão informada</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.data.map((e) => (
                    <tr key={e.id}>
                      <td>{e.employee_name}</td>
                      <td>{e.competence}</td>
                      <td>{formatDate(e.admission_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nenhum colaborador importado"
              description="Os registros aprovados no assistente de importação aparecerão aqui."
              action={
                <Link href="/app/importacoes" className="button button-secondary">
                  Abrir importações
                </Link>
              }
            />
          )}
        </Panel>
      ) : tab === 'ledger' ? (
        await LedgerPanel({ db, orgId, clientId: id, permissions, competence, account })
      ) : tab === 'history' ? (
        <Panel>
          {history.data?.length ? (
            <div className="timeline">
              {history.data.map((h) => (
                <div className="timeline-item" key={h.id}>
                  <p>{h.action}</p>
                  <small>{formatDate(h.created_at)}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhum histórico disponível"
              description="O histórico é exibido conforme suas permissões de auditoria."
            />
          )}
        </Panel>
      ) : (
        <div className="detail-grid">
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 24 }}>Dados do cliente</h2>
            <dl className="detail-meta">
              <div>
                <dt>Razão social</dt>
                <dd>{client.name}</dd>
              </div>
              <div>
                <dt>Nome fantasia</dt>
                <dd>{client.trade_name || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Identificação</dt>
                <dd className="mono">{client.tax_id || 'Não informada'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{client.email || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Cadastrado em</dt>
                <dd>{formatDate(client.created_at)}</dd>
              </div>
            </dl>
          </Panel>
          <div className="operational-note">
            <p className="eyebrow">Próximo passo</p>
            <h2>Operação com contexto</h2>
            <p>Acesse as tarefas, abra uma competência ou reúna os documentos deste cliente.</p>
            <Link href={`?tab=tasks`} className="button button-secondary" style={{ marginTop: 20 }}>
              Acompanhar tarefas
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

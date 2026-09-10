import { FilterForm } from '@/runtime/link';
import Link from '@/runtime/link';
import { Upload, FileText, Plus } from 'lucide-react';
import { Badge, PageHeader, Panel, EmptyState } from '@operis/ui';
import { formatDate } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { ActionForm } from '@/features/forms/action-form';
import { updateRequestItem } from '@/client/actions/documents';
export default async function Documents({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const { db, orgId, permissions } = await requirePermission('documents.read');
  const page = Math.max(1, Number(params.page) || 1);
  const [docs, requests] = await Promise.all([
    db
      .from('documents')
      .select('*,clients(name)', { count: 'exact' })
      .eq('organization_id', orgId)
      .ilike('original_filename', `%${(params.q ?? '').replace(/[%_\\]/g, '').slice(0, 100)}%`)
      .order('created_at', { ascending: false })
      .range((page - 1) * 20, page * 20 - 1),
    db
      .from('document_requests')
      .select('*,clients(name),document_request_items(*)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  check(docs.error);
  check(requests.error);
  return (
    <>
      <PageHeader
        eyebrow="Gestão documental"
        title="Documentos"
        description="Arquivos protegidos, sempre conectados ao cliente e à competência."
        actions={
          <>
            {permissions.has('documents.manage') && (
              <Link href="/app/documentos/solicitar" className="button button-secondary">
                <Plus size={16} />
                Solicitar documentos
              </Link>
            )}
            {permissions.has('documents.upload') && (
              <Link href="/app/documentos/enviar" className="button button-primary">
                <Upload size={16} />
                Enviar arquivo
              </Link>
            )}
          </>
        }
      />
      <div className="stack">
        <Panel>
          <FilterForm className="table-toolbar">
            <input
              name="q"
              className="input"
              aria-label="Buscar documentos"
              placeholder="Buscar por nome do arquivo…"
              defaultValue={params.q}
            />
            <button className="button button-secondary">Buscar</button>
          </FilterForm>
          {docs.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Cliente</th>
                    <th>Competência</th>
                    <th>Tamanho</th>
                    <th>Enviado em</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.data.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span className="actions">
                          <FileText size={16} />
                          {d.original_filename}
                        </span>
                      </td>
                      <td>{d.clients?.name}</td>
                      <td className="mono">{d.competence}</td>
                      <td>{(d.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB</td>
                      <td>{formatDate(d.created_at)}</td>
                      <td>
                        <Link className="button button-secondary button-sm" href={`/api/documents/${d.id}`}>
                          Baixar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nenhum documento encontrado"
              description="Envie arquivos e vincule cada um ao cliente e à competência correspondentes."
            />
          )}
          <div className="pagination">
            <span>
              {docs.count ?? 0} arquivos · Página {page}
            </span>
            <div className="actions">
              {page > 1 && (
                <Link
                  href={`?page=${page - 1}&q=${encodeURIComponent(params.q ?? '')}`}
                  className="button button-secondary button-sm"
                >
                  Anterior
                </Link>
              )}
              {page * 20 < (docs.count ?? 0) && (
                <Link
                  href={`?page=${page + 1}&q=${encodeURIComponent(params.q ?? '')}`}
                  className="button button-secondary button-sm"
                >
                  Próxima
                </Link>
              )}
            </div>
          </div>
        </Panel>
        <div>
          <h2 style={{ marginBottom: 16 }}>Solicitações de documentos</h2>
          <div className="stack">
            {requests.data?.length ? (
              requests.data.map((r) => (
                <Panel key={r.id}>
                  <div className="panel-heading">
                    <div>
                      <h2>{r.title}</h2>
                      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {r.clients?.name} · {r.competence} · Prazo {formatDate(r.due_date)}
                      </p>
                    </div>
                    <Badge>{r.document_request_items.length} itens</Badge>
                  </div>
                  {r.document_request_items.map((item) => (
                    <details
                      key={item.id}
                      style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}
                    >
                      <summary style={{ cursor: 'pointer' }}>
                        {item.label}{' '}
                        <Badge
                          tone={
                            item.status === 'accepted'
                              ? 'success'
                              : item.status === 'rejected'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {
                            (
                              {
                                pending: 'Pendente',
                                received: 'Recebido',
                                validating: 'Validando',
                                accepted: 'Aceito',
                                rejected: 'Rejeitado',
                              } as Record<string, string>
                            )[item.status]
                          }
                        </Badge>
                      </summary>
                      {permissions.has('documents.manage') && (
                        <div style={{ marginTop: 20 }}>
                          <ActionForm
                            action={updateRequestItem}
                            columns
                            hidden={{ id: item.id }}
                            submit="Atualizar item"
                            fields={[
                              {
                                name: 'status',
                                label: 'Situação',
                                type: 'select',
                                value: item.status,
                                options: [
                                  { value: 'pending', label: 'Pendente' },
                                  { value: 'received', label: 'Recebido' },
                                  { value: 'validating', label: 'Validando' },
                                  { value: 'accepted', label: 'Aceito' },
                                  { value: 'rejected', label: 'Rejeitado' },
                                ],
                              },
                              {
                                name: 'document_id',
                                label: 'Documento recebido',
                                type: 'select',
                                value: item.document_id ?? '',
                                options: [
                                  { value: '', label: 'Sem documento' },
                                  ...(docs.data ?? [])
                                    .filter((d) => d.client_id === r.client_id)
                                    .map((d) => ({ value: d.id, label: d.original_filename })),
                                ],
                                hint: 'Arquivos da página atual para este cliente.',
                              },
                            ]}
                          />
                        </div>
                      )}
                    </details>
                  ))}
                </Panel>
              ))
            ) : (
              <Panel>
                <EmptyState
                  title="Nenhuma solicitação criada"
                  description="Crie uma lista dos documentos que o cliente precisa enviar."
                />
              </Panel>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

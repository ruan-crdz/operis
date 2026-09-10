import { FilterForm } from '@/runtime/link';
import Link from '@/runtime/link';
import { Plus, Search, Building2 } from 'lucide-react';
import { Badge, EmptyState, PageHeader, Panel } from '@operis/ui';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { db, orgId, permissions } = await requirePermission('clients.read');
  const page = Math.max(1, Math.min(100000, Number(params.page) || 1)),
    q = (params.q ?? '').replace(/[%_\\]/g, '').slice(0, 100),
    archived = params.status === 'archived',
    sort = params.sort === 'desc' ? 'desc' : 'asc';
  let query = db
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .ilike('name', `%${q}%`)
    .order('name', { ascending: sort === 'asc' })
    .range((page - 1) * 20, page * 20 - 1);
  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data, count, error } = await query;
  check(error);
  const href = (p: number) =>
    `/app/clientes?${new URLSearchParams({ q, status: archived ? 'archived' : 'active', sort, page: String(p) })}`;
  return (
    <>
      <PageHeader
        eyebrow="Relacionamento e operação"
        title="Clientes"
        description={`${count ?? 0} empresas na sua carteira ${archived ? 'arquivada' : 'ativa'}.`}
        actions={
          permissions.has('clients.create') ? (
            <Link href="/app/clientes/novo" className="button button-primary">
              <Plus size={16} />
              Novo cliente
            </Link>
          ) : undefined
        }
      />
      <Panel>
        <FilterForm className="table-toolbar">
          <Search size={16} className="muted" />
          <input
            className="input"
            name="q"
            aria-label="Buscar clientes"
            placeholder="Buscar por razão social…"
            defaultValue={q}
          />
          <select
            name="status"
            aria-label="Status dos clientes"
            defaultValue={archived ? 'archived' : 'active'}
          >
            <option value="active">Clientes ativos</option>
            <option value="archived">Arquivados</option>
          </select>
          <select name="sort" aria-label="Ordenar clientes" defaultValue={sort}>
            <option value="asc">Nome A–Z</option>
            <option value="desc">Nome Z–A</option>
          </select>
          <button className="button button-secondary" type="submit">
            Aplicar filtros
          </button>
        </FilterForm>
        {data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Identificação</th>
                  <th>Regime tributário</th>
                  <th>Status</th>
                  <th>Contato</th>
                </tr>
              </thead>
              <tbody>
                {data.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link className="actions" href={`/app/clientes/${client.id}`}>
                        <span className="row-icon">
                          <Building2 size={16} />
                        </span>
                        <span>
                          {client.name}
                          <small>{client.trade_name || 'Nome fantasia não informado'}</small>
                        </span>
                      </Link>
                    </td>
                    <td className="mono">{client.tax_id || '—'}</td>
                    <td>
                      {
                        (
                          {
                            simples: 'Simples Nacional',
                            presumido: 'Lucro Presumido',
                            real: 'Lucro Real',
                            other: 'Outro',
                          } as Record<string, string>
                        )[client.tax_regime]
                      }
                    </td>
                    <td>
                      <Badge tone={client.archived_at ? 'neutral' : 'success'}>
                        {client.archived_at ? 'Arquivado' : 'Ativo'}
                      </Badge>
                    </td>
                    <td className="muted">{client.email || 'Não informado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={q ? 'Nenhum cliente encontrado' : 'Sua carteira começa aqui'}
            description={
              q
                ? 'Tente outro nome ou ajuste os filtros.'
                : 'Adicione o primeiro cliente para conectar tarefas, documentos e competências.'
            }
            action={
              permissions.has('clients.create') ? (
                <Link href="/app/clientes/novo" className="button button-secondary">
                  Adicionar cliente
                </Link>
              ) : undefined
            }
          />
        )}
        <div className="pagination">
          <span>
            Página {page} · {count ?? 0} clientes
          </span>
          <div className="actions">
            {page > 1 && (
              <Link href={href(page - 1)} className="button button-secondary button-sm">
                Anterior
              </Link>
            )}
            {page * 20 < (count ?? 0) && (
              <Link href={href(page + 1)} className="button button-secondary button-sm">
                Próxima
              </Link>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}

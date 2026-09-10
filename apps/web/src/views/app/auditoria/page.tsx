import Link from '@/runtime/link';
import { PageHeader, Panel, EmptyState } from '@operis/ui';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { formatDate } from '@operis/domain';
export default async function Audit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { db, orgId } = await requirePermission('audit.read');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { data, error, count } = await db
    .from('audit_logs')
    .select('*,profiles(full_name)', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range((page - 1) * 30, page * 30 - 1);
  check(error);
  return (
    <>
      <PageHeader
        eyebrow="Rastreabilidade"
        title="Histórico e auditoria"
        description="Registros preservados das alterações feitas no escritório."
      />
      <Panel>
        {data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Ação</th>
                  <th>Responsável</th>
                  <th>Registro</th>
                  <th>Correlação</th>
                </tr>
              </thead>
              <tbody>
                {data.map((log) => (
                  <tr key={log.id}>
                    <td>
                      {formatDate(log.created_at)}
                      <small>
                        {new Intl.DateTimeFormat('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(log.created_at))}
                      </small>
                    </td>
                    <td>{log.action}</td>
                    <td>{log.profiles?.full_name || 'Sistema'}</td>
                    <td className="mono">{log.entity_id?.slice(0, 8)}</td>
                    <td className="mono">{log.correlation_id.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhuma alteração registrada"
            description="As ações importantes geram registros de auditoria automaticamente."
          />
        )}
        <div className="pagination">
          <span>
            {count ?? 0} eventos · Página {page}
          </span>
          <div className="actions">
            {page > 1 && (
              <Link href={`?page=${page - 1}`} className="button button-secondary button-sm">
                Anterior
              </Link>
            )}
            {page * 30 < (count ?? 0) && (
              <Link href={`?page=${page + 1}`} className="button button-secondary button-sm">
                Próxima
              </Link>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}

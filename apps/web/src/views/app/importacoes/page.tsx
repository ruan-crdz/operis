import Link from '@/runtime/link';
import { Plus, FileSpreadsheet } from 'lucide-react';
import { PageHeader, Panel, Badge, EmptyState } from '@operis/ui';
import { formatDate } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
export default async function Imports({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { db, orgId, permissions } = await requirePermission('imports.read');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { data, error, count } = await db
    .from('imports')
    .select('id,original_filename,competence,status,row_count,created_at,clients(name)', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  check(error);
  const labels: Record<string, string> = {
    mapping: 'Em mapeamento',
    awaiting_approval: 'Aguardando aprovação',
    approved: 'Na fila',
    processing: 'Processando',
    completed: 'Concluída',
    failed: 'Falhou',
    cancelled: 'Cancelada',
  };
  return (
    <>
      <PageHeader
        eyebrow="Entrada de dados com controle"
        title="Importações"
        description="Do arquivo à operação, com validação e revisão em cada etapa."
        actions={
          permissions.has('imports.create') ? (
            <Link href="/app/importacoes/nova" className="button button-primary">
              <Plus size={16} />
              Nova importação
            </Link>
          ) : undefined
        }
      />
      <Panel>
        {data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Cliente</th>
                  <th>Competência</th>
                  <th>Situação</th>
                  <th>Registros</th>
                  <th>Criada em</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="actions" href={`/app/importacoes/${item.id}`}>
                        <FileSpreadsheet size={16} />
                        {item.original_filename}
                      </Link>
                    </td>
                    <td>{item.clients?.name}</td>
                    <td className="mono">{item.competence}</td>
                    <td>
                      <Badge
                        tone={
                          item.status === 'completed'
                            ? 'success'
                            : item.status === 'failed'
                              ? 'danger'
                              : item.status === 'awaiting_approval'
                                ? 'ai'
                                : 'neutral'
                        }
                      >
                        {labels[item.status]}
                      </Badge>
                    </td>
                    <td>{item.row_count}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Sua primeira importação começa aqui"
            description="Envie uma planilha de colaboradores, mapeie as colunas e revise os dados antes de importar."
            action={
              permissions.has('imports.create') ? (
                <Link href="/app/importacoes/nova" className="button button-secondary">
                  Importar planilha
                </Link>
              ) : undefined
            }
          />
        )}
        <div className="pagination">
          <span>
            {count ?? 0} importações · Página {page}
          </span>
          <div className="actions">
            {page > 1 && (
              <Link href={`?page=${page - 1}`} className="button button-secondary button-sm">
                Anterior
              </Link>
            )}
            {page * 20 < (count ?? 0) && (
              <Link href={`?page=${page + 1}`} className="button button-secondary button-sm">
                Próxima
              </Link>
            )}
          </div>
        </div>
      </Panel>
      <p className="muted" style={{ fontSize: 12, marginTop: 20 }}>
        Primeiro módulo: colaboradores do Departamento Pessoal. Valores importados representam o arquivo de
        origem, sem cálculos legais ou processamento de folha.
      </p>
    </>
  );
}

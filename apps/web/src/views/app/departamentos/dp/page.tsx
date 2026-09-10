import Link from '@/runtime/link';
import { FilterForm } from '@/runtime/link';
import { ActionButton, ActionForm } from '@/features/forms/action-form';
import { startAllDpProcesses, startDpProcess } from '@/client/actions/dp';
import { getDpDashboard, getDpPortfolio } from '@/client/dp';
import { getOptions } from '@/client/queries';
import { requirePermission } from '@/client/auth/context';
import { HealthBadge, ProcessBadge } from '@/features/dp/status';
import { Button, EmptyState, PageHeader, Panel, Stat } from '@operis/ui';
import { AlertTriangle, ArrowUpRight, CalendarRange, Plus, Users } from 'lucide-react';

const currentCompetence = () => new Date().toISOString().slice(0, 7);
const date = (value: string | null) =>
  value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : 'Sem prazo';

export default async function DpDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const competence = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.competence ?? '')
    ? params.competence!
    : currentCompetence();
  const { permissions } = await requirePermission('processes.read');
  const [dashboard, portfolio, options] = await Promise.all([
    getDpDashboard(competence),
    getDpPortfolio({ ...params, competence }),
    getOptions(),
  ]);
  const memberOptions = [{ value: '', label: 'Sem responsável definido' }, ...options.members];
  return (
    <>
      <PageHeader
        eyebrow="Departamento Pessoal"
        title="Operação mensal de DP"
        description="Carteira por competência, pendências e execução rastreável do fechamento."
        actions={
          <div className="actions">
            <Link className="button button-secondary" href="/app/departamentos/dp/pendencias">
              <AlertTriangle size={16} /> Pendências
            </Link>
          </div>
        }
      />
      <FilterForm className="table-toolbar" style={{ padding: '0 0 20px', border: 0 }}>
        <input
          className="input"
          type="month"
          name="competence"
          aria-label="Competência"
          defaultValue={competence}
        />
        <button className="button button-secondary" type="submit">
          Abrir competência
        </button>
      </FilterForm>
      <div className="stats">
        <Stat label="Clientes ativos" value={dashboard.clients} caption="Carteira atual" />
        <Stat
          label="Processos abertos"
          value={dashboard.opened}
          caption={`Competência ${competence}`}
          tone="ai"
        />
        <Stat
          label="Concluídos"
          value={dashboard.completed}
          caption="Com aprovação e evidências"
          tone="success"
        />
        <Stat
          label="Atenção"
          value={dashboard.attention + dashboard.overdue}
          caption={`${dashboard.review} aguardando revisão`}
          tone="warning"
        />
      </div>
      {permissions.has('processes.manage') && (
        <div className="dashboard-grid" style={{ marginBottom: 24 }}>
          <Panel className="panel-pad">
            <h2 className="actions">
              <Plus size={18} /> Abrir processo de um cliente
            </h2>
            <div style={{ marginTop: 18 }}>
              <ActionForm
                action={startDpProcess}
                submit="Abrir competência"
                columns
                fields={[
                  {
                    name: 'client_id',
                    label: 'Cliente',
                    type: 'select',
                    required: true,
                    options: options.clients,
                  },
                  {
                    name: 'competence',
                    label: 'Competência',
                    type: 'month',
                    required: true,
                    value: competence,
                  },
                  { name: 'owner_id', label: 'Responsável', type: 'select', options: memberOptions },
                  {
                    name: 'reviewer_id',
                    label: 'Revisor preferencial',
                    type: 'select',
                    options: memberOptions,
                  },
                  { name: 'due_at', label: 'Prazo final', type: 'date' },
                ]}
              />
            </div>
          </Panel>
          <Panel className="panel-pad">
            <h2 className="actions">
              <Users size={18} /> Abertura em massa
            </h2>
            <p className="muted" style={{ margin: '12px 0 20px' }}>
              Cria os processos ausentes para até 500 clientes ativos. Repetir a ação não duplica registros.
            </p>
            <ActionButton
              action={startAllDpProcesses}
              fields={{ competence }}
              confirm={`Abrir ${competence} para todos os clientes ativos?`}
              variant="primary"
            >
              Abrir para toda a carteira
            </ActionButton>
          </Panel>
        </div>
      )}
      <Panel>
        <div className="panel-heading">
          <h2 className="actions">
            <CalendarRange size={18} /> Carteira da competência
          </h2>
          <span className="muted">{portfolio.total} processos</span>
        </div>
        <FilterForm className="table-toolbar">
          <select name="status" defaultValue={params.status ?? ''} aria-label="Status">
            <option value="">Todos os status</option>
            {[
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
            ].map((s) => (
              <option value={s} key={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <select name="owner" defaultValue={params.owner ?? ''} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            {options.members.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input type="hidden" name="competence" value={competence} />
          <button className="button button-secondary">Filtrar</button>
        </FilterForm>
        {portfolio.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Saúde</th>
                  <th>Progresso</th>
                  <th>Coleta</th>
                  <th>Movimentações</th>
                  <th>Prazo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {portfolio.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.clients?.name ?? 'Cliente'}</strong>
                      <small className="muted" style={{ display: 'block' }}>
                        {row.competence}
                      </small>
                    </td>
                    <td>
                      <ProcessBadge status={row.status} />
                    </td>
                    <td>
                      <HealthBadge health={row.health} />
                    </td>
                    <td>
                      <div className="progress-track" aria-label={`${row.progress.percentage}% concluído`}>
                        <span style={{ width: `${row.progress.percentage}%` }} />
                      </div>
                      <small>
                        {row.progress.completed}/{row.progress.applicable} etapas
                      </small>
                    </td>
                    <td>{row.pendingCollection} pendentes</td>
                    <td>{row.occurrences}</td>
                    <td>{date(row.due_at)}</td>
                    <td>
                      <Link
                        href={`/app/departamentos/dp/competencia?client=${row.client_id}&competence=${row.competence}`}
                        aria-label={`Abrir ${row.clients?.name}`}
                      >
                        <ArrowUpRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhum processo nesta competência"
            description="Abra um cliente ou toda a carteira para iniciar o fechamento mensal."
          />
        )}
      </Panel>
      {portfolio.total > portfolio.size && (
        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          {portfolio.page > 1 && (
            <Link
              className="button button-secondary"
              href={`/app/departamentos/dp?competence=${competence}&page=${portfolio.page - 1}`}
            >
              Anterior
            </Link>
          )}
          <Button variant="secondary" disabled={portfolio.page * portfolio.size >= portfolio.total}>
            Página {portfolio.page}
          </Button>
          {portfolio.page * portfolio.size < portfolio.total && (
            <Link
              className="button button-secondary"
              href={`/app/departamentos/dp?competence=${competence}&page=${portfolio.page + 1}`}
            >
              Próxima
            </Link>
          )}
        </div>
      )}
    </>
  );
}

import { FilterForm } from '@/runtime/link';
import Link from '@/runtime/link';
import { PageHeader, Panel, Badge, EmptyState } from '@operis/ui';
import { today, formatDate, statusLabels } from '@operis/domain';
import { listTasks } from '@/client/tasks';
export default async function Queue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tasks = await listTasks(params, true),
    date = today();
  const groups = [
    {
      label: 'Atrasadas',
      items: tasks.filter((t) => t.due_date && t.due_date < date),
      tone: 'danger' as const,
    },
    { label: 'Hoje', items: tasks.filter((t) => t.due_date === date), tone: 'warning' as const },
    {
      label: 'Próximos dias',
      items: tasks.filter((t) => t.due_date && t.due_date > date),
      tone: 'neutral' as const,
    },
    { label: 'Sem prazo', items: tasks.filter((t) => !t.due_date), tone: 'neutral' as const },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Seu trabalho"
        title="Minha fila"
        description="Tarefas atribuídas a você, organizadas por urgência operacional."
      />
      <FilterForm className="table-toolbar" style={{ padding: '0 0 24px', border: 0 }}>
        <input
          className="input"
          name="q"
          aria-label="Buscar na fila"
          placeholder="Buscar tarefa…"
          defaultValue={params.q}
        />
        <input
          className="input"
          type="month"
          name="competence"
          aria-label="Competência"
          defaultValue={params.competence}
        />
        <button className="button button-secondary">Filtrar</button>
      </FilterForm>
      <div className="stack">
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <Panel key={g.label}>
              <div className="panel-heading">
                <h2>{g.label}</h2>
                <Badge tone={g.tone}>{g.items.length}</Badge>
              </div>
              {g.items.map((task) => (
                <Link href={`/app/tarefas/${task.id}`} className="list-row" key={task.id}>
                  <div>
                    {task.title}
                    <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {task.clients?.name} · {task.competence}
                    </p>
                  </div>
                  <div className="actions">
                    <Badge>{statusLabels[task.status as keyof typeof statusLabels]}</Badge>
                    <small className="muted">{formatDate(task.due_date)}</small>
                  </div>
                </Link>
              ))}
            </Panel>
          ))}
        {!tasks.length && (
          <Panel>
            <EmptyState
              title="Sua fila está livre"
              description="Quando uma tarefa for atribuída a você, ela aparecerá aqui."
              action={
                <Link className="button button-secondary" href="/app/tarefas">
                  Ver quadro da equipe
                </Link>
              }
            />
          </Panel>
        )}
      </div>
    </>
  );
}

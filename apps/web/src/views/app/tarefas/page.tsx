import { FilterForm } from '@/runtime/link';
import Link from '@/runtime/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@operis/ui';
import { getContext } from '@/client/auth/context';
import { listTasks } from '@/client/tasks';
import { getOptions } from '@/client/queries';
import { Kanban } from '@/features/tasks/kanban';
export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { orgId, permissions } = await getContext();
  const [tasks, options] = await Promise.all([listTasks(params), getOptions()]);
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Tarefas"
        description="Cada etapa visível. Cada próximo passo no lugar."
        actions={
          permissions.has('tasks.create') ? (
            <Link className="button button-primary" href="/app/tarefas/nova">
              <Plus size={16} />
              Nova tarefa
            </Link>
          ) : undefined
        }
      />
      <FilterForm className="table-toolbar" style={{ padding: '0 0 24px', border: 0 }}>
        <input
          name="q"
          aria-label="Buscar tarefas"
          className="input"
          placeholder="Buscar tarefa…"
          defaultValue={params.q}
        />
        <select name="client" aria-label="Filtrar por cliente" defaultValue={params.client ?? ''}>
          <option value="">Todos os clientes</option>
          {options.clients.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          name="department"
          aria-label="Filtrar por departamento"
          defaultValue={params.department ?? ''}
        >
          <option value="">Todos os departamentos</option>
          {options.departments.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="month"
          name="competence"
          aria-label="Filtrar por competência"
          className="input"
          style={{ maxWidth: 170 }}
          defaultValue={params.competence}
        />
        <button type="submit" className="button button-secondary">
          Filtrar
        </button>
        <Link href="/app/tarefas" className="button button-ghost">
          Limpar
        </Link>
      </FilterForm>
      {tasks.length === 200 && (
        <p className="alert alert-warning" style={{ marginBottom: 16 }}>
          Exibindo as primeiras 200 tarefas. Use filtros para restringir o quadro.
        </p>
      )}
      <Kanban initial={tasks} orgId={orgId} canMove={permissions.has('tasks.update')} query={query} />
      <p className="muted" style={{ fontSize: 11 }}>
        Arraste os cartões ou use “Mover para” em cada tarefa. As alterações são salvas no escritório.
      </p>
    </>
  );
}

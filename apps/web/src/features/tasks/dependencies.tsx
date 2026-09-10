import Link from '@/runtime/link';
import { Badge, Panel } from '@operis/ui';
import { getContext } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { ActionForm, ActionButton } from '@/features/forms/action-form';
import { setDependency } from '@/client/actions/tasks';
export async function TaskDependencies({ taskId }: { taskId: string }) {
  const { db, orgId, permissions } = await getContext();
  const [dependencies, options] = await Promise.all([
    db
      .from('task_dependencies')
      .select('depends_on_id,tasks!task_dependencies_organization_id_depends_on_id_fkey(id,title,status)')
      .eq('organization_id', orgId)
      .eq('task_id', taskId)
      .limit(50),
    db
      .from('tasks')
      .select('id,title')
      .eq('organization_id', orgId)
      .neq('id', taskId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  check(dependencies.error);
  check(options.error);
  return (
    <Panel className="panel-pad">
      <h2 style={{ marginBottom: 16 }}>Depende de</h2>
      {dependencies.data?.length ? (
        dependencies.data.map((d) => (
          <div className="list-row" style={{ padding: '12px 0' }} key={d.depends_on_id}>
            <div>
              <Link href={`/app/tarefas/${d.depends_on_id}`}>{d.tasks?.title}</Link>
              <div style={{ marginTop: 8 }}>
                <Badge tone={d.tasks?.status === 'completed' ? 'success' : 'warning'}>
                  {d.tasks?.status === 'completed' ? 'Concluída' : 'Bloqueia o início e a conclusão'}
                </Badge>
              </div>
            </div>
            {permissions.has('tasks.update') && (
              <ActionButton
                action={setDependency}
                fields={{ task_id: taskId, dependency_id: d.depends_on_id, remove: 'true' }}
              >
                Remover
              </ActionButton>
            )}
          </div>
        ))
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          Esta tarefa não depende de outra etapa.
        </p>
      )}
      {permissions.has('tasks.update') && (
        <div style={{ marginTop: 24 }}>
          <ActionForm
            action={setDependency}
            hidden={{ task_id: taskId }}
            submit="Adicionar dependência"
            fields={[
              {
                name: 'dependency_id',
                label: 'Tarefa anterior',
                type: 'select',
                required: true,
                options: [
                  { value: '', label: 'Selecione uma tarefa' },
                  ...(options.data ?? []).map((t) => ({ value: t.id, label: t.title })),
                ],
              },
            ]}
          />
        </div>
      )}
    </Panel>
  );
}

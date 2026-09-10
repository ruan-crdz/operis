import { PageHeader, Panel } from '@operis/ui';
import { requirePermission } from '@/client/auth/context';
import { TaskForm } from '@/features/tasks/task-form';
export default async function NewTask({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requirePermission('tasks.create');
  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Nova tarefa"
        description="Defina o contexto, o responsável e o próximo prazo."
      />
      <Panel className="panel-pad" style={{ maxWidth: 900 }}>
        {await TaskForm({ clientId: (await searchParams).client })}
      </Panel>
    </>
  );
}

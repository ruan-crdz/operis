import Link from '@/runtime/link';
import { PageHeader, Panel, EmptyState } from '@operis/ui';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { ActionForm } from '@/features/forms/action-form';
import { saveDepartment } from '@/client/actions/settings';
export default async function Departments() {
  const { db, orgId, permissions } = await requirePermission('members.read');
  const { data, error } = await db
    .from('departments')
    .select('*')
    .eq('organization_id', orgId)
    .order('name')
    .limit(100);
  check(error);
  return (
    <>
      <PageHeader
        eyebrow="Estrutura do escritório"
        title="Departamentos"
        description="Organize as frentes de trabalho da equipe."
      />
      <div className="settings-grid">
        {data?.map((d) => (
          <Panel key={d.id} className="panel-pad">
            <h2>{d.name}</h2>
            <p className="muted" style={{ margin: '12px 0 20px' }}>
              Acompanhe tarefas, responsáveis e prazos deste departamento.
            </p>
            <Link className="button button-secondary" href={`/app/tarefas?department=${d.id}`}>
              Abrir operação ↗
            </Link>
            {d.name === 'Departamento Pessoal' && (
              <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
                O módulo inicial organiza a operação e importa colaboradores. Cálculos de folha ainda não
                fazem parte desta versão.
              </p>
            )}
          </Panel>
        ))}
      </div>
      {!data?.length && (
        <EmptyState
          title="Nenhum departamento"
          description="Crie os departamentos utilizados pelo escritório."
        />
      )}
      {permissions.has('members.manage') && (
        <Panel className="panel-pad" style={{ marginTop: 24, maxWidth: 600 }}>
          <h2 style={{ marginBottom: 20 }}>Novo departamento</h2>
          <ActionForm
            action={saveDepartment}
            submit="Criar departamento"
            fields={[{ name: 'name', label: 'Nome do departamento', required: true }]}
          />
        </Panel>
      )}
    </>
  );
}

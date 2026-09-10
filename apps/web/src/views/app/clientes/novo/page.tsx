import { PageHeader, Panel } from '@operis/ui';
import { ClientForm } from '@/features/clients/client-form';
import { requirePermission } from '@/client/auth/context';
export default async function NewClient() {
  await requirePermission('clients.create');
  return (
    <>
      <PageHeader
        eyebrow="Carteira de clientes"
        title="Novo cliente"
        description="Cadastre a empresa para organizar sua operação."
      />
      <Panel className="panel-pad" style={{ maxWidth: 800 }}>
        {await ClientForm({})}
      </Panel>
    </>
  );
}

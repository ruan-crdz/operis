import { PageHeader, Panel } from '@operis/ui';
import { requirePermission } from '@/client/auth/context';
import { ActionForm } from '@/features/forms/action-form';
import { saveOrganization, saveAISetting } from '@/client/actions/settings';
import { switchOrganization } from '@/client/actions/auth';
import { check } from '@/client/actions/helpers';
export default async function Organization() {
  const { db, orgId, organization, permissions } = await requirePermission('organization.manage');
  const { data, error } = await db
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .single();
  check(error);
  const orgs = await db.from('organizations').select('id,name').order('name').limit(100);
  check(orgs.error);
  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Meu escritório"
        description="Identidade, acesso ao espaço de trabalho e inteligência."
      />
      <div className="settings-grid">
        <Panel className="panel-pad">
          <h2 style={{ marginBottom: 24 }}>Identidade do escritório</h2>
          <ActionForm
            action={saveOrganization}
            fields={[{ name: 'name', label: 'Nome do escritório', required: true, value: organization.name }]}
          />
        </Panel>
        {permissions.has('settings.manage') && (
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 24 }}>Operis Intelligence</h2>
            <ActionForm
              action={saveAISetting}
              fields={[
                {
                  name: 'ai_enabled',
                  label: 'Sugestões de mapeamento',
                  type: 'select',
                  value: String(data?.ai_enabled ?? true),
                  options: [
                    { value: 'true', label: 'Permitir sugestões de IA' },
                    { value: 'false', label: 'Usar somente mapeamento manual' },
                  ],
                  hint: 'A IA recebe apenas cabeçalhos e tipos inferidos. Aprovação humana sempre obrigatória.',
                },
              ]}
            />
          </Panel>
        )}
        <Panel className="panel-pad">
          <h2 style={{ marginBottom: 24 }}>Alternar escritório</h2>
          <ActionForm
            action={switchOrganization}
            submit="Acessar escritório"
            fields={[
              {
                name: 'organization_id',
                label: 'Escritório ativo',
                type: 'select',
                value: orgId,
                options: orgs.data?.map((o) => ({ value: o.id, label: o.name })) ?? [],
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

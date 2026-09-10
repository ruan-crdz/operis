import { Avatar, PageHeader, Panel } from '@operis/ui';
import { getContext } from '@/client/auth/context';
import { ActionForm } from '@/features/forms/action-form';
import { saveProfile } from '@/client/actions/settings';
import { uploadAvatar } from '@/client/actions/documents';
export default async function Profile() {
  const { profile, user } = await getContext();
  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Meu perfil"
        description="Como você aparece para a equipe do escritório."
      />
      <div className="detail-grid">
        <Panel className="panel-pad">
          <ActionForm
            action={saveProfile}
            columns
            fields={[
              {
                name: 'full_name',
                label: 'Nome completo',
                required: true,
                value: profile.full_name,
                full: true,
              },
              { name: 'phone', label: 'Telefone', value: profile.phone },
              { name: 'job_title', label: 'Cargo', value: profile.job_title },
            ]}
          />
          <p className="muted" style={{ marginTop: 24 }}>
            Email da conta: {user.email}
          </p>
        </Panel>
        <Panel className="panel-pad">
          <div className="actions" style={{ marginBottom: 24 }}>
            <Avatar name={profile.full_name} />
            <h2>Foto de perfil</h2>
          </div>
          <ActionForm
            action={uploadAvatar}
            submit="Salvar foto"
            fields={[
              {
                name: 'file',
                label: 'Foto',
                type: 'file',
                required: true,
                accept: '.png,.jpg,.jpeg',
                hint: 'PNG ou JPEG. Até 2 MB.',
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

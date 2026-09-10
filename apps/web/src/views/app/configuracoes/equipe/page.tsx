import { Avatar, Badge, PageHeader, Panel } from '@operis/ui';
import { requirePermission } from '@/client/auth/context';
import { getOptions } from '@/client/queries';
import { check } from '@/client/actions/helpers';
import { ActionForm } from '@/features/forms/action-form';
import { saveMember } from '@/client/actions/settings';
export default async function Team() {
  const { db, orgId, permissions } = await requirePermission('members.read');
  const options = await getOptions();
  const { data, error } = await db
    .from('organization_members')
    .select(
      '*,profiles!organization_members_user_id_fkey(full_name,job_title),departments(name),member_roles(roles(name))',
    )
    .eq('organization_id', orgId)
    .order('created_at')
    .limit(100);
  check(error);
  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Equipe e acessos"
        description="Cada colaborador com o acesso necessário para trabalhar."
      />
      <div className="stack">
        <Panel>
          <div className="panel-heading">
            <h2>Colaboradores do escritório</h2>
            <Badge>{data?.length ?? 0} nesta página</Badge>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Departamento</th>
                  <th>Papel de acesso</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="actions">
                        <Avatar name={m.profiles?.full_name ?? ''} />
                        <span>
                          {m.profiles?.full_name || 'Sem nome'}
                          <small>{m.profiles?.job_title || 'Cargo não informado'}</small>
                        </span>
                      </span>
                    </td>
                    <td>{m.departments?.name ?? 'Não definido'}</td>
                    <td>
                      {m.member_roles.map((r) => (
                        <Badge key={r.roles?.name}>{r.roles?.name}</Badge>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        {permissions.has('members.manage') && (
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 8 }}>Adicionar ou atualizar acesso</h2>
            <p className="muted" style={{ marginBottom: 24 }}>
              O colaborador precisa criar e confirmar sua conta antes. Ao informar o email, você define seu
              papel neste escritório. Nenhum convite é enviado automaticamente.
            </p>
            <ActionForm
              action={saveMember}
              columns
              submit="Salvar acesso"
              fields={[
                {
                  name: 'email',
                  label: 'Email da conta do colaborador',
                  type: 'email',
                  required: true,
                  full: true,
                },
                { name: 'role_id', label: 'Papel de acesso', type: 'select', options: options.roles },
                {
                  name: 'department_id',
                  label: 'Departamento',
                  type: 'select',
                  options: [{ value: '', label: 'Sem departamento' }, ...options.departments],
                },
              ]}
            />
          </Panel>
        )}
        <Panel className="panel-pad">
          <h2 style={{ marginBottom: 16 }}>Papéis iniciais</h2>
          <p className="muted">
            Administrador: gerencia o escritório e aprova importações. Operador: gerencia a operação, sem
            aprovar importações ou alterar acessos. Leitor: consulta registros, sem realizar alterações. As
            permissões são verificadas no banco.
          </p>
        </Panel>
      </div>
    </>
  );
}

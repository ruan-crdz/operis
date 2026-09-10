import { getUser } from '@/client/auth/context';
import { AuthShell } from '@/features/auth/auth-shell';
import { ActionForm } from '@/features/forms/action-form';
import { DepartmentPicker } from '@/features/auth/department-picker';
import { onboarding } from '@/client/actions/auth';
export default async function Onboarding() {
  await getUser();
  return (
    <AuthShell>
      <p className="eyebrow">Seu escritório começa aqui</p>
      <h2>Vamos organizar sua operação</h2>
      <p className="muted">Crie o escritório e escolha os departamentos utilizados.</p>
      <ActionForm
        action={onboarding}
        submit="Criar meu escritório"
        fields={[
          { name: 'org_name', label: 'Nome do escritório', required: true },
          { name: 'person_name', label: 'Seu nome', required: true },
        ]}
      >
        <DepartmentPicker />
      </ActionForm>
    </AuthShell>
  );
}

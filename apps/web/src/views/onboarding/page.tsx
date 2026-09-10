import { getUser } from '@/client/auth/context';
import { AuthShell } from '@/features/auth/auth-shell';
import { ActionForm } from '@/features/forms/action-form';
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
          {
            name: 'departments',
            label: 'Departamentos',
            type: 'textarea',
            value:
              'Departamento Pessoal, Fiscal, Contábil, Societário, BPO Financeiro, Compliance, Administração',
            hint: 'Separe os nomes por vírgula.',
          },
        ]}
      />
    </AuthShell>
  );
}

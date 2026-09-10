import Link from '@/runtime/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { ActionForm } from '@/features/forms/action-form';
import { updatePassword } from '@/client/actions/auth';
import { getUser } from '@/client/auth/context';
export default async function UpdatePassword() {
  await getUser();
  return (
    <AuthShell>
      <h2>Defina sua nova senha</h2>
      <p className="muted">Use uma senha exclusiva para proteger seu acesso.</p>
      <ActionForm
        action={updatePassword}
        submit="Atualizar senha"
        fields={[
          {
            name: 'password',
            label: 'Nova senha',
            type: 'password',
            required: true,
            hint: 'Pelo menos 10 caracteres.',
          },
        ]}
      />
      <div className="auth-links">
        <Link href="/app">Acessar Operis</Link>
      </div>
    </AuthShell>
  );
}

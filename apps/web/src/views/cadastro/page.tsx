import Link from '@/runtime/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { ActionForm } from '@/features/forms/action-form';
import { signup } from '@/client/actions/auth';
import { isConfigured } from '@/client/db/client';
export default function Signup() {
  return (
    <AuthShell>
      <p className="eyebrow">Comece pelo essencial</p>
      <h2>Crie sua conta</h2>
      <p className="muted">Depois, organize seu escritório em uma única etapa.</p>
      <ActionForm
        action={signup}
        submit="Criar conta"
        disabled={!isConfigured()}
        fields={[
          { name: 'email', label: 'Email de trabalho', type: 'email', required: true },
          {
            name: 'password',
            label: 'Senha',
            type: 'password',
            required: true,
            hint: 'Pelo menos 10 caracteres.',
          },
        ]}
      />
      <div className="auth-links">
        <Link href="/login">Já tenho uma conta</Link>
      </div>
    </AuthShell>
  );
}

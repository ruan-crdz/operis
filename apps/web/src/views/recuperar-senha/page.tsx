import Link from '@/runtime/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { ActionForm } from '@/features/forms/action-form';
import { recoverPassword } from '@/client/actions/auth';
import { isConfigured } from '@/client/db/client';
export default function Recover() {
  return (
    <AuthShell>
      <h2>Recupere seu acesso</h2>
      <p className="muted">Enviaremos um link para definir uma nova senha.</p>
      <ActionForm
        action={recoverPassword}
        disabled={!isConfigured()}
        submit="Enviar link de recuperação"
        fields={[{ name: 'email', label: 'Email', type: 'email', required: true }]}
      />
      <div className="auth-links">
        <Link href="/login">Voltar para entrar</Link>
      </div>
    </AuthShell>
  );
}

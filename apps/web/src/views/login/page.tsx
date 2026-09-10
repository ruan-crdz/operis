import Link from '@/runtime/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { ActionForm } from '@/features/forms/action-form';
import { login } from '@/client/actions/auth';
import { isConfigured } from '@/client/db/client';
import { Alert } from '@operis/ui';
export default function Login() {
  const configured = isConfigured();
  return (
    <AuthShell>
      <p className="eyebrow">Bem-vindo ao Operis</p>
      <h2>Entre no seu escritório</h2>
      <p className="muted">Continue de onde sua operação parou.</p>
      {!configured && (
        <Alert>
          Conecte o Supabase para entrar.{' '}
          <Link href="/configuracao">
            <u>Ver configuração</u>
          </Link>
        </Alert>
      )}
      <ActionForm
        action={login}
        submit="Entrar no Operis"
        disabled={!configured}
        fields={[
          {
            name: 'email',
            label: 'Email de trabalho',
            type: 'email',
            required: true,
            placeholder: 'voce@escritorio.com.br',
          },
          { name: 'password', label: 'Senha', type: 'password', required: true },
        ]}
      />
      <div className="auth-links">
        <Link href="/recuperar-senha">Esqueci minha senha</Link>
        <Link href="/cadastro">Criar uma conta</Link>
      </div>
    </AuthShell>
  );
}

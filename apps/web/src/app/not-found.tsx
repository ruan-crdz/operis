import Link from '@/runtime/link';
import { EmptyState } from '@operis/ui';
export default function NotFound() {
  return (
    <main id="main">
      <EmptyState
        title="Página não encontrada"
        description="O endereço não existe ou você não tem acesso a este registro."
        action={
          <Link className="button button-primary" href="/app">
            Voltar ao início
          </Link>
        }
      />
    </main>
  );
}

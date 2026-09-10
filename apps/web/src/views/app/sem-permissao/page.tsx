import Link from '@/runtime/link';
import { EmptyState, Panel } from '@operis/ui';
export default function PermissionDenied() {
  return (
    <Panel>
      <EmptyState
        title="Você não tem acesso a esta ação"
        description="Seu papel neste escritório não inclui esta permissão. Solicite a revisão do acesso ao administrador."
        action={
          <Link href="/app" className="button button-primary">
            Voltar à operação
          </Link>
        }
      />
    </Panel>
  );
}

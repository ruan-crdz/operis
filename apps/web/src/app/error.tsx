'use client';
import { Button, EmptyState } from '@operis/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main">
      <EmptyState
        title="Não foi possível carregar esta página"
        description="Verifique sua conexão e tente novamente. Se persistir, confira a configuração do Supabase e as migrations."
        action={<Button onClick={reset}>Tentar novamente</Button>}
      />
    </main>
  );
}

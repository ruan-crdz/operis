'use client';
import { Skeleton } from '@operis/ui';
import { routes } from './routes';

function Header({ wide = false }: { wide?: boolean }) {
  return (
    <div>
      <Skeleton style={{ width: 120, height: 12 }} />
      <Skeleton style={{ width: wide ? 320 : 220, height: 26, marginTop: 10 }} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <main id="main" className="panel-pad stack" aria-hidden="true">
      <Header wide />
      <div className="stats">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 88 }} />
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="stack">
          <Skeleton style={{ height: 40 }} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 48 }} />
          ))}
        </div>
        <div className="stack">
          <Skeleton style={{ height: 40 }} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 48 }} />
          ))}
        </div>
      </div>
    </main>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <main id="main" className="panel-pad stack" aria-hidden="true">
      <Header />
      <Skeleton style={{ height: 48 }} />
      <div className="stack" style={{ gap: 8 }}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} style={{ height: 48 }} />
        ))}
      </div>
    </main>
  );
}

export function TasksBoardSkeleton() {
  return (
    <main id="main" className="panel-pad stack" aria-hidden="true">
      <Header />
      <Skeleton style={{ height: 48 }} />
      <div style={{ display: 'flex', gap: 16 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="stack" style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ height: 18, width: 100 }} />
            {Array.from({ length: 3 }, (_, j) => (
              <Skeleton key={j} style={{ height: 72 }} />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

export function CardGridSkeleton() {
  return (
    <main id="main" className="panel-pad stack" aria-hidden="true">
      <Header />
      <div className="settings-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} style={{ height: 96 }} />
        ))}
      </div>
    </main>
  );
}

export function DetailSkeleton() {
  return (
    <main id="main" className="panel-pad stack" aria-hidden="true">
      <Header />
      <Skeleton style={{ height: 140 }} />
      <Skeleton style={{ height: 28, width: 160 }} />
      <div className="stack" style={{ gap: 8 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} style={{ height: 48 }} />
        ))}
      </div>
    </main>
  );
}

export function WizardSkeleton() {
  return (
    <main id="main" className="panel-pad stack" aria-hidden="true">
      <Header />
      <div style={{ display: 'flex', gap: 8 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} style={{ height: 8, flex: 1 }} />
        ))}
      </div>
      <Skeleton style={{ height: 280 }} />
    </main>
  );
}

function Field() {
  return (
    <div>
      <Skeleton style={{ width: 100, height: 10, marginBottom: 6 }} />
      <Skeleton style={{ height: 40 }} />
    </div>
  );
}

export function FormSkeleton() {
  return (
    <main id="main" className="panel-pad stack" style={{ maxWidth: 480 }} aria-hidden="true">
      <Header />
      <Field />
      <Field />
      <Skeleton style={{ height: 40, width: 140 }} />
    </main>
  );
}

export function AuthSkeleton() {
  return (
    <div className="auth-shell" aria-hidden="true">
      <aside className="auth-aside">
        <Skeleton style={{ width: 120, height: 24 }} />
        <Skeleton style={{ height: 80, marginTop: 24 }} />
      </aside>
      <main className="auth-main">
        <div className="auth-form stack">
          <Skeleton style={{ width: 140, height: 12 }} />
          <Skeleton style={{ width: 220, height: 26 }} />
          <Field />
          <Field />
          <Skeleton style={{ height: 40 }} />
        </div>
      </main>
    </div>
  );
}

export const routeSkeletons: Record<keyof typeof routes, () => React.ReactNode> = {
  '/app': DashboardSkeleton,
  '/app/fila': () => <ListSkeleton rows={5} />,
  '/app/tarefas': TasksBoardSkeleton,
  '/app/tarefas/nova': FormSkeleton,
  '/app/tarefas/[id]': DetailSkeleton,
  '/app/clientes': () => <ListSkeleton rows={8} />,
  '/app/clientes/novo': FormSkeleton,
  '/app/clientes/[id]': DetailSkeleton,
  '/app/departamentos': () => <ListSkeleton rows={5} />,
  '/app/documentos': () => <ListSkeleton rows={6} />,
  '/app/documentos/enviar': FormSkeleton,
  '/app/documentos/solicitar': FormSkeleton,
  '/app/importacoes': () => <ListSkeleton rows={6} />,
  '/app/importacoes/nova': WizardSkeleton,
  '/app/importacoes/[id]': WizardSkeleton,
  '/app/notificacoes': () => <ListSkeleton rows={6} />,
  '/app/auditoria': () => <ListSkeleton rows={8} />,
  '/app/sem-permissao': FormSkeleton,
  '/app/configuracoes': CardGridSkeleton,
  '/app/configuracoes/perfil': FormSkeleton,
  '/app/configuracoes/aparencia': FormSkeleton,
  '/app/configuracoes/equipe': () => <ListSkeleton rows={5} />,
  '/app/configuracoes/organizacao': FormSkeleton,
  '/login': AuthSkeleton,
  '/cadastro': AuthSkeleton,
  '/recuperar-senha': AuthSkeleton,
  '/atualizar-senha': AuthSkeleton,
  '/onboarding': AuthSkeleton,
  '/configuracao': AuthSkeleton,
  '/': AuthSkeleton,
};

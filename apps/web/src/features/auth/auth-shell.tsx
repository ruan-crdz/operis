import Link from '@/runtime/link';
export function Brand() {
  return (
    <Link href="/app" className="brand" aria-label="Operis início">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        operis<span style={{ color: 'var(--primary)' }}>.</span>
      </span>
    </Link>
  );
}
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Brand />
        <div>
          <p className="eyebrow">A operação, em ordem.</p>
          <h1>
            Mais clareza.
            <br />
            Menos pendências.
          </h1>
          <p>
            O sistema operacional da contabilidade. Seu escritório, seus clientes e cada etapa do trabalho no
            mesmo lugar.
          </p>
          <div className="auth-proof">
            <div>
              <span>01</span>Uma visão precisa do que precisa de atenção
            </div>
            <div>
              <span>02</span>Documentos e tarefas com contexto
            </div>
            <div>
              <span>03</span>Inteligência com você no controle
            </div>
          </div>
        </div>
        <p className="auth-footer">OPERIS · FUNDAÇÃO 0.1</p>
      </aside>
      <main id="main" className="auth-main">
        <div className="auth-form">{children}</div>
      </main>
    </div>
  );
}

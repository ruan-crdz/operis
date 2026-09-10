import Link from '@/runtime/link';
import { Brand } from '@/features/auth/auth-shell';
import { Alert, Panel } from '@operis/ui';
export default function Setup() {
  return (
    <main id="main" className="setup">
      <Brand />
      <p className="eyebrow">Primeira execução</p>
      <h1>Uma base pronta para sua operação.</h1>
      <p className="muted">
        Conecte o ambiente de dados para criar seu escritório e começar a trabalhar no Operis.
      </p>
      <Alert>
        O Supabase ainda não está configurado. Login, documentos e dados operacionais ficam disponíveis após a
        conexão.
      </Alert>
      <div className="setup-grid">
        <Panel className="panel-pad">
          <p className="eyebrow">01 · Preparação</p>
          <h2>Conecte seu escritório</h2>
          <p className="muted">
            Peça ao responsável pela instalação para concluir a configuração do Supabase.
          </p>
          <p>Seu escritório terá acesso a clientes, tarefas, documentos e importações após essa etapa.</p>
          <small className="muted">
            Os dados de cada escritório ficam protegidos por permissões de acesso.
          </small>
        </Panel>
        <Panel className="panel-pad">
          <p className="eyebrow">02 · Conexão</p>
          <h2>Finalize a instalação</h2>
          <p className="muted">
            O responsável encontra o passo a passo no guia de publicação do projeto. Após configurar, é
            necessário publicar o site novamente.
          </p>
          <p>Você não precisa informar chaves ou senhas de serviços nesta tela.</p>
          <small className="muted">A chave da OpenAI é opcional. O mapeamento manual funciona sem IA.</small>
        </Panel>
      </div>
      <div className="form-actions">
        <Link className="button button-primary" href="/login">
          Ir para o login
        </Link>
        <span className="muted">Guia do responsável: docs/publicar-gh-pages.md.</span>
      </div>
    </main>
  );
}

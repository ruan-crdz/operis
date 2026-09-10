# Estado atual da Operis

Atualizado em 10/09/2026 após a Fase 2.

A Operis é um export estático Next.js 16/React 19 para GitHub Pages. O navegador usa a chave publicável e o JWT do usuário para acessar Supabase. RLS, grants e RPCs são a fronteira de confiança; parsing de arquivos, assinatura interna e OpenAI permanecem na Edge Function `operis`. Nenhum secret ou `service_role` entra no bundle.

A fundação horizontal continua funcional: organizações, Auth, RBAC, clientes, competências, tarefas/Kanban, comentários, dependências, documentos privados, solicitações, importação CSV/XLSX aprovada, notificações, auditoria e assistente opcional com limite de 15 mensagens por minuto.

A Fase 2 acrescentou o primeiro vertical operacional:

- workspace `/app/departamentos/dp`, carteira paginada e pendências centrais;
- processo de cliente/competência e workflow genérico versionado com DAG, 16 etapas, SLA básico e integração transacional com tarefas;
- abertura individual ou idempotente para até 500 clientes;
- checklist que distingue silêncio do cliente, ausência de ocorrência e item não aplicável;
- colaboradores com UUID persistente e CPF mascarado, ocorrências tipadas, variáveis de folha operacionais e lineage;
- validações determinísticas versionadas, resolução justificada, aprovação em dupla, conclusão e reabertura auditada;
- evidências, audit log, outbox e fila `pgmq` opcional quando a extensão existe;
- seed local opt-in com dois usuários e 30 clientes fictícios em estados distribuídos.

O banco possui nove migrations, 40 tabelas públicas com RLS e 35 funções públicas geradas nos tipos. A migration 009 também prepara solicitações externas usando somente hash de token e mantém versões publicadas/arquivadas imutáveis.

Verificação local desta fase:

- `pnpm lint`: aprovado.
- `pnpm typecheck`: aprovado.
- `pnpm test`: 37 testes Vitest e 33 testes PostgreSQL/PGlite aprovados.
- `pnpm build`: aprovado; somente `/` e `/_not-found`, ambos estáticos.
- `pnpm pages:check`: aprovado, incluindo varredura de secrets no export.
- `pnpm test:e2e`: 10 aprovados e 2 cenários Supabase ignorados por ausência de credenciais/serviço real.

Limitações reais: não há cálculo de folha, INSS/FGTS/IRRF, transmissão eSocial/EFD-Reinf, DCTFWeb, arquivo bancário, lançamento contábil, portal do cliente, WhatsApp, OCR/RAG genérico ou editor visual de workflow. O registry de importação está preparado no schema, mas o wizard visual ainda processa cadastro de empregados; variáveis e ocorrências entram manualmente nesta versão. O ambiente local não possui Docker, então seed, Auth/Storage HTTP, Realtime, Cron, Queues e Edge Functions não foram testados de ponta a ponta contra Supabase.

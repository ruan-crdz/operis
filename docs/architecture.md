# Arquitetura

## Arquitetura publicada e Fase 2

A versão publicada no GitHub Pages usa export estático e um runtime de rotas por fragmento. Loaders e actions executam no navegador com o JWT do usuário; RLS, grants e RPCs transacionais são a fronteira de confiança. Parsing de arquivos e IA continuam na Edge Function `operis`.

A Fase 2 acrescenta o motor genérico de workflow e o workspace DP sem exigir servidor Next. A carteira faz paginação de 50 processos e consultas por lote. `outbox_events` persiste eventos atomicamente; `pgmq` é ativado pela migration quando disponível. Consulte [workflow-engine.md](workflow-engine.md) e [departamento-pessoal.md](departamento-pessoal.md).

O texto abaixo registra decisões do desenho SSR original; referências a Server Components e Server Actions não descrevem o runtime atual do GitHub Pages.

O MVP é um monólito modular: Next.js 16 e React 19 no app web, Supabase como Auth/PostgreSQL/Storage/Realtime. Turborepo organiza UI, domínio, tipos e configuração. Não há microsserviços.

Server Components consultam o banco com o JWT do usuário e RLS. Server Actions validam entradas com Zod, autenticam, autorizam e persistem. O contexto do escritório vem de uma associação verificada; o cookie de escritório apenas seleciona uma associação existente. O proxy renova cookies SSR com a API oficial do Supabase. Não existe autenticação alternativa ou fallback de banco de produção.

Kanban usa TanStack Query, versão numérica para concorrência, atualização otimista com rollback, Realtime e polling de 60 segundos. O wizard usa etapas persistidas e chamadas transacionais no PostgreSQL. Tabelas operacionais usam paginação no servidor; o quadro limita o conjunto a 200 tarefas e exige filtros ao atingir o limite. Prévia de importação usa TanStack Table 9 e paginação de dez linhas.

Arquivos são privados no Supabase Storage. O app não precisa de service role. Operações administrativas do banco/worker têm privilégios explícitos e não são acessíveis por usuários. O seed é local e opt-in.

O parser síncrono tem limites de 10 MB, 5.000 linhas por planilha, 100 colunas, 20 sheets e 40 MB expandidos. Aprovação escreve uma outbox na mesma transação. O cron processa lotes de até cinco imports; também existe execução explícita do item aprovado. `FOR UPDATE`, unicidade e estados impedem duplicações. Expansão futura para filas dedicadas mantém o contrato da outbox.

Contratos de workflow versionado estão em `packages/domain/src/workflows.ts`. O editor e o executor genéricos ainda não existem. Não há cálculos fiscais, folha, eSocial ou conectores governamentais.

Referências: [Next Server Actions](https://nextjs.org/docs/app/guides/server-actions), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [TanStack Table 9](https://tanstack.com/table/latest/docs/framework/react/guide/pagination).

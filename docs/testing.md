# Testes e verificação

- `pnpm lint`: ESLint Next/TypeScript.
- `pnpm typecheck`: strict + noUncheckedIndexedAccess em todos os pacotes.
- `pnpm test`: Vitest (domínio, parser real XLSX/CSV e componentes) + integração PostgreSQL/PGlite com migrations e RLS.
- `pnpm build`: build de produção Next.js.
- `pnpm test:e2e`: Playwright/Chromium + axe nas telas públicas; cenário operacional exige E2E_EMAIL/E2E_PASSWORD e Supabase.
- `pnpm db:test`: suíte pgTAP contra Supabase local.

O harness PostgreSQL executa SQL real com papéis authenticated/anon, JWT por configuração e políticas de Storage sobre a tabela de objetos. Isso valida constraints, grants, policies e RPCs, mas não substitui testes HTTP do GoTrue, PostgREST, Storage e Realtime. O seed usa auth.users/auth.identities reais no Supabase local.

O cenário E2E operacional cria um cliente e tarefa, move/recarrega o Kanban, faz upload, importa um XLSX, mapeia, valida, aprova, processa e verifica tema/densidade após reload. Pode criar escritório para conta sem organização. Use somente conta/base de teste, pois os registros persistem.

Execute `pnpm exec playwright install chromium` antes do primeiro E2E. O CI tem jobs separados para qualidade e integração Supabase; o segundo inicia Docker, aplica migrations, roda pgTAP e seed, configura variáveis locais e executa o fluxo autenticado.

Os resultados efetivamente executados nesta entrega estão em `docs/delivery.md`.

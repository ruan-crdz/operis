# Estado atual do Operis

Documento de referência rápida do que existe hoje em produção e no repositório. Data: 10/09/2026. Para decisões e detalhes profundos, veja os documentos linkados ao final.

## 1. Produto no ar

URL: **https://ruan-crdz.github.io/operis/**. Publicado como export estático do Next.js (sem servidor Node em produção) no GitHub Pages, com backend no Supabase (projeto `operis`, `lxhfqvgoxuvsfgvzuarv`, região São Paulo/sa-east-1). Deploy automático a cada `git push` na `main` (workflow "Publicar Operis no Pages"); mudanças de banco/segredos exigem rodar manualmente o workflow "Configurar Supabase".

## 2. Áreas e rotas

| Área | Rotas | O que faz |
| --- | --- | --- |
| Acesso | `/login`, `/cadastro`, `/recuperar-senha`, `/atualizar-senha`, `/onboarding`, `/configuracao` | Entrar, criar conta (login automático, sem confirmação de email), recuperar senha, criar o escritório com departamentos em badges clicáveis, tela de preparação quando o Supabase não está configurado. |
| Visão geral | `/app` | Dashboard: tarefas atrasadas/vencendo hoje/aguardando cliente/em revisão, minha fila de trabalho, solicitações de documentos pendentes. |
| Operação | `/app/fila`, `/app/tarefas`, `/app/tarefas/nova`, `/app/tarefas/[id]` | Fila pessoal, Kanban de tarefas com filtros (cliente/departamento/competência), criação e detalhe de tarefa (comentários, histórico, dependências sem ciclo, bloqueio com motivo). |
| Clientes | `/app/clientes`, `/app/clientes/novo`, `/app/clientes/[id]` | Carteira paginada/buscável, cadastro, ficha do cliente com abas (visão geral, tarefas, documentos, competências, colaboradores importados, histórico, configurações). |
| Estrutura | `/app/departamentos`, `/app/configuracoes/equipe` | Departamentos como etiqueta de organização (link para tarefas filtradas); equipe e papéis de acesso (RBAC). |
| Documentos | `/app/documentos`, `/app/documentos/enviar`, `/app/documentos/solicitar` | Upload/download privado, avatar, solicitação de documentos ao cliente com checklist e evidência. |
| Importações | `/app/importacoes`, `/app/importacoes/nova`, `/app/importacoes/[id]` | Importação de planilha de colaboradores: escolha de sheet/cabeçalho, mapeamento (com sugestão opcional por IA), templates, validação determinística no banco, revisão, aprovação e processamento sem duplicar. |
| Inteligência | `/app/assistente` | **Novo**: chat com IA que responde sobre clientes, tarefas, competências e documentos do próprio escritório (via ferramentas server-side com as mesmas permissões do usuário) e tira dúvidas de uso do produto. Nunca calcula folha/impostos nem inventa dados. |
| Controle | `/app/notificacoes`, `/app/auditoria`, `/app/sem-permissao` | Notificações não lidas, trilha de auditoria append-only, tela de acesso negado. |
| Preferências | `/app/configuracoes`, `/app/configuracoes/perfil`, `/app/configuracoes/aparencia`, `/app/configuracoes/organizacao` | Perfil, tema (claro/escuro/sistema) e densidade, dados do escritório e chave de IA (ativar/desativar). Também há um toggle rápido de tema (ícone sol/lua/sistema) no canto superior esquerdo da barra lateral. |

## 3. Navegação e UX

SPA por hash (`/operis/#/app/...`) sobre export estático — sem SSR nas páginas privadas. Ao navegar, a tela atual permanece visível até o novo conteúdo estar pronto (sem "flash" de skeleton), com uma barra de progresso fina no topo. `Panel`/`Stat` do Operis UI aceitam `loading` para exibir shimmer no próprio componente quando fizer sentido. Toasts globais aparecem no canto superior direito para o resultado de qualquer ação (sucesso ou erro), além do alerta inline nos formulários.

## 4. Inteligência artificial

Dois recursos, ambos server-only (Edge Function `operis`), com Responses API, `store:false`, minimização de dados e auditoria em `ai_runs`. Desligam juntos pelo switch `ai_enabled` do escritório (Configurações → Escritório):

- **Sugestão de mapeamento de planilha**: sugere de qual coluna vem cada campo (nome/CPF/salário/admissão) a partir de cabeçalhos sanitizados, nunca dos dados das linhas.
- **Assistente (`/app/assistente`)**: chat com tool-calling sobre `search_clients`, `search_tasks`, `get_competence_summary`, `search_documents` (todas escopadas ao escritório e permissão do usuário) e `app_help` (guia estático de uso do produto). Rate limit de 15 mensagens/minuto por usuário/escritório.

## 5. Arquitetura técnica

Node 24, pnpm, Turborepo, Next.js 16 (`output: 'export'`), React 19. `apps/web/src/app` carrega a aplicação sob demanda; `views` tem os loaders de tela; `client` fala com Supabase sob RLS; `server` contém parser, validação de arquivo e o AI Gateway publicados na Edge Function. `packages/domain` (regras puras), `packages/ui` (Operis UI e tokens), `packages/types` (tipos gerados do banco).

## 6. Banco e segurança

Supabase (Auth, PostgreSQL, Storage). 8 migrations, 27+ tabelas, RLS em tudo, RBAC, auditoria append-only, isolamento por `organization_id` com chaves compostas. Importação validada e aprovada por RPCs transacionais no banco (nunca confia em contagens do navegador). Sem `service_role` em operações de usuário. Ver [banco](database.md) e [segurança](security.md).

## 7. Testes e verificações

`pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest + 26 testes PostgreSQL/PGlite reais), `pnpm build`, `pnpm pages:check`, `pnpm test:e2e` (Playwright). Todos verdes na última publicação. Ver [testes](testing.md).

## 8. Limitações conhecidas

- Departamentos são apenas uma etiqueta de organização hoje; não têm telas ou configurações próprias.
- Sem convite por email/portal externo para clientes; solicitações de documento são só internas.
- Workflows genéricos, editor avançado de permissões, pgmq, SSO/MFA e motores fiscais/folha não existem.
- Confirmação de email está desativada (login imediato após cadastro) — decisão explícita para agilizar o primeiro acesso; pode ser revertida em `supabase/config.toml` (`auth.email.enable_confirmations`).
- Import: 10 MB/arquivo, 5.000 linhas, 100 colunas, 20 sheets; fórmulas/macros rejeitadas. Kanban lista até 200 tarefas filtradas.

## 9. Documentação relacionada

[Arquitetura](architecture.md) · [Banco](database.md) · [Segurança](security.md) · [Design system](design-system.md) · [IA](ai.md) · [Motor de importação](import-engine.md) · [Testes](testing.md) · [Entrega do MVP](delivery.md) · [Guia de publicação](publicar-gh-pages.md) · [ADRs](adr)

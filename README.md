# Operis

O sistema operacional da contabilidade. Primeiro MVP estrutural com autenticação, escritórios, RBAC, clientes, tarefas/Kanban, documentos, competências, notificações e importação de colaboradores com revisão humana.

**Estado desta entrega:** código e testes locais implementados. A execução completa exige Supabase. Sem configuração, a aplicação abre uma tela de preparação; não simula dados ou integrações. Veja [relatório de entrega](docs/delivery.md).

## Requisitos

- Node.js 24 LTS.
- pnpm 10 (versão declarada em `packageManager`; `corepack pnpm` também funciona).
- Docker Desktop ou Podman em execução para o Supabase local.
- A CLI do Supabase é uma dependência de desenvolvimento do projeto.
- OpenAI é opcional; exige chave e modelo com Structured Outputs para sugerir mapeamentos.

No Windows com PowerShell bloqueando scripts `.ps1`, use `pnpm.cmd` no lugar de `pnpm`, ou `corepack pnpm`.

## Executar localmente

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:start
corepack pnpm db:reset
node scripts/configure-local.mjs
corepack pnpm dev
```

Abra [localhost:3000](http://localhost:3000). O script de configuração lê somente URL/chave pública do Supabase local e cria `apps/web/.env.local`; ele não sobrescreve um arquivo existente.

Alternativa manual no PowerShell:

```powershell
Copy-Item .env.example apps/web/.env.local
```

Preencha a URL e chave pública exibidas por `pnpm exec supabase status`. Reinicie o servidor após alterar as variáveis. Em projeto Supabase remoto, aplique as migrations com a CLI antes de usar o app; nunca execute o seed de demonstração em produção.

## Variáveis

| Variável                               | Uso                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | URL do app e callbacks de autenticação. Local: `http://localhost:3000`.                  |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL do projeto Supabase. Obrigatória.                                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública/publishable; no Supabase local aceita a anon key. Obrigatória.             |
| `OPENAI_API_KEY`                       | Chave exclusivamente do servidor. Opcional.                                              |
| `OPENAI_MODEL`                         | Modelo disponível na sua conta com Responses/Structured Outputs. Necessário para IA.     |
| `SUPABASE_SERVICE_ROLE_KEY`            | Reservada para operações administrativas futuras; o app não precisa dela. Nunca pública. |

Nenhuma credencial real foi criada ou incluída no repositório.

## Primeiro acesso

1. Crie uma conta em `/cadastro`.
2. Confirme pelo email recebido. No Supabase local, abra o serviço de email de desenvolvimento indicado por `supabase status` (porta configurada: 54324).
3. Entre e informe seu nome, nome do escritório e departamentos.
4. Crie um cliente, uma competência e uma tarefa.
5. Em Equipe, adicione o email de uma conta já confirmada e atribua um papel. Esta versão não envia convites.

O callback é `/auth/callback`. Para recuperação, a URL redireciona a `/atualizar-senha`. Configure as URLs permitidas no Auth de um projeto remoto.

## Demonstração opcional

```sh
corepack pnpm db:seed
```

Cria **Operis Demo Accounting**, clientes explicitamente fictícios, departamentos, tarefas, comentários e solicitação documental. Conta local: `demo@operis.test` / `OperisDemo!2026`. O seed é opt-in, não cria arquivos falsos no Storage e não chama IA. O script recusa bancos remotos. O SQL de seed não foi executado neste ambiente sem Docker; o CI contém sua verificação com Supabase real.

Fixtures em `fixtures/`: CSV/XLSX válidos, inválidos e com estrutura alterada. Recrie com `pnpm fixtures`. Os valores são exclusivamente de teste. Para demonstrar a importação: escolha um cliente/competência, envie `employees-valid.xlsx`, mapeie Nome/CPF/Salário/Admissão, valide, revise e aprove. Execute “Processar agora” ou aguarde o cron. Reabrir não duplica os registros.

## Rotas

| Área         | Rotas                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------- |
| Acesso       | `/login`, `/cadastro`, `/recuperar-senha`, `/atualizar-senha`, `/onboarding`, `/configuracao` |
| Operação     | `/app`, `/app/fila`, `/app/tarefas`, `/app/tarefas/nova`, `/app/tarefas/[id]`                 |
| Clientes     | `/app/clientes`, `/app/clientes/novo`, `/app/clientes/[id]`                                   |
| Estrutura    | `/app/departamentos`, `/app/configuracoes/equipe`                                             |
| Documentos   | `/app/documentos`, `/app/documentos/enviar`, `/app/documentos/solicitar`                      |
| Importações  | `/app/importacoes`, `/app/importacoes/nova`, `/app/importacoes/[id]`                          |
| Controle     | `/app/notificacoes`, `/app/auditoria`, `/app/sem-permissao`                                   |
| Preferências | `/app/configuracoes`, `/perfil`, `/aparencia`, `/organizacao` sob `/app/configuracoes`        |

## Verificações

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` inclui Vitest e testes de banco PostgreSQL/PGlite com as migrations reais. `pnpm db:test` executa pgTAP com Supabase local. O E2E autenticado requer `E2E_EMAIL` e `E2E_PASSWORD` de uma conta de teste; sem elas, somente esse cenário é explicitamente ignorado. Ele cria registros persistentes. `pnpm db:types` regenera tipos de metadados PostgreSQL; `pnpm db:types:supabase` usa o gerador oficial quando o Supabase está ativo.

## Arquitetura e limites

`apps/web`: Next.js 16/React 19. `packages/ui`: Operis UI. `packages/domain`: regras puras. `packages/types`: contratos e tipos gerados. `supabase/`: seis migrations, RLS, Storage, outbox/cron e pgTAP.

Limites do primeiro MVP: 10 MB por arquivo, 2 MB por avatar, 5.000 linhas/100 colunas/20 sheets por importação; fórmulas/macros rejeitadas. O Kanban mostra até 200 tarefas filtradas. Opções de clientes/membros têm limite de 500; cadastro paginado permite navegar a carteira. Algumas listas de contexto usam limites explícitos documentados. Documentos solicitados são acompanhados internamente, sem portal externo/email/WhatsApp. Workflows genéricos, editor avançado de permissões, pgmq, SSO/MFA e motores fiscais/folha não estão implementados.

Nesta máquina, Docker/Supabase e credenciais OpenAI não estavam disponíveis. Autenticação real, Storage HTTP, Realtime, cron, seed e chamada OpenAI precisam da validação integrada. Não há publicação externa nesta entrega.

Documentação: [arquitetura](docs/architecture.md), [banco](docs/database.md), [segurança](docs/security.md), [design system](docs/design-system.md), [IA](docs/ai.md), [importação](docs/import-engine.md), [testes](docs/testing.md) e [ADRs](docs/adr).

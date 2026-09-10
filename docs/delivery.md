# Entrega do primeiro MVP Operis

Data: 10/09/2026. Implementação local baseada em `prompt.txt`, preservado como referência de produto. O código foi verificado nas condições abaixo; a integração completa com os serviços Supabase ainda precisa ser executada.

## 1. O que foi criado

Monorepo executável, aplicação em pt-BR, Operis UI, domínio compartilhado, banco com isolamento por escritório, importação revisável, testes, fixtures explícitas, CI e documentação técnica. Não há dados de demonstração automáticos nem integrações simuladas na aplicação.

## 2. Arquitetura

Node 24, pnpm, Turborepo, Next.js 16 e React 19. Rotas e composição em `apps/web/src/app`, interações em `features`, autenticação/ações/arquivos/IA em `server`. Pacotes separados para domínio, UI, configuração e tipos gerados. Supabase fornece Auth, PostgreSQL, Storage e Realtime. As decisões estão em [arquitetura](architecture.md) e [ADRs](adr).

## 3. Rotas e interface

Acesso, recuperação de senha, onboarding, painel operacional, fila, clientes, tarefas/Kanban, departamentos, documentos, importações, notificações, auditoria e configurações. Inclui navegação por teclado, busca global, tema claro/escuro/sistema e densidade. A lista de caminhos está no [README](../README.md#rotas).

## 4. Banco e segurança

Seis migrations e 27 tabelas, com RLS, relacionamentos compostos entre entidades do mesmo escritório, RBAC e auditoria. Arquivos originais privados e imutáveis. RPCs validam, aprovam e processam importações no banco, com versionamento, idempotência e outbox. Operações de usuário não usam `service_role`. Tipos gerados a partir das migrations executadas em PostgreSQL/PGlite. Veja [banco](database.md) e [segurança](security.md).

## 5. Funcionalidades implementadas

- Cadastro/acesso, criação de escritório, perfil, equipe e papéis.
- Clientes, competências, tarefas, responsáveis, comentários, histórico e dependências sem ciclos.
- Kanban com atualização otimista, tratamento de conflito, assinatura Realtime e consulta periódica.
- Upload/download privado, avatar, solicitações documentais e checklist com evidência.
- Importação CSV/XLSX: escolha de sheet/cabeçalho, mapeamento, templates, detecção de mudança de estrutura, validação determinística, revisão, aprovação humana e processamento sem duplicação.
- Sugestão opcional de mapeamento por Responses API/Structured Outputs, restrita ao servidor, com minimização de dados e auditoria. Exige configuração e não foi chamada neste ambiente.

## 6. Verificações executadas

| Comando                          | Resultado nesta máquina                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Aprovado                                                                             |
| `pnpm lint`                      | Aprovado, sem avisos                                                                 |
| `pnpm typecheck`                 | Aprovado                                                                             |
| `pnpm test`                      | 23 testes Vitest e 24 testes PostgreSQL/PGlite aprovados                             |
| `pnpm build`                     | Build de produção aprovado                                                           |
| `pnpm test:e2e`                  | 9 aprovados; 1 cenário autenticado explicitamente ignorado por falta de configuração |
| `pnpm db:start`                  | Tentado; indisponível por ausência do Docker                                         |
| `pnpm db:test` e `pnpm db:seed`  | Não executados; exigem Supabase local                                                |

Os testes de banco executaram migrations, constraints, grants, RLS e RPCs reais, incluindo tentativas negativas de cruzar escritórios, adulterar auditoria, aprovar importação inválida e criar dependências cíclicas. O harness representa Auth e a tabela de objetos para testar SQL; não testa os serviços HTTP do Supabase.

O Playwright verificou telas públicas, proteção de rota, teclado, acessibilidade automatizada e ausência de overflow móvel. Capturas de login desktop, móvel e escuro foram inspecionadas. Isso não certifica acessibilidade ou comportamento das telas autenticadas. O CI contém um job separado para iniciar Supabase, executar pgTAP/seed e o cenário operacional; esse job não foi executado nesta entrega. Veja [testes](testing.md).

## 7. Como executar

Com Docker Desktop disponível e em execução, na raiz do projeto:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd db:start
pnpm.cmd db:reset
node scripts/configure-local.mjs
pnpm.cmd dev
```

Abra `http://localhost:3000`, crie uma conta, confirme o email no serviço local e conclua o onboarding. `db:reset` recria o banco local; use apenas a base de desenvolvimento. O script de configuração recusa sobrescrever `.env.local`. Demonstração opcional e explícita: `pnpm.cmd db:seed`. Instruções completas no [README](../README.md).

## 8. Variáveis de ambiente

Copie os nomes de [.env.example](../.env.example) para `apps/web/.env.local`. Obrigatórias: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; configure também `NEXT_PUBLIC_APP_URL` para os callbacks. IA opcional: `OPENAI_API_KEY` e `OPENAI_MODEL`. A aplicação não precisa de chave `service_role`. Sem Supabase configurado, exibe preparação em vez de dados fictícios.

## 9. Limitações reais

Auth real, Storage HTTP, Realtime, cron, seed e chamada OpenAI não foram validados de ponta a ponta nesta máquina. Não houve publicação externa. O fluxo autenticado está escrito para execução com uma conta e base de teste, mas permanece sem resultado integrado.

Importações têm limites de 10 MB, 5.000 linhas, 100 colunas e 20 sheets; fórmulas/macros são rejeitadas. O Kanban limita a consulta a 200 tarefas filtradas e seletores de clientes/membros a 500 opções. Solicitações documentais são internas; convites por email, portal externo e WhatsApp estão fora deste MVP. Workflows genéricos têm somente contratos; editor avançado de permissões, pgmq, SSO/MFA e motores fiscais/folha estão pendentes. Preferências de outros dispositivos são carregadas no próximo login.

## 10. Próximas cinco prioridades

1. Executar Supabase local e o job de integração completo, corrigindo eventuais diferenças entre o harness SQL e os serviços reais.
2. Revisar os fluxos autenticados com um escritório piloto, incluindo papéis, arquivos, importação e acessibilidade.
3. Validar o AI Gateway com credenciais de teste e amostras autorizadas, medindo qualidade, custo e falhas.
4. Preparar a operação de staging: observabilidade, backups/restauração, política de retenção e monitoramento dos jobs.
5. Evoluir paginação e busca para carteiras maiores e priorizar convites, portal documental e workflows conforme o piloto.

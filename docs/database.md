# Banco de dados

## Migration 009

`202609100009_workflow_dp.sql` eleva o total para 40 tabelas públicas e adiciona definições/runs de workflow, processos por competência, colaboradores persistentes, ocorrências, checklist, variáveis operacionais, validações versionadas, aprovações e evidências. Também prepara solicitações externas com hash de token, registra tipos de importação e promove snapshots aprovados para a identidade persistente do colaborador.

As mutações compostas são RPCs. Novas tabelas concedem somente `SELECT` ao papel `authenticated`; criação e transição passam pelas funções autorizadas. Índices atendem carteira por competência/status/responsável, etapas, ocorrências, coleta e validações abertas. O seed local contém 30 clientes distribuídos por estados operacionais.

27 tabelas com RLS em seis migrations ordenadas:

1. `202609100001_foundation.sql`: perfis, escritórios, membros, departamentos, RBAC, clientes, competências, tarefas, comentários, dependências, documentos, solicitações, notificações, auditoria, outbox e execuções de IA.
2. `202609100002_imports.sql`: importações, templates, snapshots de colaboradores, aprovações e funções transacionais de configuração, validação, aprovação e execução.
3. `202609100003_storage.sql`: buckets privados e políticas por escritório, cliente e tipo de arquivo.
4. `202609100004_operations.sql`: Cron quando disponível, publicação Realtime e limitador de frequência persistente.
5. `202609100005_integrity.sql`: solicitação documental atômica e validação de evidências/CPF.
6. `202609100006_hardening.sql`: identidade imutável, avatar restrito ao proprietário, índices e dependências sem ciclos.

Relacionamentos entre entidades de tenant usam chaves compostas `(organization_id,id)`. UUIDs identificam entidades; datas de operação são `date`, eventos são `timestamptz`. `numeric(12,2)` preserva salários informados. A competência é validada como mês AAAA-MM.

`create_organization` cria organização, departamentos, associação e três papéis atomicamente. `manage_member` altera acesso de contas existentes sem enviar email. As tabelas de permissões não são graváveis pelo cliente. O proprietário mantém seu papel administrativo.

O audit log não permite INSERT/UPDATE/DELETE ao usuário. Triggers registram campos alterados e transições sem copiar os valores pessoais. `ai_runs` registra provedor/modelo, versão do prompt, duração, tokens e resultado, sem dados da planilha.

Tipos são gerados de metadados PostgreSQL por `pnpm db:types`, usando as mesmas migrations num banco PGlite descartável. O harness implementa apenas as superfícies Auth/Storage necessárias aos testes de SQL; não substitui serviços Supabase. Com Docker, `pnpm db:types:supabase` usa o gerador oficial.

O seed de desenvolvimento não roda no reset por padrão: execute `pnpm db:seed` explicitamente. A aplicação nunca monta arrays locais para simular seus indicadores.

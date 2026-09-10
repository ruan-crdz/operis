# Workflow engine

O engine transforma uma versão publicada em um processo operacional. `workflows` identifica o fluxo; `workflow_versions` congela configuração; `workflow_steps` e `workflow_step_dependencies` formam um grafo acíclico; `department_processes` e `workflow_step_runs` registram a execução.

Somente versões `published` iniciam processos. Etapas e dependências publicadas são imutáveis por trigger. O template inicial tem 16 etapas e permite paralelismo entre admissões, desligamentos, férias, afastamentos, cadastro e variáveis. A constraint `(organization_id, workflow_version_id, client_id, competence)` e a RPC transacional tornam a abertura idempotente.

`workflow_step_runs` é a fonte de verdade. Etapas manuais e de aprovação criam `tasks`; a RPC `update_workflow_step_run` atualiza os dois registros na mesma transação e libera sucessoras apenas quando todas as dependências terminam. Alterações diretas de status em tarefas vinculadas são rejeitadas.

Estados do processo e saúde são separados. O estado descreve a fase; a saúde é derivada de prazo, bloqueio e resultados de validação. A carteira consulta no máximo 50 processos por página e agrega runs/pendências em consultas por lote.

## Limites desta versão

O schema aceita etapas `condition` e `integration`, mas ainda não há linguagem de condições nem editor visual de versões. O template é criado pela primeira abertura do DP. As RPCs de clone, publicação e arquivamento preservam runs antigos e deixam a futura interface administrativa sem acesso direto de escrita às tabelas.

# Modelo de dados de DP

Todas as tabelas possuem `organization_id`, RLS e FKs compostas onde há relação entre entidades de escritório.

| Grupo     | Tabelas                                                                          | Responsabilidade                                                       |
| --------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Definição | `workflows`, `workflow_versions`, `workflow_steps`, `workflow_step_dependencies` | Grafo versionado e imutável depois de publicado                        |
| Execução  | `department_processes`, `workflow_step_runs`                                     | Competência do cliente e estado de cada etapa                          |
| Cadastro  | `employees`                                                                      | Identidade UUID persistente; CPF é atributo e aparece mascarado na UI  |
| Entradas  | `dp_occurrences`, `payroll_variables`, `dp_collection_items`                     | Movimentações tipadas, variáveis operacionais e respostas estruturadas |
| Controle  | `dp_validation_results`, `process_approvals`, `process_evidence`                 | Regras versionadas, revisão em dupla e justificativas do fechamento    |

Importações continuam com três camadas: arquivo original imutável, registros validados em staging e dados confirmados. Snapshots aprovados promovem identidade para `employees`; salário continua no snapshot por competência. `imports.import_type` prepara o mesmo wizard para cadastro, variáveis e ocorrências. Variáveis armazenam arquivo, planilha, linha e autor, sem adotar rubricas legais.

Solicitações de documento agora têm estado e datas para um futuro portal externo. Somente o hash de um token poderá ser persistido; nenhum token em claro é exposto nesta fase.

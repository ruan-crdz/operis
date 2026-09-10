# Validação de DP

As regras vivem fora do React. O contrato `ValidationRule<TContext>` em `packages/domain` define identificador, versão, categoria, severidade e avaliação. A RPC `validate_department_process` persiste resultados com `validation_run_id`, `rule_id`, `rule_version`, entidade e detalhes.

Regras iniciais: CPF estrutural, admissão sem data, ordem de desligamento, ocorrência sem colaborador quando obrigatório, data fora da competência e item de coleta ainda sem resposta. Somente `error` bloqueia revisão e conclusão; `warning` exige visibilidade, mas pode ser aceito. Resolver um resultado exige `dp.review` e justificativa auditável.

Reexecutar validações não apaga história. Resultados anteriores abertos são encerrados como substituídos, e uma nova execução recebe outro identificador. Regras legais futuras só devem entrar com fonte oficial, versão e testes de vigência.

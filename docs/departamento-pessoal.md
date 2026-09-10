# Departamento Pessoal

O workspace `/app/departamentos/dp` controla o fechamento mensal de uma carteira. A tela mostra indicadores da competência, abertura individual ou idempotente para toda a carteira, filtros persistidos na URL e tabela paginada. O cockpit por cliente reúne etapas, checklist, ocorrências, colaboradores, documentos, validações e aprovações.

Fluxo operacional:

1. Abra a competência para um cliente ou para até 500 clientes ativos.
2. Atualize cada item da coleta distinguindo `pending`, `has_information`, `no_occurrence` e `not_applicable`.
3. Registre movimentações tipadas e vincule colaborador e documento quando existirem.
4. Conclua etapas conforme as dependências forem liberadas.
5. Execute a validação determinística e resolva erros com justificativa.
6. Solicite revisão. Se a versão exigir revisão em dupla, outro usuário deve aprovar.
7. Conclua as etapas finais e a competência. Reabertura exige permissão e motivo.

O Operis coordena entradas e decisões. Esta fase não calcula folha, não transmite eSocial, não gera pagamentos e não substitui o sistema oficial do escritório.

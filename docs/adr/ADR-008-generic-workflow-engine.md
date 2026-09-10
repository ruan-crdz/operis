# ADR-008: Motor genérico de workflow

**Status:** aceito.

Separar definição versionada de execução. Versões publicadas são imutáveis e processos apontam para uma versão específica. Dependências formam DAG validado no banco. Isso preserva história e permite evolução de processos regulatórios sem alterar competências em curso.

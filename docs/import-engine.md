# Motor de importação

Destino inicial: snapshot de colaboradores por cliente e competência. Campos: nome e CPF obrigatórios, salário informado e admissão opcionais. Não calcula folha.

Fluxo: upload privado → parsing → escolha de sheet/header → mapeamento persistido → validação determinística → revisão → aprovação → outbox → processamento → resultado → template opcional. O status e a versão persistem entre sessões.

CSV: UTF-8, separador detectado pelo PapaParse e aspas respeitadas. XLSX: ExcelJS, múltiplas sheets, datas normalizadas, fórmulas e macros rejeitadas. O diretório ZIP é inspecionado antes da descompressão. Limites de entrada/expansão impedem uso irrestrito de memória. A prévia pagina dez linhas, não renderiza a planilha inteira.

O banco revalida a partir de `imports.sheets` + mapping, não aceita contagem de erros ou registros validados enviados pelo browser. CPF usa os dois dígitos verificadores; datas impossíveis, salários negativos/inválidos, nomes ausentes, destinos duplicados e CPFs repetidos bloqueiam aprovação. Linhas inteiramente vazias são ignoradas. A UI exige nova validação após alteração local.

Aprovação bloqueia a linha, verifica versão/status e grava aprovação+outbox atomicamente. Processamento bloqueia a importação e grava todos os snapshots numa transação. Índices impedem duplicidade por arquivo/cliente/competência e por colaborador/competência. Reexecução retorna o resultado existente. Não há merge/upsert silencioso de dados trabalhistas.

O cron opcional drena a outbox a cada minuto, até cinco jobs por execução, com backoff e máximo de cinco tentativas. Falhas preservam o estado e permitem execução explícita novamente. O MVP usa outbox PostgreSQL diretamente; integração pgmq/Supabase Queues é uma evolução, não uma fila simulada.

Templates armazenam schema e mapping de imports concluídos; a UI mostra adições/remoções e exige revisão de possíveis renomeações. Arquivos originais são imutáveis: correções de conteúdo entram como novo arquivo, enquanto correções de mapeamento podem ocorrer no wizard.

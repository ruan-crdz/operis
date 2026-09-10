# ADR 006 — Workflows e execução assíncrona

**Contexto:** a operação evoluirá para processos versionados, com etapas manuais/automáticas e aprovação.

**Decisão:** contratos de versões imutáveis no domínio; o primeiro fluxo concreto é a importação. Aprovação e outbox compartilham a transação, execução é idempotente, bounded e recuperável. Cron drena a outbox.

**Alternativas:** editar versões publicadas, disparar jobs antes de confirmar transação, event sourcing completo, adicionar tabelas e filas sem consumidores.

**Consequências:** o editor/runner genérico e pgmq/Supabase Queues ficam como evolução explícita. O MVP já tem um fluxo de importação persistido; não apresenta processos decorativos.

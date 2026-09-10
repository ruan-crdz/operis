# ADR-011: Outbox e Supabase Queues

**Status:** aceito.

`outbox_events` é a fonte transacional e observável. Quando `pgmq` está disponível, a migration cria `operis_jobs` e a função restrita a `service_role` transfere eventos devidos. Assim, ausência da extensão não perde eventos. Consumidores devem ser idempotentes, usar retries finitos e registrar erro sanitizado.

A escolha segue a arquitetura Postgres-native do [Supabase Queues](https://supabase.com/docs/guides/queues). Edge Functions podem consumir em background, respeitando seus [limites de execução](https://supabase.com/docs/guides/functions/background-tasks); processos longos continuam representados por mensagens e estados persistidos.

# ADR 002 — Supabase

**Contexto:** identidade, banco e arquivos precisam de controles consistentes sem autenticação própria.

**Decisão:** Supabase Auth/SSR, PostgreSQL/RLS, Storage privado, Realtime e Cron. O app usa o JWT do usuário.

**Alternativas:** auth própria, vários serviços desconectados, SQLite em produção.

**Consequências:** execução local completa depende de Docker ou de um projeto Supabase configurado. PGlite existe somente como harness de SQL/testes, sem substituir integrações. Migrações e tipos são reproduzíveis.

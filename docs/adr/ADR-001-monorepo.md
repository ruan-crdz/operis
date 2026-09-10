# ADR 001 — Monorepo modular

**Contexto:** um único produto web precisa compartilhar regras e identidade visual.

**Decisão:** pnpm + Turborepo, com web, domain, ui, types e config. Pacotes internos consumidos como TypeScript.

**Alternativas:** repositórios separados; pacote único sem fronteiras; microsserviços.

**Consequências:** uma instalação e pipeline, fronteiras explícitas sem publicação de pacotes. Separar workers continua possível sem extrair serviços agora.

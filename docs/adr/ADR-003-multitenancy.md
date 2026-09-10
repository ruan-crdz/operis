# ADR 003 — Isolamento de escritórios

**Contexto:** IDs fornecidos pelo cliente não provam associação ou autorização.

**Decisão:** tenant por organização; RLS com helpers de associação e permissão; relações compostas incluindo organization_id; escritório ativo escolhido apenas entre associações do usuário.

**Alternativas:** filtro apenas no servidor; banco por escritório; permissões somente visuais.

**Consequências:** isolamento é testável inclusive contra SQL direto. Tabelas de papéis não são graváveis por usuários; RPCs controlam mudanças. Identidades não podem migrar entre escritórios por update.

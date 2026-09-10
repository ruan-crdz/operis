# ADR 005 — Limites da IA

**Contexto:** mapeamento é ambíguo; valores trabalhistas exigem regras determinísticas.

**Decisão:** SDK oficial + Responses Structured Outputs atrás de um gateway. Cabeçalhos e tipos minimizados, sugestões explícitas, revisão humana e validação transacional no banco.

**Alternativas:** JSON livre, envio de planilha inteira, importação automática, cálculos por modelo.

**Consequências:** manual continua disponível sem OpenAI. Confiança é heurística, não probabilidade calibrada. Toda chamada registra modelo, versão, duração e tokens sem payload pessoal.

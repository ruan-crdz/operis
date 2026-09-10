# AI Gateway

`apps/web/src/server/ai/gateway.ts` é o único ponto que importa o SDK OpenAI. Usa Responses API, `responses.parse` e `zodTextFormat` com saída formal. `OPENAI_MODEL` é obrigatório para habilitar a feature e deve ser um modelo disponível na conta com suporte a Structured Outputs. Nenhuma chamada é feita durante instalação/build.

Feature: `spreadsheet_mapping`; prompt: `spreadsheet_mapping:v1`. O usuário solicita a sugestão explicitamente. Entrada: índice implícito, cabeçalho sanitizado/truncado, tipo e indicador de coluna vazia. Nenhuma linha pessoal é enviada. Saída: índice, destino, confiança heurística alta/média/baixa e motivo.

As sugestões aparecem em violeta e não sobrescrevem decisões. A substituição de um mapeamento manual exige confirmação. O resultado é validado com Zod e índices fora do arquivo são rejeitados. A aplicação registra tokens, duração, modelo, versão e resultado sem guardar payload pessoal.

Timeout de 30 segundos, uma tentativa adicional no SDK, seis solicitações por minuto/usuário/escritório. Sem chave/modelo, desabilitação pelo administrador, recusa ou falha: o mapeamento manual continua disponível. A aprovação utiliza os dados e regras do PostgreSQL, nunca a opinião do modelo.

Integração implementada, sem chamada real neste ambiente por ausência de credenciais.

Referência oficial: [Structured Outputs com Responses](https://developers.openai.com/api/docs/guides/structured-outputs).

# Integração futura com eSocial

Não há transmissão de eSocial nesta fase. A documentação técnica oficial publica leiautes, XSDs, notas e datas de produção diferentes; por isso uma integração deve congelar `layoutVersion` por evento e nunca acoplar XML ou transporte a componentes React. Consulte sempre a [documentação técnica oficial](https://www.gov.br/esocial/pt-br/documentacao-tecnica/documentacao-tecnica) antes de implementar uma regra.

Camadas previstas:

```text
eSocialAdapter
  -> eventBuilder(layoutVersion)
  -> schemaValidator(XSD versionado)
  -> transport(environment)
  -> protocol
  -> processingStatus/poll
  -> receipt ou errors
  -> correction/retry
```

O primeiro alvo deve ser Produção Restrita. Envio, protocolo, consulta e recibo são estados distintos. Certificados, XMLs e respostas devem ficar no backend/Storage autorizado, com auditoria minimizada e sem PII em logs. Promoção para produção requer testes contra os esquemas oficiais vigentes e revisão humana.

A integração usará outbox + queue. O domínio grava mudança e evento atomicamente; um consumidor idempotente constrói, valida, envia e consulta. O browser apenas observa estados autorizados.

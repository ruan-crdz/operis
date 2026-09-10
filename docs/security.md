# Segurança

Defesas implementadas: RLS em todas as tabelas públicas; JWT verificado pelo Auth; autorização de Server Actions; chaves estrangeiras compostas; campos de identidade imutáveis; restrição de RPCs por papel; logs de auditoria append-only; optimistic locking; schemas Zod; saída React escapada; buckets privados; URLs de download assinadas por 60 segundos; validação de extensão/MIME/assinatura; originais não sobrescritos; limites contra ZIP bombs; fórmulas/macros rejeitadas na importação.

Next.js compara Origin e Host nas Server Actions. As ações aceitam até 12 MB, enquanto o upload permite até 10 MB (2 MB para avatar). Headers impedem framing, sniffing de conteúdo e acesso a câmera, microfone e localização. Cookies de preferência e escritório têm SameSite=Lax e são HttpOnly; Secure em produção. A identidade continua sendo validada pelo Supabase, sem confiar no cookie de escritório.

O limite de uploads e IA é compartilhado no PostgreSQL, por usuário/escritório/janela. Auth usa os limites do Supabase, que devem ser revisados no ambiente de produção. A aplicação não utiliza uma service role em requisições de usuário.

CPF/salário/nome não são enviados como amostras à IA. Apenas cabeçalhos truncados e sanitizados, tipos e presença de valores. Cabeçalhos também podem conter dados pessoais: revise a política de privacidade antes de habilitar IA em um cliente real. Modelos não são fonte de valores fiscais. Responses usa `store:false`.

Verificado em PostgreSQL/PGlite: isolamento A/B, negação a leitor e anônimo, RLS de Storage, auditoria imutável, validação no banco, proteção contra replay e concorrência otimista. A suíte pgTAP e o E2E real são executados no job de integração com Supabase. Neste ambiente Windows não há Docker: GoTrue, Storage HTTP, Cron e Realtime não foram validados de ponta a ponta.

Antes do piloto: configurar domínio/HTTPS/SMTP, revisar retenção e backup/restore, varredura de malware, limites de carga, monitoramento, políticas organizacionais e gestão de segredos. Estas etapas não são simuladas pelo MVP.

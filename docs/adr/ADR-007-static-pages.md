# ADR-007: export estático e Supabase Edge Functions

Status: aceito por solicitação explícita do usuário. Substitui as decisões de execução SSR/Server Actions dos ADRs anteriores.

O usuário escolheu GitHub Pages com Supabase. Next.js gera `apps/web/out` com `output: export`; não existe processo Node em produção. O único documento de entrada carrega a aplicação e os módulos de tela sob demanda. Rotas usam fragmentos (`/operis/#/app/clientes/...`), preservando links, filtros, voltar/avançar e reload sem exigir rewrites do provedor. `NEXT_PUBLIC_BASE_PATH` é calculado no build a partir da URL final.

`views` contém loaders de tela executados no navegador. Eles resolvem dados e componentes assíncronos antes de entregar o resultado ao React; efeitos cancelados não publicam respostas antigas. `client` contém o cliente Supabase, ações e consultas sujeitas a RLS. Preferências locais não autorizam acesso. O Auth usa PKCE, sessão persistida no navegador e renovação pelo SDK.

`server` contém somente o parser, validação de arquivos e AI Gateway publicados na Edge Function `operis`. A função valida o JWT via `auth.getUser`, associação ao escritório, permissão e origem; usa o JWT do usuário nas operações de banco e Storage. A configuração `verify_jwt=false` desativa apenas a verificação legada do gateway, pois a verificação explícita no handler é obrigatória e compatível com chaves de assinatura modernas.

A migration 007 revoga a chamada pública do parser SQL antigo. `create_verified_import` exige HMAC-SHA256 do payload completo, identidade, prazo curto, permissão e objeto original. A chave fica em schema privado do banco e em Secrets da Edge Function. A configuração administrativa transfere essa chave sem imprimi-la. O banco continua validando registros e aprovando por RPC transacional.

Consequências: JavaScript é necessário, páginas privadas não têm SSR, não há cookies HttpOnly de aplicação, headers de segurança dependem da hospedagem e a configuração pública é fixada no build. Trocar URL/chave requer republicar. OpenAI e as credenciais administrativas nunca entram no build estático.

A compatibilidade técnica não altera as restrições contratuais do GitHub Pages: o serviço restringe SaaS comercial e orienta evitar transações sensíveis. A operação comercial deve escolher hospedagem compatível com esse uso. O mesmo diretório `out` pode ser hospedado em outro serviço estático.

Referências: [export Next.js](https://nextjs.org/docs/app/guides/static-exports), [Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [limites Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Supabase Edge](https://supabase.com/docs/guides/functions/deploy).

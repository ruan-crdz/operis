# Publicar o Operis (GitHub Pages + Supabase)

> A migration 009 da Fase 2 é aplicada pelo workflow **Configurar Supabase**. Depois dela, os usuários veem **Departamento Pessoal** no menu conforme as permissões do papel. A extensão `pgmq` é ativada automaticamente quando estiver disponível no projeto; a outbox continua preservando eventos se ela não estiver.

Guia do responsável pela instalação. Ninguém mais precisa executar isto nem receber chaves. Nenhum passo aqui expõe segredos no repositório: variáveis e secrets ficam apenas nas configurações do GitHub e do Supabase.

## 1. Dados do projeto Supabase

Em [supabase.com/dashboard](https://supabase.com/dashboard), crie ou abra o projeto e anote em **Project Settings**:

| Onde encontrar                            | Valor a anotar                                                 |
| ----------------------------------------- | -------------------------------------------------------------- |
| Project Settings → General → Reference ID | referência do projeto (20 letras minúsculas)                   |
| Project Settings → Data API               | Project URL (`https://<referência>.supabase.co`)               |
| Project Settings → API Keys               | chave **Publishable** (ou a `anon key` legada)                 |
| Project Settings → Database               | senha do banco definida na criação (redefina ali se não tiver) |

Em [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens), gere um **Personal access token**.

## 2. Variáveis e secrets no GitHub

No repositório: **Settings → Secrets and variables → Actions**.

Aba **Variables**, botão **New repository variable** — crie exatamente estes 4 nomes:

| Nome exato                             | Cole aqui                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | URL final do site, com barra no fim: `https://<usuário>.github.io/<repositório>/` |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project URL do passo 1                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave Publishable/anon do passo 1                                                 |
| `SUPABASE_PROJECT_REF`                 | referência do projeto do passo 1 (20 letras minúsculas)                           |

Aba **Secrets**, botão **New repository secret** — crie exatamente estes 2 nomes:

| Nome exato              | Cole aqui                       |
| ----------------------- | ------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | token pessoal gerado no passo 1 |
| `SUPABASE_DB_PASSWORD`  | senha do banco do passo 1       |

Use domínio próprio no lugar de `github.io/<repositório>` apenas se ele já estiver configurado em **Settings → Pages**; `NEXT_PUBLIC_APP_URL` precisa refletir a URL real que os visitantes vão acessar.

## 3. Ativar o GitHub Pages

**Settings → Pages → Build and deployment → Source**: selecione **GitHub Actions** (não escolha uma branch).

## 4. Configurar o login no Supabase

**Authentication → URL Configuration**:

- **Site URL**: cole o mesmo valor de `NEXT_PUBLIC_APP_URL`.
- **Redirect URLs**: adicione `<NEXT_PUBLIC_APP_URL>**` (o valor de `NEXT_PUBLIC_APP_URL` seguido de dois asteriscos). Se o projeto não aceitar coringa, adicione as duas URLs completas: `<NEXT_PUBLIC_APP_URL>?auth=callback` e `<NEXT_PUBLIC_APP_URL>?auth=recovery`.

## 5. Executar os workflows

Na aba **Actions** do repositório, nesta ordem:

1. **Configurar Supabase** → **Run workflow**. Aplica as migrations pendentes, transfere a chave interna de assinatura de importação e a origem permitida para a Edge Function, e publica a função `operis`. Não reseta nem semeia o banco.
2. **Publicar Operis no Pages** → **Run workflow**. Valida as variáveis, roda lint/tipos/testes/build e publica `apps/web/out`.

Repita os dois sempre que alterar qualquer variável, secret ou migration.

## 6. Sugestão de mapeamento por IA (opcional)

Sem isto, a importação de planilhas continua funcionando com mapeamento manual. Para habilitar, defina os secrets da própria Edge Function (não são secrets do GitHub) por um destes caminhos:

- Painel: **Edge Functions → operis → Secrets**, com os nomes `OPENAI_API_KEY` e `OPENAI_MODEL`.
- CLI, a partir de uma máquina com a chave: `pnpm exec supabase secrets set OPENAI_API_KEY=... OPENAI_MODEL=... --project-ref <SUPABASE_PROJECT_REF>`.

`OPENAI_MODEL` precisa suportar Structured Outputs na sua conta. Veja [IA](ai.md).

## 7. Verificar

Abra a URL publicada. Se o Supabase não estiver configurado corretamente, a tela de preparação (`/configuracao`) continua aparecendo em vez de dados reais. Depois de um cadastro e confirmação de email bem-sucedidos, teste login, criação de escritório e uma importação com `fixtures/employees-valid.csv`. Consulte [ADR-007](adr/ADR-007-static-pages.md) para as decisões técnicas por trás desta publicação.

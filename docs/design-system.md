# Operis UI

Tokens semânticos em `packages/ui/src/tokens.css`: canvas warm bone, superfície clara, texto graphite, ações jade e IA violeta. Tema claro padrão; escuro e sistema são opções. A distinção reduz a aparência genérica branco/azul, mantém hierarquia e separa ações operacionais das sugestões de IA.

Geist Sans é a família principal por sua consistência e densidade em interfaces; Geist Mono aparece em IDs e competências. Não existe afirmação de superioridade universal de sans-serif. Números em tabelas e indicadores usam tabular-nums. Pesos 400–600, escala de 4 px, raio contido, bordas no lugar de sombras em painéis.

Operis UI fornece Button/CVA, Input, Badge, Avatar, Alert, Panel, PageHeader, EmptyState e Stat. Radix controla o diálogo de busca, foco e Escape. Componentes de domínio ficam nas features. A biblioteca completa de dezenas de controles proposta no prompt será expandida conforme uso concreto.

Densidade: linhas de 48 px ou 40 px. Navegação compactável no desktop e seletor no mobile. Kanban possui alternativa acessível ao arrasto. Formulários têm labels, erros por campo e IDs únicos. `prefers-reduced-motion` desativa animações. As páginas públicas passam pelo axe; isso não equivale a certificação WCAG de todo o produto.

As preferências são persistidas no PostgreSQL e refletidas em cookies SSR para evitar flash. Ao fazer login, os cookies recebem as preferências do banco, incluindo em outro dispositivo. Mudanças feitas em uma sessão já aberta em outro aparelho serão refletidas no próximo login desse aparelho.

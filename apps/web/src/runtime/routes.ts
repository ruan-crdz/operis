export const routes = {
  '/app/auditoria': () => import('@/views/app/auditoria/page'),
  '/app/assistente': () => import('@/views/app/assistente/page'),
  '/app/clientes/novo': () => import('@/views/app/clientes/novo/page'),
  '/app/clientes': () => import('@/views/app/clientes/page'),
  '/app/clientes/[id]': () => import('@/views/app/clientes/[id]/page'),
  '/app/configuracoes/aparencia': () => import('@/views/app/configuracoes/aparencia/page'),
  '/app/configuracoes/equipe': () => import('@/views/app/configuracoes/equipe/page'),
  '/app/configuracoes/organizacao': () => import('@/views/app/configuracoes/organizacao/page'),
  '/app/configuracoes': () => import('@/views/app/configuracoes/page'),
  '/app/configuracoes/perfil': () => import('@/views/app/configuracoes/perfil/page'),
  '/app/departamentos': () => import('@/views/app/departamentos/page'),
  '/app/departamentos/dp': () => import('@/views/app/departamentos/dp/page'),
  '/app/departamentos/dp/pendencias': () => import('@/views/app/departamentos/dp/pendencias/page'),
  '/app/departamentos/dp/competencia': () => import('@/views/app/departamentos/dp/competencia/page'),
  '/app/documentos/enviar': () => import('@/views/app/documentos/enviar/page'),
  '/app/documentos': () => import('@/views/app/documentos/page'),
  '/app/documentos/solicitar': () => import('@/views/app/documentos/solicitar/page'),
  '/app/fila': () => import('@/views/app/fila/page'),
  '/app/importacoes/nova': () => import('@/views/app/importacoes/nova/page'),
  '/app/importacoes': () => import('@/views/app/importacoes/page'),
  '/app/importacoes/[id]': () => import('@/views/app/importacoes/[id]/page'),
  '/app/notificacoes': () => import('@/views/app/notificacoes/page'),
  '/app': () => import('@/views/app/page'),
  '/app/sem-permissao': () => import('@/views/app/sem-permissao/page'),
  '/app/tarefas/nova': () => import('@/views/app/tarefas/nova/page'),
  '/app/tarefas': () => import('@/views/app/tarefas/page'),
  '/app/tarefas/[id]': () => import('@/views/app/tarefas/[id]/page'),
  '/atualizar-senha': () => import('@/views/atualizar-senha/page'),
  '/cadastro': () => import('@/views/cadastro/page'),
  '/configuracao': () => import('@/views/configuracao/page'),
  '/login': () => import('@/views/login/page'),
  '/onboarding': () => import('@/views/onboarding/page'),
  '/': () => import('@/views/page'),
  '/recuperar-senha': () => import('@/views/recuperar-senha/page'),
};
/** Resolves a pathname to its route key (matching `[id]` segments). */
export function matchRoute(pathname: string): { route: keyof typeof routes; id: string } | undefined {
  const exact = Object.keys(routes).find((r) => r === pathname) as keyof typeof routes | undefined;
  if (exact) return { route: exact, id: '' };
  for (const candidate of Object.keys(routes).filter((r) => r.includes('[id]'))) {
    const prefix = candidate.split('[id]')[0]!;
    if (pathname.startsWith(prefix) && /^[0-9a-f-]{36}$/.test(pathname.slice(prefix.length)))
      return { route: candidate as keyof typeof routes, id: pathname.slice(prefix.length) };
  }
  return undefined;
}

import { preferences as localPreferences } from '@/runtime/preferences';
import { redirect } from '@/runtime/navigation';
import { createClient, isConfigured } from '@/client/db/client';
/** Dedupe getUser/getContext across the multiple loaders that run per navigation. */
function memoize<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  const invalidate = () => {
    cached = null;
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('operis:navigation', invalidate);
    window.addEventListener('operis:refresh', invalidate);
    window.addEventListener('hashchange', invalidate);
  }
  return () => (cached ??= loader());
}
export const getUser = memoize(async () => {
  if (!isConfigured()) redirect('/configuracao');
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect('/login');
  return { db, user };
});
export const getContext = memoize(async () => {
  const { db, user } = await getUser();
  const active = (await localPreferences()).get('operis_org')?.value;
  const { data: members, error } = await db
    .from('organization_members')
    .select('*')
    .eq('user_id', user.id)
    .limit(100);
  if (error) throw new Error('Não foi possível carregar seus escritórios.');
  const member = members?.find((m) => m.organization_id === active) ?? members?.[0];
  if (!member) redirect('/onboarding');
  const orgId = member.organization_id;
  const [org, profile, prefs, roles] = await Promise.all([
    db.from('organizations').select('*').eq('id', orgId).single(),
    db.from('profiles').select('*').eq('id', user.id).single(),
    db.from('user_preferences').select('*').eq('id', user.id).single(),
    db.from('member_roles').select('role_id').eq('organization_id', orgId).eq('member_id', member.id),
  ]);
  if (org.error || profile.error || prefs.error || roles.error)
    throw new Error('Não foi possível carregar seu acesso.');
  const roleIds = roles.data.map((r) => r.role_id);
  const permissions = roleIds.length
    ? await db
        .from('role_permissions')
        .select('permission')
        .eq('organization_id', orgId)
        .in('role_id', roleIds)
    : { data: [], error: null };
  if (permissions.error) throw new Error('Não foi possível verificar permissões.');
  return {
    db,
    user,
    orgId,
    organization: org.data,
    profile: profile.data,
    preferences: prefs.data,
    permissions: new Set(permissions.data?.map((p) => p.permission)),
    members,
  };
});
export async function requirePermission(permission: string) {
  const ctx = await getContext();
  if (!ctx.permissions.has(permission)) redirect('/app/sem-permissao');
  return ctx;
}

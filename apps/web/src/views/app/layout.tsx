import { getContext } from '@/client/auth/context';
import { AppShell } from '@/features/shell/navigation';
import { check } from '@/client/actions/helpers';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const { count, error } = await ctx.db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.orgId)
    .eq('user_id', ctx.user.id)
    .is('read_at', null);
  check(error);
  const avatar = ctx.profile.avatar_path
    ? await ctx.db.storage.from('avatars').createSignedUrl(ctx.profile.avatar_path, 300)
    : null;
  return (
    <AppShell
      organization={ctx.organization.name}
      name={ctx.profile.full_name}
      avatar={avatar?.data?.signedUrl ?? null}
      permissions={[...ctx.permissions]}
      collapsed={ctx.preferences.sidebar_collapsed}
      theme={ctx.preferences.theme}
      unread={count ?? 0}
    >
      {children}
    </AppShell>
  );
}

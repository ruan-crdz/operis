import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@operis/types/database';
export type EdgeContext = {
  db: SupabaseClient<Database>;
  user: User;
  orgId: string;
  env: (name: string) => string | undefined;
};
export function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '23505') throw new Error('Este registro já existe. Reabra a lista para continuar.');
  if (error.code === '42501') throw new Error('Você não tem permissão para esta operação.');
  if (error.code === 'P0001') throw new Error(error.message);
  throw new Error(
    'Não foi possível concluir a operação no Supabase. Confira suas permissões e tente novamente.',
  );
}
export async function permit(ctx: EdgeContext, permission: string) {
  const result = await ctx.db.rpc('has_org_permission', { org_id: ctx.orgId, permission });
  check(result.error);
  if (!result.data) throw new Error('Você não tem permissão para esta operação.');
}

import { preferences as localPreferences } from '@/runtime/preferences';
import { z } from 'zod';
import { getContext, requirePermission } from '@/client/auth/context';
import { action, check, id, text, nullable } from './helpers';
export async function saveProfile(form: FormData) {
  return action(async () => {
    const { db, user } = await getContext();
    const values = z
      .object({
        full_name: z.string().trim().min(2).max(180),
        phone: z.string().max(30),
        job_title: z.string().max(100),
      })
      .parse(Object.fromEntries(form));
    const { error } = await db.from('profiles').update(values).eq('id', user.id).select('id').single();
    check(error);

    return { ok: true, message: 'Perfil atualizado.' };
  });
}
export async function saveAppearance(form: FormData) {
  return action(async () => {
    const { db, user } = await getContext();
    const values = z
      .object({ theme: z.enum(['light', 'dark', 'system']), density: z.enum(['comfortable', 'compact']) })
      .parse(Object.fromEntries(form));
    const { error } = await db
      .from('user_preferences')
      .update(values)
      .eq('id', user.id)
      .select('id')
      .single();
    check(error);
    const jar = await localPreferences();
    for (const [key, value] of Object.entries(values))
      jar.set(`operis_${key}`, value);

    return { ok: true, message: 'Aparência salva no seu perfil.' };
  });
}
export async function toggleSidebar(form: FormData) {
  return action(async () => {
    const { db, user } = await getContext();
    const { error } = await db
      .from('user_preferences')
      .update({ sidebar_collapsed: text(form, 'collapsed') === 'true' })
      .eq('id', user.id)
      .select('id')
      .single();
    check(error);
    return { ok: true, message: 'Preferência salva.' };
  });
}
export async function setTheme(form: FormData) {
  return action(async () => {
    const { db, user } = await getContext();
    const theme = z.enum(['light', 'dark', 'system']).parse(text(form, 'theme'));
    const { error } = await db
      .from('user_preferences')
      .update({ theme })
      .eq('id', user.id)
      .select('id')
      .single();
    check(error);
    (await localPreferences()).set('operis_theme', theme);
    return { ok: true, message: 'Tema alterado.' };
  });
}
export async function saveOrganization(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('organization.manage');
    const name = z.string().trim().min(2).max(180).parse(text(form, 'name'));
    const { error } = await db.from('organizations').update({ name }).eq('id', orgId).select('id').single();
    check(error);

    return { ok: true, message: 'Escritório atualizado.' };
  });
}
export async function saveAISetting(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('settings.manage');
    const { error } = await db
      .from('organization_settings')
      .update({ ai_enabled: text(form, 'ai_enabled') === 'true' })
      .eq('organization_id', orgId)
      .select('id')
      .single();
    check(error);

    return { ok: true, message: 'Preferência de inteligência atualizada.' };
  });
}
export async function saveMember(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('members.manage');
    const { error } = await db.rpc('manage_member', {
      org_id: orgId,
      email_address: z.email().parse(text(form, 'email')),
      selected_role: id(form, 'role_id'),
      selected_department: nullable(form, 'department_id') ?? undefined,
    });
    check(error);

    return { ok: true, message: 'Acesso do colaborador atualizado.' };
  });
}
export async function saveDepartment(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('members.manage');
    const name = z.string().trim().min(2).max(100).parse(text(form, 'name'));
    const { error } = await db.from('departments').insert({ name, organization_id: orgId });
    check(error);

    return { ok: true, message: 'Departamento criado.' };
  });
}
export async function markRead(form: FormData) {
  return action(async () => {
    const { db, orgId, user } = await getContext();
    let query = db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('user_id', user.id);
    if (text(form, 'id')) query = query.eq('id', id(form));
    const { error } = await query;
    check(error);

    return { ok: true, message: 'Notificações marcadas como lidas.' };
  });
}

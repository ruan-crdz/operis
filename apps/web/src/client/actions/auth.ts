import { z } from 'zod';
import { preferences as localPreferences } from '@/runtime/preferences';
import { redirect, router, authCallbackUrl } from '@/runtime/navigation';
import { createClient } from '@/client/db/client';
import { getUser, getContext } from '@/client/auth/context';
import { action, check, text } from './helpers';
const credentials = z.object({
  email: z.email('Informe um email válido.'),
  password: z.string().min(10, 'Use pelo menos 10 caracteres.'),
});
export async function login(form: FormData) {
  return action(async () => {
    const values = credentials.parse(Object.fromEntries(form));
    const db = await createClient();
    const { data, error } = await db.auth.signInWithPassword(values);
    if (error) throw new Error('Email ou senha incorretos, ou conta ainda não confirmada.');
    const preferences = await db
      .from('user_preferences')
      .select('theme,density')
      .eq('id', data.user.id)
      .single();
    check(preferences.error);
    const jar = await localPreferences();
    for (const [key, value] of Object.entries(
      preferences.data ?? { theme: 'light', density: 'comfortable' },
    )) {
      jar.set(`operis_${key}`, value);
    }

    redirect('/app');
  });
}
export async function signup(form: FormData) {
  return action(async () => {
    const values = credentials.parse(Object.fromEntries(form));
    const db = await createClient();
    const { error } = await db.auth.signUp({
      ...values,
      options: {
        emailRedirectTo: authCallbackUrl(),
      },
    });
    if (error) throw new Error('Não foi possível criar sua conta. Confira os dados e tente novamente.');
    return { ok: true, message: 'Confira seu email para confirmar a conta e entrar no Operis.' };
  });
}
export async function recoverPassword(form: FormData) {
  return action(async () => {
    const email = z.email('Informe um email válido.').parse(text(form, 'email'));
    const db = await createClient();
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl(true),
    });
    if (error) throw new Error('Não foi possível solicitar a recuperação. Tente novamente em instantes.');
    return { ok: true, message: 'Se houver uma conta com este email, você receberá um link de recuperação.' };
  });
}
export async function updatePassword(form: FormData) {
  return action(async () => {
    const { db } = await getUser();
    const password = z.string().min(10, 'Use pelo menos 10 caracteres.').parse(text(form, 'password'));
    const { error } = await db.auth.updateUser({ password });
    if (error) throw new Error('Não foi possível atualizar a senha. Solicite um novo link.');
    return { ok: true, message: 'Senha atualizada. Você já pode acessar sua operação.' };
  });
}
export async function logout() {
  const db = await createClient();
  const { error } = await db.auth.signOut();
  if (error) throw new Error('Não foi possível encerrar a sessão.');
  (await localPreferences()).delete('operis_org');

  router.replace('/login');
}
export async function onboarding(form: FormData) {
  return action(async () => {
    const { db } = await getUser();
    const org_name = z.string().trim().min(2).max(180).parse(text(form, 'org_name'));
    const person_name = z.string().trim().min(2).max(180).parse(text(form, 'person_name'));
    const department_names = text(form, 'departments')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const { data, error } = await db.rpc('create_organization', { org_name, person_name, department_names });
    check(error);
    if (data)
      (await localPreferences()).set('operis_org', data);
    redirect('/app');
  });
}
export async function switchOrganization(form: FormData) {
  return action(async () => {
    const { members } = await getContext();
    const org = text(form, 'organization_id');
    if (!members?.some((m) => m.organization_id === org))
      throw new Error('Acesso ao escritório não permitido.');
    (await localPreferences()).set('operis_org', org);

    return { ok: true, message: 'Escritório alterado.' };
  });
}

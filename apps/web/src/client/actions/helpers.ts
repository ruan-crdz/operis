import type { ActionResult } from '@operis/types';
import { z } from 'zod';
import { Navigation, router } from '@/runtime/navigation';
export function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
export function nullable(form: FormData, key: string) {
  return text(form, key) || null;
}
export function id(form: FormData, key = 'id') {
  return z.uuid().parse(text(form, key));
}
export function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '23505')
    throw new Error('Este registro já existe. Verifique os dados antes de tentar novamente.');
  if (error.code === '23503')
    throw new Error('O cliente, responsável ou departamento não pertence a este escritório.');
  if (error.code === '42501') throw new Error('Você não tem permissão para esta ação.');
  if (error.code === 'P0001' && /^[A-ZÀ-Úa-zà-ú]/.test(error.message)) throw new Error(error.message);
  console.error(JSON.stringify({ operation: 'database', code: error.code, request_id: crypto.randomUUID() }));
  throw new Error('Não foi possível salvar. Verifique seus dados e tente novamente.');
}
export async function action<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Navigation) {
      router.replace(error.destination);
      return { ok: true, message: 'Redirecionando…' };
    }
    if (error instanceof z.ZodError)
      return {
        ok: false,
        message: 'Revise os campos indicados.',
        fields: Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message])),
      };
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Não foi possível concluir esta ação.',
    };
  }
}

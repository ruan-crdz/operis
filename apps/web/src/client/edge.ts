import { getContext } from './auth/context';
export async function invokeEdge<T = unknown>(operation: string, form: FormData): Promise<T> {
  const { db, orgId } = await getContext();
  form.set('operation', operation);
  form.set('organization_id', orgId);
  const { data, error } = await db.functions.invoke('operis', { body: form });
  if (error) {
    let message =
      'Não foi possível acessar o serviço de arquivos e IA. Confira a publicação da função Operis no Supabase.';
    if ('context' in error && error.context instanceof Response) {
      const result: unknown = await error.context.json().catch(() => null);
      if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string')
        message = result.message;
    }
    throw new Error(message);
  }
  return data as T;
}

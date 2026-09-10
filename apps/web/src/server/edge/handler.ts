import { createClient } from '@supabase/supabase-js';
import type { Database } from '@operis/types/database';
import { competenceSchema } from '@operis/domain';
import { z } from 'zod';
import { readUpload } from '../files';
import { parseSpreadsheet } from '../imports/parser';
import { suggestSpreadsheetMapping, askAssistant, type ChatMessage } from '../ai/gateway';
import { check, permit, type EdgeContext } from './context';
import { createHmac } from 'node:crypto';
const MAX_BODY = 12 * 1024 * 1024;
const value = (form: FormData, key: string) => z.string().parse(form.get(key));
const uuid = (form: FormData, key: string) => z.uuid().parse(value(form, key));
async function limitedForm(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY)
    throw new Error('Arquivo acima do limite permitido.');
  if (!request.body) throw new Error('Envie um arquivo ou uma operação.');
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new Error('Arquivo acima do limite permitido.');
    }
    chunks.push(new Uint8Array(value));
  }
  return new Response(new Blob(chunks), {
    headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
  }).formData();
}
async function upload(ctx: EdgeContext, form: FormData, operation: string) {
  const avatar = operation === 'upload-avatar',
    spreadsheet = operation === 'create-import';
  if (!avatar) await permit(ctx, spreadsheet ? 'imports.create' : 'documents.upload');
  const limit = await ctx.db.rpc('consume_rate_limit', { org_id: ctx.orgId, feature_name: 'upload' });
  check(limit.error);
  if (!limit.data) throw new Error('Limite de uploads atingido. Aguarde um minuto.');
  const file = await readUpload(form, avatar ? 'avatar' : spreadsheet ? 'spreadsheet' : 'document');
  const clientId = avatar ? '' : uuid(form, 'client_id');
  const competence = avatar ? '' : competenceSchema.parse(value(form, 'competence'));
  const sheets = spreadsheet ? await parseSpreadsheet(file.bytes, file.extension) : null;
  if (spreadsheet) {
    const existing = await ctx.db
      .from('imports')
      .select('id')
      .eq('organization_id', ctx.orgId)
      .eq('client_id', clientId)
      .eq('competence', competence)
      .eq('checksum', file.checksum)
      .maybeSingle();
    check(existing.error);
    if (existing.data) return existing.data;
  }
  const path = avatar
    ? `${ctx.user.id}/${crypto.randomUUID()}.${file.extension}`
    : `organizations/${ctx.orgId}/clients/${clientId}/${spreadsheet ? 'imports' : 'documents'}/${crypto.randomUUID()}.${file.extension}`;
  const bucket = avatar ? 'avatars' : 'documents';
  const stored = await ctx.db.storage
    .from(bucket)
    .upload(path, file.bytes, { contentType: file.mime, upsert: false });
  check(stored.error);
  try {
    if (avatar) {
      const profile = await ctx.db.from('profiles').select('avatar_path').eq('id', ctx.user.id).single();
      check(profile.error);
      const saved = await ctx.db
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', ctx.user.id)
        .select('id')
        .single();
      check(saved.error);
      if (profile.data?.avatar_path) await ctx.db.storage.from(bucket).remove([profile.data.avatar_path]);
      return { ok: true };
    }
    if (spreadsheet) {
      const secret = ctx.env('OPERIS_IMPORT_SIGNING_KEY');
      if (!secret)
        throw new Error('Configure a chave de processamento da Operis no Supabase antes de importar.');
      const payload = JSON.stringify({
        actor: ctx.user.id,
        org: ctx.orgId,
        client: clientId,
        competence,
        filename: file.name,
        path,
        checksum: file.checksum,
        workbook: sheets,
        expires: Math.floor(Date.now() / 1000) + 120,
      });
      const signature = createHmac('sha256', secret).update(payload).digest('hex');
      const result = await ctx.db.rpc('create_verified_import', { payload, signature });
      check(result.error);
      return { id: result.data };
    }
    const result = await ctx.db
      .from('documents')
      .insert({
        organization_id: ctx.orgId,
        client_id: clientId,
        competence,
        original_filename: file.name,
        mime_type: file.mime,
        size: file.size,
        checksum: file.checksum,
        storage_path: path,
      });
    check(result.error);
    return { ok: true };
  } catch (error) {
    await ctx.db.storage.from(bucket).remove([path]);
    throw error;
  }
}
export function createHandler(env: (name: string) => string | undefined) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const allowed = (env('ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (origin && !allowed.includes(origin))
      return Response.json({ message: 'Origem não autorizada.' }, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
      return Response.json({ message: 'Método não permitido.' }, { status: 405, headers });
    try {
      const jwt = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if (!jwt)
        return Response.json({ message: 'Entre no Operis para continuar.' }, { status: 401, headers });
      const url = env('SUPABASE_URL'),
        key = env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
      if (!url || !key) throw new Error('O serviço ainda não foi configurado.');
      const db = createClient<Database>(url, key, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const auth = await db.auth.getUser(jwt);
      if (auth.error || !auth.data.user)
        return Response.json({ message: 'Sua sessão expirou. Entre novamente.' }, { status: 401, headers });
      const form = await limitedForm(request);
      const orgId = uuid(form, 'organization_id');
      const member = await db
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', auth.data.user.id)
        .maybeSingle();
      if (member.error || !member.data)
        return Response.json({ message: 'Escritório não autorizado.' }, { status: 403, headers });
      const ctx: EdgeContext = { db, user: auth.data.user, orgId, env };
      const operation = value(form, 'operation');
      if (['upload-avatar', 'upload-document', 'create-import'].includes(operation))
        return Response.json(await upload(ctx, form, operation), { headers });
      if (operation === 'suggest-mapping') {
        await permit(ctx, 'imports.create');
        const id = uuid(form, 'id');
        const item = await db
          .from('imports')
          .select('headers,sheets,sheet_index,header_row')
          .eq('organization_id', orgId)
          .eq('id', id)
          .single();
        check(item.error);
        if (!item.data) throw new Error('Importação não encontrada.');
        const headersData = z.array(z.string()).min(1).parse(item.data.headers);
        const sheets = z.array(z.object({ rows: z.array(z.array(z.string())) })).parse(item.data.sheets);
        return Response.json(
          await suggestSpreadsheetMapping(
            ctx,
            id,
            headersData,
            sheets[item.data.sheet_index]?.rows.slice(item.data.header_row) ?? [],
          ),
          { headers },
        );
      }
      if (operation === 'assistant-chat') {
        const message = z.string().trim().min(1).max(2000).parse(value(form, 'message'));
        const history = z
          .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
          .max(20)
          .parse(JSON.parse(value(form, 'history') || '[]')) as ChatMessage[];
        return Response.json(await askAssistant(ctx, message, history), { headers });
      }
      return Response.json({ message: 'Operação desconhecida.' }, { status: 400, headers });
    } catch (error) {
      return Response.json(
        {
          message:
            error instanceof z.ZodError
              ? 'Revise os campos e o arquivo enviados.'
              : error instanceof Error
                ? error.message
                : 'Não foi possível concluir.',
        },
        { status: 400, headers },
      );
    }
  };
}

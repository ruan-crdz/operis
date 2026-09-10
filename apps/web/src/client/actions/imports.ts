import { z } from 'zod';
import { redirect } from '@/runtime/navigation';
import { mappingSchema } from '@operis/domain';

import { requirePermission } from '@/client/auth/context';
import { invokeEdge } from '@/client/edge';

import type { MappingSuggestions } from '@/server/ai/gateway';
import { action, check, id, text } from './helpers';
export async function createImport(form: FormData) {
  return action(async () => {
    const result = await invokeEdge<{ id: string }>('create-import', form);
    redirect('/app/importacoes/' + result.id);
  });
}
export async function configureImport(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('imports.create');
    const mapping = mappingSchema.parse(JSON.parse(text(form, 'mapping')));
    const { data, error } = await db.rpc('configure_import', {
      import_id: id(form),
      expected_version: z.coerce.number().int().positive().parse(text(form, 'version')),
      selected_sheet: z.coerce.number().int().min(0).parse(text(form, 'sheet')),
      selected_header: z.coerce.number().int().min(1).max(50).parse(text(form, 'header')),
      selected_mapping: mapping,
    });
    check(error);
    // The wizard may request AI immediately after this save. Let the caller
    // refresh after the compound operation so it keeps its local suggestions.
    return { ok: true, message: 'Etapa salva. Você pode continuar depois.', data };
  });
}
export async function validateImport(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('imports.create');
    const { data, error } = await db.rpc('validate_import', {
      import_id: id(form),
      expected_version: z.coerce.number().int().positive().parse(text(form, 'version')),
    });
    check(error);

    return { ok: true, message: 'Validação concluída. Confira o resultado antes de aprovar.', data };
  });
}
export async function approveImport(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('imports.approve');
    if (text(form, 'acknowledge') !== 'yes') throw new Error('Confirme a revisão antes de aprovar.');
    const importId = id(form);
    const { error } = await db.rpc('approve_import', {
      import_id: importId,
      expected_version: z.coerce.number().int().positive().parse(text(form, 'version')),
      approval_comment: 'Revisão confirmada na interface.',
    });
    check(error);

    return { ok: true, message: 'Importação aprovada e colocada na fila de processamento.' };
  });
}
export async function processImport(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('imports.approve');
    const { data, error } = await db.rpc('process_import', { import_id: id(form) });
    check(error);

    return { ok: true, message: `Importação concluída. ${data} registros persistidos.` };
  });
}
export async function saveTemplate(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('imports.create');
    const { error } = await db.rpc('save_import_template', {
      import_id: id(form),
      template_name: z.string().trim().min(2).max(180).parse(text(form, 'name')),
    });
    check(error);

    return { ok: true, message: 'Template salvo para reutilizar em novas importações.' };
  });
}
export async function suggestMapping(form: FormData) {
  return action(async () => ({
    ok: true,
    message: 'Sugestões prontas para sua revisão.',
    data: await invokeEdge<MappingSuggestions>('suggest-mapping', form),
  }));
}

import { z } from 'zod';
import { competenceSchema, occurrenceTypes, workflowStepRunStatuses } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { redirect } from '@/runtime/navigation';
import { action, check, id, nullable, text } from './helpers';

const version = (form: FormData) => z.coerce.number().int().positive().parse(text(form, 'version'));

export async function startDpProcess(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('processes.manage');
    const clientId = id(form, 'client_id');
    const competence = competenceSchema.parse(text(form, 'competence'));
    const owner = nullable(form, 'owner_id');
    const reviewer = nullable(form, 'reviewer_id');
    const due = nullable(form, 'due_at');
    const { data, error } = await db.rpc('start_department_process', {
      org_id: orgId,
      target_client: clientId,
      target_competence: competence,
      process_owner: owner ?? undefined,
      process_reviewer: reviewer ?? undefined,
      due: due ?? undefined,
    });
    check(error);
    redirect(`/app/departamentos/dp/competencia?client=${clientId}&competence=${competence}&process=${data}`);
  });
}

export async function startAllDpProcesses(form: FormData) {
  return action(async () => {
    const { db, orgId } = await requirePermission('processes.manage');
    const competence = competenceSchema.parse(text(form, 'competence'));
    const { data: clients, error: clientsError } = await db
      .from('clients')
      .select('id')
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .limit(500);
    check(clientsError);
    if (!clients?.length) throw new Error('Cadastre ao menos um cliente ativo antes de abrir a competência.');
    const { data, error } = await db.rpc('bulk_start_department_processes', {
      org_id: orgId,
      client_ids: clients.map((client) => client.id),
      target_competence: competence,
      process_owner: nullable(form, 'owner_id') ?? undefined,
      due: nullable(form, 'due_at') ?? undefined,
    });
    check(error);
    return { ok: true, message: `${data ?? clients.length} processos disponíveis para ${competence}.` };
  });
}

export async function updateDpCollection(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('dp.manage');
    const { error } = await db.rpc('update_collection_item', {
      item_id: id(form),
      next_status: z
        .enum([
          'not_requested',
          'requested',
          'waiting',
          'received',
          'validated',
          'not_applicable',
          'rejected',
        ])
        .parse(text(form, 'status')),
      next_response: z
        .enum(['pending', 'has_information', 'no_occurrence', 'not_applicable'])
        .parse(text(form, 'response')),
      document: nullable(form, 'document_id') ?? undefined,
      item_notes: text(form, 'notes'),
    });
    check(error);
    return { ok: true, message: 'Item de coleta atualizado.' };
  });
}

export async function addDpOccurrence(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('occurrences.manage');
    const employee = nullable(form, 'employee_id');
    const document = nullable(form, 'document_id');
    const sourceImport = nullable(form, 'source_import_id');
    [employee, document, sourceImport].filter(Boolean).forEach((value) => z.uuid().parse(value));
    const { error } = await db.rpc('create_dp_occurrence', {
      process: id(form, 'process_id'),
      occurrence_type: z.enum(occurrenceTypes).parse(text(form, 'type')),
      employee: employee!,
      effective: z.iso.date().parse(text(form, 'effective_date')),
      occurrence_source: z
        .enum(['manual', 'spreadsheet', 'document', 'client', 'integration', 'ai_assisted'])
        .parse(text(form, 'source')),
      occurrence_notes: text(form, 'notes'),
      idempotency: crypto.randomUUID(),
      document: document ?? undefined,
      source_import: sourceImport ?? undefined,
    });
    check(error);
    return { ok: true, message: 'Movimentação registrada com rastreabilidade.' };
  });
}

export async function updateDpStep(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('processes.manage');
    const { error } = await db.rpc('update_workflow_step_run', {
      run_id: id(form),
      expected_version: version(form),
      next_status: z.enum(workflowStepRunStatuses).parse(text(form, 'status')),
      next_assignee: nullable(form, 'assignee_id') ?? undefined,
      step_note: text(form, 'note'),
    });
    check(error);
    return { ok: true, message: 'Etapa atualizada.' };
  });
}

export async function validateDpProcess(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('dp.manage');
    const { error } = await db.rpc('validate_department_process', { process: id(form, 'process_id') });
    check(error);
    return { ok: true, message: 'Validação determinística concluída.' };
  });
}

export async function resolveDpValidation(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('dp.review');
    const { error } = await db.rpc('resolve_dp_validation', {
      result_id: id(form),
      resolution_text: z.string().trim().min(5).max(2000).parse(text(form, 'resolution')),
    });
    check(error);
    return { ok: true, message: 'Inconsistência resolvida com justificativa.' };
  });
}

export async function requestDpReview(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('processes.manage');
    const { error } = await db.rpc('request_process_review', {
      process_id: id(form, 'process_id'),
      expected_version: version(form),
    });
    check(error);
    return { ok: true, message: 'Processo enviado para revisão.' };
  });
}

export async function reviewDpProcess(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('processes.review');
    const { error } = await db.rpc('review_department_process', {
      process_id: id(form, 'process_id'),
      expected_version: version(form),
      review_decision: z.enum(['approved', 'returned']).parse(text(form, 'decision')),
      review_comment: text(form, 'comment'),
    });
    check(error);
    return {
      ok: true,
      message:
        text(form, 'decision') === 'approved' ? 'Processo aprovado.' : 'Processo devolvido para ajuste.',
    };
  });
}

export async function completeDpProcess(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('processes.manage');
    const { error } = await db.rpc('complete_department_process', {
      process_id: id(form, 'process_id'),
      expected_version: version(form),
    });
    check(error);
    return { ok: true, message: 'Competência concluída e evidências preservadas.' };
  });
}

export async function reopenDpProcess(form: FormData) {
  return action(async () => {
    const { db } = await requirePermission('processes.review');
    const { error } = await db.rpc('reopen_department_process', {
      process_id: id(form, 'process_id'),
      reason: z.string().trim().min(5).max(1000).parse(text(form, 'reason')),
    });
    check(error);
    return { ok: true, message: 'Processo reaberto e registrado na auditoria.' };
  });
}

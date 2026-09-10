import { z } from 'zod';
import { validateJournal, ledgerAccountSchema, expectedNormalBalance } from '@operis/domain';
import { getContext } from '@/client/auth/context';
import { invokeEdge } from '@/client/edge';
import { action, check, id, text } from './helpers';
export async function ensureLedgerBook(form: FormData) {
  return action(async () => {
    const { db, orgId } = await getContext();
    const { data, error } = await db.rpc('ensure_ledger_book', { org_id: orgId, target_client: id(form, 'client_id') });
    check(error);
    return { ok: true, message: 'Contabilidade ativada para este cliente.', data };
  });
}
export async function openLedgerPeriod(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const competence = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use uma competência válida (AAAA-MM).')
      .parse(text(form, 'competence'));
    const { error } = await db.rpc('open_ledger_period', { book: id(form, 'book_id'), target_competence: competence });
    check(error);
    return { ok: true, message: 'Competência aberta.' };
  });
}
export async function createLedgerAccount(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const values = ledgerAccountSchema.parse({
      code: text(form, 'code'),
      name: text(form, 'name'),
      account_type: text(form, 'account_type'),
      normal_balance: text(form, 'normal_balance') || expectedNormalBalance(text(form, 'account_type') as never),
      is_postable: text(form, 'is_postable') !== 'false',
      parent_id: text(form, 'parent_id') || null,
    });
    const { error } = await db.rpc('create_ledger_account', {
      book: id(form, 'book_id'),
      account_code: values.code,
      account_name: values.name,
      account_kind: values.account_type,
      account_normal_balance: values.normal_balance,
      postable: values.is_postable,
      parent: values.parent_id ?? undefined,
    });
    check(error);
    return { ok: true, message: 'Conta criada.' };
  });
}
export async function createLedgerEntry(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const lines = JSON.parse(text(form, 'lines'));
    const totals = validateJournal(lines);
    const { error } = await db.rpc('create_ledger_entry', {
      book: id(form, 'book_id'),
      period: id(form, 'period_id'),
      entry_date: text(form, 'entry_date'),
      entry_description: text(form, 'description'),
      entry_reference: text(form, 'reference'),
      idempotency: crypto.randomUUID(),
      entry_lines: totals.lines,
    });
    check(error);
    return { ok: true, message: 'Lançamento salvo como rascunho.' };
  });
}
export async function postLedgerEntry(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const { error } = await db.rpc('post_ledger_entry', {
      entry: id(form),
      expected_version: z.coerce.number().int().positive().parse(text(form, 'version')),
    });
    check(error);
    return { ok: true, message: 'Lançamento postado.' };
  });
}
export async function discardLedgerEntry(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const { error } = await db.rpc('discard_ledger_entry', {
      entry: id(form),
      expected_version: z.coerce.number().int().positive().parse(text(form, 'version')),
    });
    check(error);
    return { ok: true, message: 'Rascunho descartado.' };
  });
}
export async function reverseLedgerEntry(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const reason = z.string().trim().min(5, 'Explique o motivo do estorno.').parse(text(form, 'reason'));
    const { error } = await db.rpc('reverse_ledger_entry', {
      entry: id(form),
      target_period_id: id(form, 'period_id'),
      reversal_date: text(form, 'reversal_date'),
      reversal_reason: reason,
      idempotency: crypto.randomUUID(),
    });
    check(error);
    return { ok: true, message: 'Estorno lançado e postado.' };
  });
}
export async function closeLedgerPeriod(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const { error } = await db.rpc('close_ledger_period', {
      period: id(form, 'period_id'),
      expected_revision: z.coerce.number().int().positive().parse(text(form, 'revision')),
    });
    check(error);
    return { ok: true, message: 'Competência fechada.' };
  });
}
export async function reopenLedgerPeriod(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const reason = z.string().trim().min(5, 'Explique o motivo da reabertura.').parse(text(form, 'reason'));
    const { error } = await db.rpc('reopen_ledger_period', {
      period: id(form, 'period_id'),
      reopen_explanation: reason,
    });
    check(error);
    return { ok: true, message: 'Competência reaberta.' };
  });
}
export async function createBankAccount(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const { error } = await db.rpc('create_ledger_bank_account', {
      book: id(form, 'book_id'),
      for_account: id(form, 'ledger_account_id'),
      bank: text(form, 'bank_name'),
      label: text(form, 'account_label'),
    });
    check(error);
    return { ok: true, message: 'Conta bancária cadastrada.' };
  });
}
export async function importBankStatement(form: FormData) {
  return action(async () => {
    const result = await invokeEdge<{ id: string; rows: number }>('import-bank-statement', form);
    return { ok: true, message: `Extrato importado: ${result.rows} lançamentos.` };
  });
}
export async function createClassificationRule(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const matchValue = z.string().trim().min(2, 'Informe um trecho do histórico.').parse(text(form, 'match_value'));
    const { error } = await db.rpc('create_ledger_classification_rule', {
      book: id(form, 'book_id'),
      value: matchValue,
      counterpart: id(form, 'counterpart_account_id'),
      rule_priority: z.coerce.number().int().min(1).max(1000).parse(text(form, 'priority') || '100'),
    });
    check(error);
    return { ok: true, message: 'Regra de classificação criada.' };
  });
}
export async function createEntryFromBankTransaction(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const { error } = await db.rpc('create_entry_from_bank_transaction', {
      transaction_id: id(form, 'transaction_id'),
      counterpart: id(form, 'counterpart_account_id'),
      entry_description: text(form, 'description'),
    });
    check(error);
    return { ok: true, message: 'Lançamento criado a partir do extrato.' };
  });
}
export async function ignoreBankTransaction(form: FormData) {
  return action(async () => {
    const { db } = await getContext();
    const { error } = await db.rpc('ignore_bank_transaction', { transaction_id: id(form, 'transaction_id') });
    check(error);
    return { ok: true, message: 'Lançamento do extrato ignorado.' };
  });
}

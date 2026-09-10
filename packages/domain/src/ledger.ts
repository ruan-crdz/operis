import Decimal from 'decimal.js';
import { z } from 'zod';
import { parseMoney } from './index';

export const ledgerAccountTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export const ledgerNormalBalances = ['debit', 'credit'] as const;
export const ledgerSides = ['debit', 'credit'] as const;

export type LedgerAccountType = (typeof ledgerAccountTypes)[number];
export type LedgerNormalBalance = (typeof ledgerNormalBalances)[number];
export type LedgerSide = (typeof ledgerSides)[number];

export const ledgerAccountLabels: Record<LedgerAccountType, string> = {
  asset: 'Ativo',
  liability: 'Passivo',
  equity: 'Patrimônio líquido',
  revenue: 'Receita',
  expense: 'Despesa',
};

export const ledgerAccountSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código.').max(60),
  name: z.string().trim().min(2, 'Informe o nome da conta.').max(180),
  account_type: z.enum(ledgerAccountTypes),
  normal_balance: z.enum(ledgerNormalBalances),
  is_postable: z.boolean(),
  parent_id: z.uuid().nullable(),
});

export const ledgerLineSchema = z.object({
  account_id: z.uuid('Selecione uma conta.'),
  side: z.enum(ledgerSides),
  amount: z.string().transform((value, context) => {
    try {
      const parsed = parseMoney(value);
      if (!new Decimal(parsed).greaterThan(0)) throw new Error();
      return parsed;
    } catch {
      context.addIssue({ code: 'custom', message: 'Informe um valor positivo com até 2 casas decimais.' });
      return z.NEVER;
    }
  }),
  memo: z.string().trim().max(500).default(''),
});

export type LedgerLineInput = z.input<typeof ledgerLineSchema>;

export function journalTotals(lines: LedgerLineInput[]) {
  let debit = new Decimal(0);
  let credit = new Decimal(0);
  const normalized = lines.map((line) => ledgerLineSchema.parse(line));
  for (const line of normalized) {
    if (line.side === 'debit') debit = debit.plus(line.amount);
    else credit = credit.plus(line.amount);
  }
  return {
    debit: debit.toFixed(2),
    credit: credit.toFixed(2),
    difference: debit.minus(credit).abs().toFixed(2),
    balanced: normalized.length >= 2 && debit.isPositive() && debit.equals(credit),
    lines: normalized,
  };
}

export function validateJournal(lines: LedgerLineInput[]) {
  const totals = journalTotals(lines);
  if (!totals.lines.some((line) => line.side === 'debit')) throw new Error('Inclua ao menos um débito.');
  if (!totals.lines.some((line) => line.side === 'credit')) throw new Error('Inclua ao menos um crédito.');
  if (!totals.balanced)
    throw new Error(
      `O lançamento não fecha: débitos R$ ${totals.debit} e créditos R$ ${totals.credit}.`,
    );
  return totals;
}

export function expectedNormalBalance(accountType: LedgerAccountType): LedgerNormalBalance {
  return accountType === 'asset' || accountType === 'expense' ? 'debit' : 'credit';
}

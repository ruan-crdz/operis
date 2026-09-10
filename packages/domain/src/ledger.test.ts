import { describe, expect, it } from 'vitest';
import { expectedNormalBalance, journalTotals, validateJournal } from './ledger';

const account = '00000000-0000-4000-8000-000000000001';

describe('ledger domain', () => {
  it('balances multi-line entries with decimal arithmetic', () => {
    const result = validateJournal([
      { account_id: account, side: 'debit', amount: '3.333,33', memo: '' },
      { account_id: account, side: 'debit', amount: '1.666,67', memo: '' },
      { account_id: account, side: 'credit', amount: '5.000,00', memo: '' },
    ]);
    expect(result).toMatchObject({ debit: '5000.00', credit: '5000.00', difference: '0.00' });
  });

  it('rejects an entry that differs by one cent', () => {
    expect(() =>
      validateJournal([
        { account_id: account, side: 'debit', amount: '5.000,00', memo: '' },
        { account_id: account, side: 'credit', amount: '4.999,99', memo: '' },
      ]),
    ).toThrow('não fecha');
  });

  it('does not accept zero, negative or a single side', () => {
    expect(() =>
      journalTotals([
        { account_id: account, side: 'debit', amount: '0', memo: '' },
        { account_id: account, side: 'credit', amount: '0', memo: '' },
      ]),
    ).toThrow();
    expect(() =>
      validateJournal([
        { account_id: account, side: 'debit', amount: '10', memo: '' },
        { account_id: account, side: 'debit', amount: '10', memo: '' },
      ]),
    ).toThrow('crédito');
  });

  it('derives the usual normal balance by account type', () => {
    expect(expectedNormalBalance('asset')).toBe('debit');
    expect(expectedNormalBalance('expense')).toBe('debit');
    expect(expectedNormalBalance('revenue')).toBe('credit');
    expect(expectedNormalBalance('liability')).toBe('credit');
  });
});

import { Badge, EmptyState, Panel } from '@operis/ui';
import { check } from '@/client/actions/helpers';
import { ActionForm } from '@/features/forms/action-form';
import { mapLedgerStatementAccount } from '@/client/actions/ledger';
import type { EdgeContext } from '@/server/edge/context';
type Db = EdgeContext['db'];
type Account = { id: string; code: string; name: string; account_type: string };
const lineLabels: Record<string, string> = {
  gross_revenue: 'Receita bruta',
  deductions: 'Deduções',
  cost: 'Custos',
  expense: 'Despesas',
  unmapped_revenue: 'Receita sem mapeamento (pendência)',
  unmapped_expense: 'Despesa sem mapeamento (pendência)',
};
export async function LedgerStatements({
  db,
  bookId,
  from,
  to,
  accounts,
  permissions,
}: {
  db: Db;
  bookId: string;
  from: string;
  to: string;
  accounts: Account[];
  permissions: Set<string>;
}) {
  const income = await db.rpc('ledger_income_statement', { book: bookId, date_from: from, date_to: to });
  check(income.error);
  const balance = await db.rpc('ledger_balance_sheet', { book: bookId, as_of: to });
  check(balance.error);
  const incomeRows = (income.data ?? []) as unknown as { line_key: string; amount: number }[];
  const balanceRows = (balance.data ?? []) as unknown as {
    account_type: string;
    account_id: string;
    code: string;
    name: string;
    balance: number;
  }[];
  const amountFor = (key: string) => Number(incomeRows.find((r) => r.line_key === key)?.amount ?? 0);
  const grossRevenue = amountFor('gross_revenue');
  const deductions = amountFor('deductions');
  const cost = amountFor('cost');
  const expense = amountFor('expense');
  const netRevenue = grossRevenue - deductions;
  const grossProfit = netRevenue - cost;
  const result = grossProfit - expense;
  const pending = incomeRows.filter((r) => r.line_key.startsWith('unmapped'));
  const revenueExpenseAccounts = accounts.filter((a) => a.account_type === 'revenue' || a.account_type === 'expense');
  const asset = balanceRows.filter((r) => r.account_type === 'asset');
  const liability = balanceRows.filter((r) => r.account_type === 'liability');
  const equity = balanceRows.filter((r) => r.account_type === 'equity');
  const sum = (rows: { balance: number }[]) => rows.reduce((total, r) => total + Number(r.balance), 0);
  const totalAsset = sum(asset);
  const totalLiability = sum(liability);
  const totalEquity = sum(equity) + result;
  const balances = Math.abs(totalAsset - (totalLiability + totalEquity)) < 0.005;
  return (
    <>
      <Panel className="panel-pad">
        <h2 style={{ marginBottom: 16 }}>DRE ({from} a {to})</h2>
        {pending.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {pending.map((p) => (
              <p key={p.line_key} className="alert alert-warning" style={{ marginBottom: 8 }}>
                {lineLabels[p.line_key]}: R$ {Number(p.amount).toFixed(2)} — mapeie as contas abaixo antes de
                confiar neste resultado.
              </p>
            ))}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <td>Receita bruta</td>
                <td className="mono">{grossRevenue.toFixed(2)}</td>
              </tr>
              <tr>
                <td>(-) Deduções</td>
                <td className="mono">{deductions.toFixed(2)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Receita líquida</strong>
                </td>
                <td className="mono">
                  <strong>{netRevenue.toFixed(2)}</strong>
                </td>
              </tr>
              <tr>
                <td>(-) Custos</td>
                <td className="mono">{cost.toFixed(2)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Lucro bruto</strong>
                </td>
                <td className="mono">
                  <strong>{grossProfit.toFixed(2)}</strong>
                </td>
              </tr>
              <tr>
                <td>(-) Despesas</td>
                <td className="mono">{expense.toFixed(2)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Resultado do período</strong>
                </td>
                <td className="mono">
                  <strong>{result.toFixed(2)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {permissions.has('ledger.accounts.manage') && revenueExpenseAccounts.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            <h3 style={{ marginBottom: 16 }}>Mapear conta na DRE</h3>
            <ActionForm
              action={mapLedgerStatementAccount}
              submit="Salvar mapeamento"
              columns
              hidden={{ book_id: bookId }}
              fields={[
                {
                  name: 'account_id',
                  label: 'Conta',
                  type: 'select',
                  options: revenueExpenseAccounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
                },
                {
                  name: 'line_key',
                  label: 'Linha da DRE',
                  type: 'select',
                  options: [
                    { value: 'gross_revenue', label: 'Receita bruta (contas de Receita)' },
                    { value: 'deductions', label: 'Deduções (contas de Receita)' },
                    { value: 'cost', label: 'Custos (contas de Despesa)' },
                    { value: 'expense', label: 'Despesas (contas de Despesa)' },
                  ],
                },
              ]}
            />
          </div>
        )}
      </Panel>
      <Panel className="panel-pad">
        <div className="panel-heading">
          <h2>Balanço patrimonial (em {to})</h2>
          <Badge tone={balances ? 'success' : 'danger'}>
            {balances ? 'Ativo = Passivo + PL' : 'Equação patrimonial não fecha'}
          </Badge>
        </div>
        {balanceRows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Grupo</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {asset.map((r) => (
                  <tr key={r.account_id}>
                    <td>
                      {r.code} · {r.name}
                    </td>
                    <td>Ativo</td>
                    <td className="mono">{Number(r.balance).toFixed(2)}</td>
                  </tr>
                ))}
                {liability.map((r) => (
                  <tr key={r.account_id}>
                    <td>
                      {r.code} · {r.name}
                    </td>
                    <td>Passivo</td>
                    <td className="mono">{Number(r.balance).toFixed(2)}</td>
                  </tr>
                ))}
                {equity.map((r) => (
                  <tr key={r.account_id}>
                    <td>
                      {r.code} · {r.name}
                    </td>
                    <td>Patrimônio líquido</td>
                    <td className="mono">{Number(r.balance).toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Resultado do período (ainda não encerrado)</strong>
                  </td>
                  <td>Patrimônio líquido</td>
                  <td className="mono">
                    <strong>{result.toFixed(2)}</strong>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <strong>Total do Ativo</strong>
                  </td>
                  <td></td>
                  <td className="mono">
                    <strong>{totalAsset.toFixed(2)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Total do Passivo + PL</strong>
                  </td>
                  <td></td>
                  <td className="mono">
                    <strong>{(totalLiability + totalEquity).toFixed(2)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState title="Sem contas patrimoniais" description="Cadastre contas de Ativo, Passivo ou PL no plano." />
        )}
      </Panel>
    </>
  );
}

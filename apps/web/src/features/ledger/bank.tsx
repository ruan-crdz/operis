import { EmptyState, Panel } from '@operis/ui';
import { formatDate } from '@operis/domain';
import { check } from '@/client/actions/helpers';
import { ActionButton, ActionForm } from '@/features/forms/action-form';
import {
  createBankAccount,
  importBankStatement,
  createClassificationRule,
  createEntryFromBankTransaction,
  ignoreBankTransaction,
} from '@/client/actions/ledger';
import type { EdgeContext } from '@/server/edge/context';
type Db = EdgeContext['db'];
type Account = { id: string; code: string; name: string };
export async function LedgerBankSection({
  db,
  orgId,
  bookId,
  accounts,
  assetAccounts,
  permissions,
  selectedBank,
}: {
  db: Db;
  orgId: string;
  bookId: string;
  accounts: Account[];
  assetAccounts: Account[];
  permissions: Set<string>;
  selectedBank?: string;
}) {
  const bankAccounts = await db
    .from('ledger_bank_accounts')
    .select('id,bank_name,account_label,ledger_account_id,ledger_accounts(code,name)')
    .eq('organization_id', orgId)
    .eq('book_id', bookId)
    .order('created_at');
  check(bankAccounts.error);
  const rules = await db
    .from('ledger_classification_rules')
    .select('id,match_value,priority,counterpart_account_id,ledger_accounts(code,name)')
    .eq('organization_id', orgId)
    .eq('book_id', bookId)
    .eq('active', true)
    .order('priority');
  check(rules.error);
  const bank = selectedBank || bankAccounts.data?.[0]?.id;
  const transactions = bank
    ? await db
        .from('ledger_bank_transactions')
        .select('id,posted_date,amount,description,status,matched_entry_id')
        .eq('organization_id', orgId)
        .eq('bank_account_id', bank)
        .order('posted_date', { ascending: false })
        .limit(100)
    : { data: [], error: null };
  check(transactions.error);
  return (
    <Panel className="panel-pad">
      <h2 style={{ marginBottom: 16 }}>Contas bancárias e extrato</h2>
      {bankAccounts.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Banco</th>
                <th>Identificação</th>
                <th>Conta contábil</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.bank_name}</td>
                  <td>{b.account_label || '—'}</td>
                  <td>
                    {b.ledger_accounts?.code} · {b.ledger_accounts?.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Nenhuma conta bancária"
          description="Vincule uma conta do plano (tipo Ativo) ao banco para importar extratos."
        />
      )}
      {permissions.has('ledger.accounts.manage') && (
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <h3 style={{ marginBottom: 16 }}>Nova conta bancária</h3>
          <ActionForm
            action={createBankAccount}
            submit="Cadastrar"
            columns
            hidden={{ book_id: bookId }}
            fields={[
              { name: 'bank_name', label: 'Banco', required: true },
              { name: 'account_label', label: 'Agência/Conta (opcional)' },
              {
                name: 'ledger_account_id',
                label: 'Conta contábil (Ativo)',
                type: 'select',
                options: assetAccounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
              },
            ]}
          />
        </div>
      )}
      {bank && permissions.has('ledger.entries.create') && (
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <h3 style={{ marginBottom: 16 }}>Importar extrato (OFX ou CSV)</h3>
          <ActionForm
            action={importBankStatement}
            submit="Importar"
            hidden={{ bank_account_id: bank }}
            fields={[{ name: 'file', label: 'Arquivo do extrato', type: 'file', required: true }]}
          />
        </div>
      )}
      {bank && (
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <h3 style={{ marginBottom: 16 }}>Lançamentos do extrato</h3>
          {transactions.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.data.map((t) => {
                    const suggestion = rules.data?.find((r) =>
                      t.description.toLowerCase().includes(r.match_value.toLowerCase()),
                    );
                    return (
                      <tr key={t.id}>
                        <td>{formatDate(t.posted_date)}</td>
                        <td>{t.description}</td>
                        <td className="mono">{Number(t.amount).toFixed(2)}</td>
                        <td>{t.status === 'matched' ? 'Conciliado' : t.status === 'ignored' ? 'Ignorado' : 'Pendente'}</td>
                        <td className="actions">
                          {t.status === 'unmatched' && permissions.has('ledger.entries.create') && (
                            <>
                              <ActionForm
                                action={createEntryFromBankTransaction}
                                submit="Classificar"
                                hidden={{ transaction_id: t.id }}
                                fields={[
                                  {
                                    name: 'counterpart_account_id',
                                    label: 'Contrapartida',
                                    type: 'select',
                                    value: suggestion?.counterpart_account_id,
                                    options: accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
                                  },
                                  { name: 'description', label: 'Histórico (opcional)', value: t.description },
                                ]}
                              />
                              <ActionButton action={ignoreBankTransaction} fields={{ transaction_id: t.id }} variant="ghost">
                                Ignorar
                              </ActionButton>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhum lançamento importado" description="Importe um extrato acima." />
          )}
        </div>
      )}
      {permissions.has('ledger.accounts.manage') && (
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <h3 style={{ marginBottom: 16 }}>Regras de classificação</h3>
          {rules.data?.length ? (
            <ul>
              {rules.data.map((r) => (
                <li key={r.id}>
                  “{r.match_value}” → {r.ledger_accounts?.code} · {r.ledger_accounts?.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nenhuma regra cadastrada.</p>
          )}
          <ActionForm
            action={createClassificationRule}
            submit="Criar regra"
            columns
            hidden={{ book_id: bookId }}
            fields={[
              { name: 'match_value', label: 'Trecho do histórico', required: true },
              {
                name: 'counterpart_account_id',
                label: 'Conta sugerida',
                type: 'select',
                options: accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
              },
            ]}
          />
        </div>
      )}
    </Panel>
  );
}

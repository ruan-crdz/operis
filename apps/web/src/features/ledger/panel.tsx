import Link from '@/runtime/link';
import { FilterForm } from '@/runtime/link';
import { Badge, EmptyState, Panel } from '@operis/ui';
import { formatDate } from '@operis/domain';
import { check } from '@/client/actions/helpers';
import { ActionButton, ActionForm } from '@/features/forms/action-form';
import {
  ensureLedgerBook,
  openLedgerPeriod,
  createLedgerAccount,
  postLedgerEntry,
  discardLedgerEntry,
  reverseLedgerEntry,
  closeLedgerPeriod,
  reopenLedgerPeriod,
} from '@/client/actions/ledger';
import { LedgerEntryForm } from './entry-form';
import { LedgerBankSection } from './bank';
import type { EdgeContext } from '@/server/edge/context';
type Db = EdgeContext['db'];
const statusLabel: Record<string, string> = { draft: 'Rascunho', posted: 'Postado', reversed: 'Estornado' };
type JournalRow = {
  entry_id: string;
  entry_number: number;
  entry_date: string;
  account_code: string;
  account_name: string;
  description: string;
  side: string;
  amount: number;
  line_number: number;
};
type LedgerRow = { entry_id: string; entry_date: string; description: string; debit: number; credit: number; balance: number };
type TrialBalanceRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
};
function monthRange(competence: string) {
  const [year, month] = competence.split('-').map(Number);
  const from = `${competence}-01`;
  const to = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
  return { from, to };
}
export async function LedgerPanel({
  db,
  orgId,
  clientId,
  permissions,
  competence: requestedCompetence,
  account: requestedAccount,
  bank: requestedBank,
}: {
  db: Db;
  orgId: string;
  clientId: string;
  permissions: Set<string>;
  competence?: string;
  account?: string;
  bank?: string;
}) {
  if (!permissions.has('ledger.read'))
    return (
      <Panel className="panel-pad">
        <EmptyState
          title="Sem acesso à contabilidade"
          description="Seu papel de acesso não inclui a área contábil deste cliente."
        />
      </Panel>
    );
  const book = await db
    .from('ledger_books')
    .select('id')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .eq('code', 'principal')
    .maybeSingle();
  check(book.error);
  if (!book.data)
    return (
      <Panel className="panel-pad">
        <EmptyState
          title="Contabilidade ainda não ativada"
          description="Ative a escrituração deste cliente para abrir competências, lançar e postar partidas."
          action={
            permissions.has('ledger.accounts.manage') ? (
              <ActionButton action={ensureLedgerBook} fields={{ client_id: clientId }}>
                Ativar contabilidade
              </ActionButton>
            ) : undefined
          }
        />
      </Panel>
    );
  const bookId = book.data.id;
  const periods = await db
    .from('ledger_periods')
    .select('id,competence,status,revision,next_entry_number')
    .eq('organization_id', orgId)
    .eq('book_id', bookId)
    .order('competence', { ascending: false })
    .limit(24);
  check(periods.error);
  const competence = requestedCompetence || periods.data?.[0]?.competence || new Date().toISOString().slice(0, 7);
  const period = periods.data?.find((p) => p.competence === competence);
  const accounts = await db
    .from('ledger_accounts')
    .select('id,code,name,account_type,normal_balance,is_postable')
    .eq('organization_id', orgId)
    .eq('book_id', bookId)
    .order('code');
  check(accounts.error);
  const postableAccounts = (accounts.data ?? []).filter((a) => a.is_postable);
  const syntheticAccounts = (accounts.data ?? []).filter((a) => !a.is_postable);
  const assetPostableAccounts = postableAccounts.filter((a) => a.account_type === 'asset');
  const { from, to } = monthRange(competence);
  const entries = period
    ? await db
        .from('ledger_journal_entries')
        .select('id,entry_number,entry_date,description,status,version,ledger_journal_lines(amount,side)')
        .eq('organization_id', orgId)
        .eq('period_id', period.id)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [], error: null };
  check(entries.error);
  const [journal, trialBalance] = period
    ? await Promise.all([
        db.rpc('ledger_journal', { book: bookId, date_from: from, date_to: to }),
        db.rpc('ledger_trial_balance', { book: bookId, date_from: from, date_to: to }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  check(journal.error);
  check(trialBalance.error);
  const journalRows = journal.data as unknown as JournalRow[] | null;
  const trialBalanceRows = trialBalance.data as unknown as TrialBalanceRow[] | null;
  const account = requestedAccount || postableAccounts[0]?.id;
  const ledgerRows = period && account
    ? await db.rpc('ledger_general_ledger', { book: bookId, target_account: account, date_from: from, date_to: to })
    : { data: [], error: null };
  check(ledgerRows.error);
  const ledgerAccountRows = ledgerRows.data as unknown as LedgerRow[] | null;
  return (
    <div className="stack">
      <Panel className="panel-pad">
        <div className="ledger-toolbar">
          <FilterForm className="table-toolbar">
            <input type="hidden" name="tab" value="ledger" />
            <select name="competence" defaultValue={competence} aria-label="Competência contábil">
              {periods.data?.map((p) => (
                <option key={p.id} value={p.competence}>
                  {p.competence} · {p.status === 'closed' ? 'Fechada' : 'Aberta'}
                </option>
              ))}
              {!periods.data?.some((p) => p.competence === competence) && (
                <option value={competence}>{competence}</option>
              )}
            </select>
            <button className="button button-secondary" type="submit">
              Ver competência
            </button>
          </FilterForm>
          {permissions.has('ledger.entries.create') && (
            <ActionForm
              action={openLedgerPeriod}
              hidden={{ book_id: bookId }}
              submit="Abrir competência"
              fields={[{ name: 'competence', label: 'Nova competência', type: 'month', required: true }]}
            />
          )}
        </div>
      </Panel>
      {!period ? (
        <Panel className="panel-pad">
          <EmptyState
            title="Competência ainda não aberta"
            description={`Abra a competência ${competence} para lançar partidas.`}
          />
        </Panel>
      ) : (
        <>
          <Panel className="panel-pad">
            <div className="panel-heading">
              <h2>Competência {period.competence}</h2>
              <Badge tone={period.status === 'closed' ? 'success' : 'neutral'}>
                {period.status === 'closed' ? 'Fechada' : 'Aberta'}
              </Badge>
            </div>
            {period.status === 'open' && permissions.has('ledger.close') && (
              <ActionButton
                action={closeLedgerPeriod}
                fields={{ period_id: period.id, revision: String(period.revision) }}
                confirm="Fechar a competência? Não será mais possível postar lançamentos nela."
              >
                Fechar competência
              </ActionButton>
            )}
            {period.status === 'closed' && permissions.has('ledger.reopen') && (
              <ActionForm
                action={reopenLedgerPeriod}
                submit="Reabrir"
                hidden={{ period_id: period.id }}
                fields={[{ name: 'reason', label: 'Motivo da reabertura', required: true }]}
              />
            )}
          </Panel>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 16 }}>Plano de contas</h2>
            {accounts.data?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome</th>
                      <th>Tipo</th>
                      <th>Natureza</th>
                      <th>Sintética/Analítica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.data.map((a) => (
                      <tr key={a.id}>
                        <td className="mono">{a.code}</td>
                        <td>{a.name}</td>
                        <td>{a.account_type}</td>
                        <td>{a.normal_balance === 'debit' ? 'Devedora' : 'Credora'}</td>
                        <td>{a.is_postable ? 'Analítica' : 'Sintética'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Nenhuma conta" description="Cadastre a primeira conta do plano abaixo." />
            )}
            {permissions.has('ledger.accounts.manage') && (
              <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: 16 }}>Nova conta</h3>
                <ActionForm
                  action={createLedgerAccount}
                  submit="Criar conta"
                  columns
                  hidden={{ book_id: bookId }}
                  fields={[
                    { name: 'code', label: 'Código', required: true },
                    { name: 'name', label: 'Nome', required: true },
                    {
                      name: 'account_type',
                      label: 'Tipo',
                      type: 'select',
                      options: [
                        { value: 'asset', label: 'Ativo' },
                        { value: 'liability', label: 'Passivo' },
                        { value: 'equity', label: 'Patrimônio líquido' },
                        { value: 'revenue', label: 'Receita' },
                        { value: 'expense', label: 'Despesa' },
                      ],
                    },
                    {
                      name: 'normal_balance',
                      label: 'Natureza',
                      type: 'select',
                      options: [
                        { value: 'debit', label: 'Devedora' },
                        { value: 'credit', label: 'Credora' },
                      ],
                    },
                    {
                      name: 'is_postable',
                      label: 'Recebe lançamentos?',
                      type: 'select',
                      value: 'true',
                      options: [
                        { value: 'true', label: 'Sim, analítica' },
                        { value: 'false', label: 'Não, sintética (agrupadora)' },
                      ],
                    },
                    {
                      name: 'parent_id',
                      label: 'Conta sintética pai (opcional)',
                      type: 'select',
                      options: [
                        { value: '', label: 'Nenhuma' },
                        ...syntheticAccounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
                      ],
                    },
                  ]}
                />
              </div>
            )}
          </Panel>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 16 }}>Lançamentos</h2>
            {entries.data?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nº</th>
                      <th>Data</th>
                      <th>Histórico</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.data.map((e) => {
                      const lines = (e as { ledger_journal_lines?: { amount: number; side: string }[] })
                        .ledger_journal_lines ?? [];
                      const total = lines
                        .filter((l) => l.side === 'debit')
                        .reduce((sum, l) => sum + Number(l.amount), 0);
                      return (
                        <tr key={e.id}>
                          <td className="mono">{e.entry_number ?? '—'}</td>
                          <td>{formatDate(e.entry_date)}</td>
                          <td>{e.description}</td>
                          <td className="mono">{total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td>
                            <Badge tone={e.status === 'posted' ? 'success' : e.status === 'reversed' ? 'neutral' : 'warning'}>
                              {statusLabel[e.status]}
                            </Badge>
                          </td>
                          <td className="actions">
                            {e.status === 'draft' && permissions.has('ledger.entries.post') && (
                              <ActionButton action={postLedgerEntry} fields={{ id: e.id, version: String(e.version) }}>
                                Postar
                              </ActionButton>
                            )}
                            {e.status === 'draft' && permissions.has('ledger.entries.create') && (
                              <ActionButton
                                action={discardLedgerEntry}
                                fields={{ id: e.id, version: String(e.version) }}
                                variant="danger"
                                confirm="Descartar este rascunho?"
                              >
                                Descartar
                              </ActionButton>
                            )}
                            {e.status === 'posted' && permissions.has('ledger.entries.post') && (
                              <ActionForm
                                action={reverseLedgerEntry}
                                submit="Estornar"
                                hidden={{ id: e.id, period_id: period.id, reversal_date: to }}
                                fields={[{ name: 'reason', label: 'Motivo do estorno', required: true }]}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Nenhum lançamento nesta competência" description="Registre o primeiro abaixo." />
            )}
            {period.status === 'open' && permissions.has('ledger.entries.create') && postableAccounts.length >= 2 && (
              <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: 16 }}>Novo lançamento</h3>
                <LedgerEntryForm bookId={bookId} periodId={period.id} accounts={postableAccounts} defaultDate={from} />
              </div>
            )}
          </Panel>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 16 }}>
              Diário ({from} a {to})
            </h2>
            {journalRows?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nº</th>
                      <th>Data</th>
                      <th>Conta</th>
                      <th>Histórico</th>
                      <th>Débito</th>
                      <th>Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalRows.map((r) => (
                      <tr key={`${r.entry_id}-${r.line_number}`}>
                          <td className="mono">{r.entry_number}</td>
                          <td>{formatDate(r.entry_date)}</td>
                          <td>
                            {r.account_code} · {r.account_name}
                          </td>
                          <td>{r.description}</td>
                          <td className="mono">{r.side === 'debit' ? Number(r.amount).toFixed(2) : ''}</td>
                          <td className="mono">{r.side === 'credit' ? Number(r.amount).toFixed(2) : ''}</td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Sem lançamentos postados" description="Poste um lançamento para ver o Diário." />
            )}
          </Panel>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 16 }}>Razão</h2>
            <FilterForm className="table-toolbar" style={{ marginBottom: 16 }}>
              <input type="hidden" name="tab" value="ledger" />
              <input type="hidden" name="competence" value={competence} />
              <select name="account" defaultValue={account} aria-label="Conta do razão">
                {postableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
              <button className="button button-secondary" type="submit">
                Ver razão
              </button>
            </FilterForm>
            {ledgerAccountRows?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Histórico</th>
                      <th>Débito</th>
                      <th>Crédito</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerAccountRows?.map((r) => (
                      <tr key={r.entry_id}>
                        <td>{formatDate(r.entry_date)}</td>
                        <td>{r.description}</td>
                        <td className="mono">{Number(r.debit).toFixed(2) || ''}</td>
                        <td className="mono">{Number(r.credit).toFixed(2) || ''}</td>
                        <td className="mono">{Number(r.balance).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Sem movimento nesta conta" description="Selecione outra conta ou competência." />
            )}
          </Panel>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 16 }}>Balancete</h2>
            {trialBalanceRows?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Débitos do período</th>
                      <th>Créditos do período</th>
                      <th>Saldo devedor</th>
                      <th>Saldo credor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalanceRows.map((r) => (
                      <tr key={r.account_id}>
                        <td>
                          <Link href={`?tab=ledger&competence=${competence}&account=${r.account_id}`}>
                            {r.account_code} · {r.account_name}
                          </Link>
                        </td>
                        <td className="mono">{Number(r.period_debit).toFixed(2)}</td>
                        <td className="mono">{Number(r.period_credit).toFixed(2)}</td>
                        <td className="mono">{Number(r.closing_debit).toFixed(2) || ''}</td>
                        <td className="mono">{Number(r.closing_credit).toFixed(2) || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Nenhuma conta analítica" description="Cadastre contas no plano acima." />
            )}
          </Panel>
        </>
      )}
      {await LedgerBankSection({
        db,
        orgId,
        bookId,
        accounts: postableAccounts,
        assetAccounts: assetPostableAccounts,
        permissions,
        selectedBank: requestedBank,
      })}
    </div>
  );
}

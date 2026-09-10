'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, useToast } from '@operis/ui';
import { journalTotals, type LedgerLineInput } from '@operis/domain';
import { invokeAction } from '@/features/forms/invoke-action';
import { createLedgerEntry } from '@/client/actions/ledger';
import { useRouter } from '@/runtime/navigation';
type Account = { id: string; code: string; name: string };
export function LedgerEntryForm({
  bookId,
  periodId,
  accounts,
  defaultDate,
}: {
  bookId: string;
  periodId: string;
  accounts: Account[];
  defaultDate: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LedgerLineInput[]>([
    { account_id: accounts[0]?.id ?? '', side: 'debit', amount: '', memo: '' },
    { account_id: accounts[0]?.id ?? '', side: 'credit', amount: '', memo: '' },
  ]);
  const [pending, setPending] = useState(false);
  let totals: ReturnType<typeof journalTotals> | null = null;
  try {
    totals = journalTotals(lines.filter((l) => l.amount));
  } catch {
    totals = null;
  }
  function updateLine(index: number, patch: Partial<LedgerLineInput>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  async function submit() {
    setPending(true);
    try {
      const form = new FormData();
      form.set('book_id', bookId);
      form.set('period_id', periodId);
      form.set('entry_date', date);
      form.set('description', description);
      form.set('reference', reference);
      form.set('lines', JSON.stringify(lines));
      const response = await invokeAction(createLedgerEntry, form);
      toast.show(response.message, response.ok ? 'success' : 'danger');
      if (response.ok) {
        setDescription('');
        setReference('');
        setLines([
          { account_id: accounts[0]?.id ?? '', side: 'debit', amount: '', memo: '' },
          { account_id: accounts[0]?.id ?? '', side: 'credit', amount: '', memo: '' },
        ]);
        router.refresh();
      }
    } catch {
      toast.show('Não foi possível salvar o lançamento.', 'danger');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="stack">
      <div className="form-grid">
        <div className="field">
          <label>Data</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field span-full">
          <label>Histórico</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Pagamento de aluguel de setembro"
          />
        </div>
        <div className="field">
          <label>Referência (opcional)</label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {lines.map((line, index) => (
          <div key={index} className="ledger-line-row">
            <select
              value={line.account_id}
              onChange={(e) => updateLine(index, { account_id: e.target.value })}
              aria-label="Conta"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <select
              value={line.side}
              onChange={(e) => updateLine(index, { side: e.target.value as 'debit' | 'credit' })}
              aria-label="Natureza"
            >
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
            </select>
            <Input
              placeholder="0,00"
              value={line.amount}
              onChange={(e) => updateLine(index, { amount: e.target.value })}
              aria-label="Valor"
            />
            <Input
              placeholder="Memo (opcional)"
              value={line.memo}
              onChange={(e) => updateLine(index, { memo: e.target.value })}
              aria-label="Memo"
            />
            <button
              type="button"
              className="button button-ghost button-icon"
              aria-label="Remover partida"
              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              disabled={lines.length <= 2}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setLines((current) => [
              ...current,
              { account_id: accounts[0]?.id ?? '', side: 'debit', amount: '', memo: '' },
            ])
          }
        >
          <Plus size={16} />
          Adicionar partida
        </Button>
      </div>
      <div className="ledger-totals">
        <span>Débitos: {totals?.debit ?? '0.00'}</span>
        <span>Créditos: {totals?.credit ?? '0.00'}</span>
        <span className={totals?.balanced ? 'ledger-balanced' : 'ledger-unbalanced'}>
          {totals?.balanced ? 'Balanceado' : `Diferença: ${totals?.difference ?? '—'}`}
        </span>
      </div>
      <div className="form-actions">
        <Button
          loading={pending}
          disabled={!totals?.balanced || !description.trim() || accounts.length === 0}
          onClick={submit}
        >
          Salvar rascunho
        </Button>
      </div>
    </div>
  );
}

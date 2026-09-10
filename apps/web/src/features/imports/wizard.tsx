'use client';
import Link from '@/runtime/link';
import { invokeAction } from '@/features/forms/invoke-action';
import { useState } from 'react';
import { useRouter } from '@/runtime/navigation';
import {
  flexRender,
  tableFeatures,
  rowPaginationFeature,
  createPaginatedRowModel,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Check, FileSpreadsheet, Sparkles, Save, ArrowRight } from 'lucide-react';
import { Alert, Badge, Button, Panel } from '@operis/ui';
import {
  targetFields,
  fieldLabels,
  validateMapping,
  compareSchemas,
  type Mapping,
  type ImportIssue,
} from '@operis/domain';
import {
  configureImport,
  validateImport,
  suggestMapping,
  approveImport,
  processImport,
  saveTemplate,
} from '@/client/actions/imports';
import { ActionButton, ActionForm } from '@/features/forms/action-form';
import type { Tables } from '@operis/types/database';
import type { MappingSuggestions } from '@/server/ai/gateway';
type Sheet = { name: string; rows: string[][] };
type Validation = { issues: ImportIssue[]; valid: number; ignored: number; total: number };
export type WizardData = {
  item: Tables<'imports'>;
  sheets: Sheet[];
  savedMapping: Mapping;
  validation: Validation | null;
  templates: { id: string; name: string; headers: string[]; mapping: Mapping }[];
  canEdit: boolean;
  canApprove: boolean;
  aiConfigured: boolean;
};
const previewFeatures = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel() });
function Preview({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const columns: ColumnDef<typeof previewFeatures, string[]>[] = headers.map((header, i) => ({
    id: String(i),
    header,
    accessorFn: (row) => row[i] ?? '',
  }));
  const table = useTable({
    features: previewFeatures,
    data: rows,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });
  return (
    <Panel>
      <div className="panel-heading">
        <h2>Prévia do arquivo</h2>
        <Badge>{rows.length} linhas</Badge>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getAllCells().map((c) => (
                  <td key={c.id}>{String(c.getValue())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          Página {table.state.pagination.pageIndex + 1} de {Math.max(1, table.getPageCount())}
        </span>
        <div className="actions">
          <Button
            size="sm"
            variant="secondary"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Próxima
          </Button>
        </div>
      </div>
    </Panel>
  );
}
export function ImportWizard({
  item,
  sheets,
  savedMapping,
  validation,
  templates,
  canEdit,
  canApprove,
  aiConfigured,
}: WizardData) {
  const router = useRouter();
  const [sheet, setSheet] = useState(item.sheet_index);
  const [header, setHeader] = useState(item.header_row);
  const [mapping, setMapping] = useState<Mapping>(savedMapping);
  const [version, setVersion] = useState(item.version);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [suggestions, setSuggestions] = useState<MappingSuggestions | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [templateDiff, setTemplateDiff] = useState('');
  const rows = sheets[sheet]?.rows ?? [],
    headers = (rows[header - 1] ?? []).map((h) => h.trim()),
    dataRows = rows.slice(header);
  const dirty =
    sheet !== item.sheet_index ||
    header !== item.header_row ||
    JSON.stringify(mapping) !== JSON.stringify(savedMapping);
  const locked = ['approved', 'processing', 'completed', 'cancelled'].includes(item.status) || !canEdit;
  const makeForm = () => {
    const form = new FormData();
    Object.entries({
      id: item.id,
      version: String(version),
      sheet: String(sheet),
      header: String(header),
      mapping: JSON.stringify(mapping),
    }).forEach(([k, v]) => form.set(k, v));
    return form;
  };
  async function save(andValidate = false) {
    setPending(true);
    setFeedback(null);
    try {
      const errors = andValidate ? validateMapping(headers, mapping) : [];
      if (errors.length) {
        setFeedback({ ok: false, message: errors.join(' ') });
        return;
      }
      const result = await invokeAction(configureImport, makeForm());
      if (!result.ok) {
        setFeedback(result);
        return;
      }
      const next = result.data ?? version + 1;
      setVersion(next);
      if (andValidate) {
        const form = makeForm();
        form.set('version', String(next));
        const validated = await invokeAction(validateImport, form);
        setFeedback(validated);
      } else setFeedback(result);
      router.refresh();
    } catch {
      setFeedback({ ok: false, message: 'Não foi possível salvar. Tente novamente.' });
    } finally {
      setPending(false);
    }
  }
  const step =
    item.status === 'completed'
      ? 4
      : ['approved', 'processing', 'failed'].includes(item.status)
        ? 3
        : item.status === 'awaiting_approval'
          ? 2
          : 1;
  return (
    <div className="stack">
      <div className="stepper" aria-label="Etapas da importação">
        {[
          'Arquivo recebido',
          'Configurar e mapear',
          'Validar e revisar',
          'Aprovar e processar',
          'Resultado',
        ].map((label, i) => (
          <div
            key={label}
            className={`step ${i <= step ? 'active' : ''}`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span>{i < step ? <Check size={12} /> : i + 1}</span>
            {label}
          </div>
        ))}
      </div>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <span className="actions">
          <FileSpreadsheet size={18} />
          {item.original_filename}
          <Badge>
            {sheets.length} {sheets.length === 1 ? 'planilha' : 'planilhas'}
          </Badge>
        </span>
        <Link href={`/api/imports/${item.id}/file`} className="button button-secondary button-sm">
          Baixar original
        </Link>
      </div>
      {feedback && <Alert tone={feedback.ok ? 'success' : 'danger'}>{feedback.message}</Alert>}
      {item.status === 'completed' ? (
        <>
          <Alert tone="success">
            Importação concluída: {item.row_count} colaboradores foram persistidos nesta competência. Os
            valores são os informados no arquivo; nenhum cálculo de folha foi realizado.
          </Alert>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 20 }}>Reutilize este mapeamento</h2>
            {canEdit && (
              <ActionForm
                action={saveTemplate}
                hidden={{ id: item.id }}
                submit="Salvar template"
                fields={[
                  {
                    name: 'name',
                    label: 'Nome do template',
                    required: true,
                    placeholder: 'Ex.: Colaboradores mensais — formato do cliente',
                  },
                ]}
              />
            )}
          </Panel>
        </>
      ) : (
        <>
          <Panel className="panel-pad">
            <h2 style={{ marginBottom: 20 }}>Configuração do arquivo</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="sheet">Planilha</label>
                <select
                  id="sheet"
                  value={sheet}
                  disabled={locked || pending}
                  onChange={(e) => {
                    setSheet(Number(e.target.value));
                    setMapping({});
                    setSuggestions(null);
                  }}
                >
                  {sheets.map((s, i) => (
                    <option value={i} key={s.name}>
                      {s.name} · {Math.max(0, s.rows.length - 1)} linhas após a primeira
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="header">Linha do cabeçalho</label>
                <input
                  id="header"
                  className="input"
                  type="number"
                  min={1}
                  max={Math.min(rows.length, 50)}
                  value={header}
                  disabled={locked || pending}
                  onChange={(e) => {
                    setHeader(Number(e.target.value) || 1);
                    setMapping({});
                    setSuggestions(null);
                  }}
                />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
              Selecione o cabeçalho antes de mapear. O arquivo original é preservado sem alterações.
            </p>
          </Panel>
          <Panel>
            <div className="panel-heading">
              <div>
                <h2>Mapeamento de colunas</h2>
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Conecte cada coluna ao campo correspondente do Operis.
                </p>
              </div>
              <Button
                variant="ai"
                disabled={locked || pending || !aiConfigured}
                loading={pending}
                onClick={async () => {
                  setPending(true);
                  try {
                    const saved = await invokeAction(configureImport, makeForm());
                    if (!saved.ok) {
                      setFeedback(saved);
                      return;
                    }
                    setVersion(saved.data ?? version + 1);
                    const form = makeForm();
                    const response = await invokeAction(suggestMapping, form);
                    setFeedback(response);
                    if (response.ok && response.data) setSuggestions(response.data);
                  } catch {
                    setFeedback({
                      ok: false,
                      message: 'A sugestão não foi concluída. Continue manualmente.',
                    });
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <Sparkles size={16} />
                Sugerir com IA
              </Button>
            </div>
            {!aiConfigured && (
              <div className="ai-note" style={{ margin: 20 }}>
                OpenAI não configurada ou desativada. O mapeamento manual continua disponível.
              </div>
            )}
            {templates.length > 0 && !locked && (
              <div className="table-toolbar">
                <label htmlFor="template">Reutilizar template</label>
                <select
                  id="template"
                  defaultValue=""
                  onChange={(e) => {
                    const template = templates.find((t) => t.id === e.target.value);
                    if (!template) return;
                    if (
                      Object.keys(mapping).length &&
                      !window.confirm(
                        'Aplicar o template substituirá os mapeamentos atuais. Deseja continuar?',
                      )
                    )
                      return;
                    const diff = compareSchemas(template.headers, headers);
                    setTemplateDiff(
                      diff.added.length || diff.removed.length
                        ? `Estrutura alterada: ${diff.added.length} colunas novas (${diff.added.join(', ') || 'nenhuma'}) e ${diff.removed.length} removidas (${diff.removed.join(', ') || 'nenhuma'}). Possíveis renomeações precisam de revisão manual.`
                        : 'A estrutura corresponde ao template. Revise os destinos antes de validar.',
                    );
                    setMapping(
                      Object.fromEntries(
                        Object.entries(template.mapping).filter(([key]) => headers.includes(key)),
                      ),
                    );
                  }}
                >
                  <option value="">Selecione um template</option>
                  {templates.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {templateDiff && (
              <p className="alert alert-warning" style={{ margin: 16 }}>
                {templateDiff}
              </p>
            )}
            {headers.map((column, i) => {
              const suggestion = suggestions?.suggestions.find((s) => s.sourceIndex === i);
              return (
                <div className="mapping-grid" key={`${i}-${column}`}>
                  <div>
                    <h3>{column || `Coluna ${i + 1} sem título`}</h3>
                    <small>
                      {dataRows
                        .slice(0, 3)
                        .map((row) => row[i] || 'vazio')
                        .join(' · ')}
                    </small>
                    {suggestion && (
                      <div className="ai-note" style={{ marginTop: 12 }}>
                        Sugestão IA:{' '}
                        {suggestion.targetField === 'ignore'
                          ? 'Ignorar'
                          : fieldLabels[suggestion.targetField]}{' '}
                        · Confiança {{ high: 'alta', medium: 'média', low: 'baixa' }[suggestion.confidence]}{' '}
                        (heurística)<p style={{ marginTop: 8 }}>{suggestion.reason}</p>
                        <Button
                          variant="ai"
                          size="sm"
                          style={{ marginTop: 8 }}
                          disabled={locked || pending}
                          onClick={() => {
                            if (
                              mapping[column] &&
                              mapping[column] !== 'ignore' &&
                              !window.confirm('Substituir a escolha manual desta coluna pela sugestão da IA?')
                            )
                              return;
                            setMapping((old) => ({ ...old, [column]: suggestion.targetField }));
                          }}
                        >
                          Aplicar sugestão
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor={`mapping-${i}`}>Campo Operis para {column || `coluna ${i + 1}`}</label>
                    <select
                      id={`mapping-${i}`}
                      value={mapping[column] ?? 'ignore'}
                      disabled={locked || pending}
                      onChange={(e) =>
                        setMapping((old) => ({ ...old, [column]: e.target.value as Mapping[string] }))
                      }
                    >
                      <option value="ignore">Não importar esta coluna</option>
                      {targetFields.map((field) => (
                        <option key={field} value={field}>
                          {fieldLabels[field]}
                          {['employee_name', 'employee_cpf'].includes(field) ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
            {!locked && (
              <div className="panel-pad actions">
                <Button variant="secondary" loading={pending} onClick={() => save()}>
                  <Save size={16} />
                  Salvar progresso
                </Button>
                <Button loading={pending} onClick={() => save(true)}>
                  Validar e revisar <ArrowRight size={16} />
                </Button>
                <small className="muted">Nome e CPF são obrigatórios.</small>
              </div>
            )}
          </Panel>
          {validation && (
            <Panel>
              <div className="panel-heading">
                <h2>Revisão da importação</h2>
                <Badge tone={validation.issues.length ? 'danger' : 'success'}>
                  {validation.issues.length ? 'Correções necessárias' : 'Pronta para aprovação'}
                </Badge>
              </div>
              <div className="panel-pad">
                <div className="actions" style={{ marginBottom: 20 }}>
                  <Badge>{validation.total} linhas</Badge>
                  <Badge tone="success">{validation.valid} válidas</Badge>
                  <Badge tone="danger">{validation.issues.length} inconsistências</Badge>
                  <Badge>{validation.ignored} vazias ignoradas</Badge>
                </div>
                {validation.issues.length ? (
                  <>
                    <Alert tone="danger">
                      Corrija o mapeamento ou envie um arquivo corrigido. Linhas com erro bloqueiam a
                      importação inteira.
                    </Alert>
                    <div className="table-wrap" style={{ marginTop: 20 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Linha</th>
                            <th>Campo</th>
                            <th>Inconsistência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validation.issues.slice(0, 100).map((issue, i) => (
                            <tr key={i}>
                              <td>{issue.row}</td>
                              <td>{fieldLabels[issue.field as keyof typeof fieldLabels] ?? issue.field}</td>
                              <td>{issue.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {validation.issues.length > 100 && (
                      <p className="muted">
                        Exibindo as primeiras 100 inconsistências. Todos os erros permanecem registrados.
                      </p>
                    )}
                  </>
                ) : item.status === 'awaiting_approval' && canApprove ? (
                  <div className="stack">
                    {dirty && (
                      <Alert>Salve e valide novamente os mapeamentos alterados antes de aprovar.</Alert>
                    )}
                    <label className="actions">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      Revisei o arquivo, os mapeamentos e os {validation.valid} registros. Autorizo a
                      importação.
                    </label>
                    <Button
                      disabled={!acknowledged || pending || dirty}
                      loading={pending}
                      onClick={async () => {
                        setPending(true);
                        try {
                          const form = makeForm();
                          form.set('acknowledge', 'yes');
                          const response = await invokeAction(approveImport, form);
                          setFeedback(response);
                          if (response.ok) router.refresh();
                        } finally {
                          setPending(false);
                        }
                      }}
                    >
                      Aprovar importação
                    </Button>
                  </div>
                ) : item.status === 'awaiting_approval' ? (
                  <Alert>Aguardando revisão de um membro com permissão para aprovar importações.</Alert>
                ) : null}
              </div>
            </Panel>
          )}
          {['approved', 'processing', 'failed'].includes(item.status) && (
            <Panel className="panel-pad">
              <h2 style={{ marginBottom: 12 }}>
                {item.status === 'failed' ? 'Processamento interrompido' : 'Importação aprovada'}
              </h2>
              <p className="muted" style={{ marginBottom: 20 }}>
                O processamento está registrado na fila. Você pode executar agora; o worker agendado também
                retoma processos pendentes. Cliques repetidos não duplicam registros.
              </p>
              {canApprove && (
                <ActionButton action={processImport} fields={{ id: item.id }} variant="primary">
                  {item.status === 'failed' ? 'Tentar processar novamente' : 'Processar agora'}
                </ActionButton>
              )}
            </Panel>
          )}
        </>
      )}
      <Preview headers={headers} rows={dataRows} />
      <p className="muted mono">Referência da importação: {item.correlation_id}</p>
    </div>
  );
}

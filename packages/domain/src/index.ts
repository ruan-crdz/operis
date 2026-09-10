import { z } from 'zod';
import Decimal from 'decimal.js';
export * from './workflows';
export * from './ledger';

export const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use uma competência válida (AAAA-MM).')
  .refine((v) => Number(v.slice(0, 4)) >= 1900 && Number(v.slice(0, 4)) <= 9998, 'Ano fora do intervalo.');
export type Competence = z.infer<typeof competenceSchema>;
export function shiftCompetence(value: string, months: number): Competence {
  competenceSchema.parse(value);
  const [year = 0, month = 0] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return competenceSchema.parse(
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
  );
}
export function formatCompetence(value: string) {
  competenceSchema.parse(value);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}-01T12:00:00Z`),
  );
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(
        new Date(value.length === 10 ? `${value}T12:00:00Z` : value),
      )
    : 'Sem prazo';
}
export function money(value: string) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
export function parseMoney(value: string): string {
  const clean = value.trim().replace(/^R\$\s*/, '');
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(clean) && !/^-?\d+(?:\.\d{1,2})?$/.test(clean))
    throw new Error('Valor monetário inválido.');
  return money(clean.includes(',') ? clean.replaceAll('.', '').replace(',', '.') : clean);
}
export function validCpf(value: string) {
  const cpf = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for (let size = 9; size <= 10; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(cpf[size])) return false;
  }
  return true;
}
export const taskStatuses = [
  'backlog',
  'waiting_client',
  'ready',
  'in_progress',
  'review',
  'blocked',
  'completed',
] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export const statusLabels: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  waiting_client: 'Aguardando cliente',
  ready: 'Pronto',
  in_progress: 'Em andamento',
  review: 'Em revisão',
  blocked: 'Bloqueado',
  completed: 'Concluído',
};
export const priorityLabels: Record<string, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};
export function canTransitionTask(next: TaskStatus, reason: string | null, hasOpenDependencies = false) {
  return (
    !(next === 'blocked' && !reason?.trim()) &&
    !(hasOpenDependencies && ['in_progress', 'completed'].includes(next))
  );
}
export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe a razão social.').max(180),
  trade_name: z.string().trim().max(180).default(''),
  tax_id: z.string().trim().max(18).default(''),
  email: z.union([z.email('Email inválido.'), z.literal('')]).default(''),
  tax_regime: z.enum(['simples', 'presumido', 'real', 'other']).default('simples'),
});
export const taskSchema = z
  .object({
    title: z.string().trim().min(3, 'O título precisa de pelo menos 3 caracteres.').max(200),
    description: z.string().trim().max(5000).default(''),
    client_id: z.uuid('Selecione um cliente.'),
    competence: competenceSchema,
    department_id: z.uuid().nullable(),
    assignee_id: z.uuid().nullable(),
    due_date: z.iso.date().nullable(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    status: z.enum(taskStatuses),
    blocked_reason: z.string().trim().max(1000).nullable(),
  })
  .refine((v) => canTransitionTask(v.status, v.blocked_reason), {
    message: 'Descreva o motivo do bloqueio.',
    path: ['blocked_reason'],
  });
export const targetFields = ['employee_name', 'employee_cpf', 'salary', 'admission_date'] as const;
export type TargetField = (typeof targetFields)[number];
export const fieldLabels: Record<TargetField, string> = {
  employee_name: 'Nome do colaborador',
  employee_cpf: 'CPF',
  salary: 'Salário informado',
  admission_date: 'Data de admissão',
};
export const mappingSchema = z.record(z.string(), z.enum([...targetFields, 'ignore']));
export type Mapping = z.infer<typeof mappingSchema>;
export type ImportIssue = { row: number; field: string; severity: 'error' | 'warning'; message: string };
export type EmployeeInput = {
  employee_name: string;
  employee_cpf: string;
  salary: string | null;
  admission_date: string | null;
};
export function normalizeHeader(header: string) {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
export function schemaFingerprint(headers: string[]) {
  return headers.map(normalizeHeader).sort().join('|');
}
export function compareSchemas(previous: string[], current: string[]) {
  return {
    added: current.filter((h) => !previous.map(normalizeHeader).includes(normalizeHeader(h))),
    removed: previous.filter((h) => !current.map(normalizeHeader).includes(normalizeHeader(h))),
  };
}
export function validateMapping(headers: string[], mapping: Mapping): string[] {
  const errors: string[] = [];
  const values = Object.entries(mapping)
    .filter(([key, value]) => headers.includes(key) && value !== 'ignore')
    .map(([, value]) => value);
  for (const field of ['employee_name', 'employee_cpf'] as const)
    if (!values.includes(field)) errors.push(`Mapeie o campo obrigatório: ${fieldLabels[field]}.`);
  if (new Set(values).size !== values.length)
    errors.push('Um campo de destino não pode receber duas colunas.');
  if (Object.keys(mapping).some((key) => !headers.includes(key)))
    errors.push('O mapeamento contém coluna ausente no arquivo.');
  return errors;
}
function parseDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  if (!z.iso.date().safeParse(normalized).success)
    throw new Error('Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD.');
  return normalized;
}
export function validateRows(headers: string[], rows: string[][], mapping: Mapping, headerRow = 1) {
  const issues: ImportIssue[] = [];
  const records: EmployeeInput[] = [];
  const seen = new Set<string>();
  let ignored = 0;
  for (const [index, cells] of rows.entries()) {
    if (cells.every((cell) => !cell.trim())) {
      ignored++;
      continue;
    }
    const row = index + headerRow + 1;
    const mapped: Partial<Record<TargetField, string>> = {};
    headers.forEach((header, i) => {
      const field = mapping[header];
      if (field && field !== 'ignore') mapped[field] = (cells[i] ?? '').trim();
    });
    const start = issues.length;
    if (!mapped.employee_name || mapped.employee_name.length < 2)
      issues.push({
        row,
        field: 'employee_name',
        severity: 'error',
        message: 'Nome obrigatório (mínimo 2 caracteres).',
      });
    const cpf = (mapped.employee_cpf ?? '').replace(/\D/g, '');
    if (!validCpf(cpf))
      issues.push({
        row,
        field: 'employee_cpf',
        severity: 'error',
        message: 'CPF estruturalmente inválido.',
      });
    if (seen.has(cpf))
      issues.push({ row, field: 'employee_cpf', severity: 'error', message: 'CPF duplicado no arquivo.' });
    seen.add(cpf);
    let salary: string | null = null,
      admission_date: string | null = null;
    try {
      if (mapped.salary) {
        salary = parseMoney(mapped.salary);
        if (new Decimal(salary).isNegative() || new Decimal(salary).gt('9999999999.99'))
          throw new Error('Salário fora do intervalo permitido.');
      }
    } catch {
      issues.push({
        row,
        field: 'salary',
        severity: 'error',
        message: 'Valor monetário inválido ou negativo.',
      });
    }
    try {
      if (mapped.admission_date) admission_date = parseDate(mapped.admission_date);
    } catch {
      issues.push({
        row,
        field: 'admission_date',
        severity: 'error',
        message: 'Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD.',
      });
    }
    if (issues.length === start)
      records.push({ employee_name: mapped.employee_name ?? '', employee_cpf: cpf, salary, admission_date });
  }
  return { issues, records, ignored, valid: records.length, total: rows.length };
}
export function columnMetadata(headers: string[], rows: string[][]) {
  return headers.map((header, index) => {
    const values = rows
      .slice(0, 20)
      .map((row) => row[index] ?? '')
      .filter(Boolean);
    const kind = values.length && values.every((v) => /^[\d.,R$\s-]+$/.test(v)) ? 'number' : 'text';
    return { header, kind, empty: values.length === 0, examples: values.slice(0, 3) };
  });
}
export function minimizeForAI(headers: string[], rows: string[][]) {
  // Only shape/type information: never send names, CPF, salaries or raw samples.
  return columnMetadata(headers, rows).map((c) => ({
    header: c.header
      .replace(/\d/g, '#')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]+/gi, '[email]')
      .slice(0, 100),
    kind: c.kind,
    empty: c.empty,
  }));
}
export const maxUploadBytes = 10 * 1024 * 1024;
export function validateUpload(
  name: string,
  type: string,
  size: number,
  kind: 'spreadsheet' | 'document' | 'avatar',
) {
  if (!size) throw new Error('O arquivo está vazio.');
  if (size > (kind === 'avatar' ? 2 * 1024 * 1024 : maxUploadBytes))
    throw new Error('Arquivo acima do limite permitido.');
  const allowed: Record<string, string[]> = {
    csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain', ''],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ''],
    pdf: ['application/pdf'],
    png: ['image/png'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
  };
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const extensions =
    kind === 'spreadsheet'
      ? ['csv', 'xlsx']
      : kind === 'avatar'
        ? ['png', 'jpg', 'jpeg']
        : Object.keys(allowed);
  if (!extensions.includes(ext) || !allowed[ext]?.includes(type))
    throw new Error('Formato de arquivo não permitido.');
  return ext;
}

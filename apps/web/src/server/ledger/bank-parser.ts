import { Buffer } from 'node:buffer';
import Papa from 'papaparse';
import { parseMoney } from '@operis/domain';
export type BankTransactionInput = { date: string; description: string; amount: string; fitid?: string };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
function ofxDate(value: string) {
  const digits = value.trim().slice(0, 8);
  if (!/^\d{8}$/.test(digits)) throw new Error('Data inválida no extrato OFX.');
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`;
  throw new Error('Use datas no formato AAAA-MM-DD ou DD/MM/AAAA no extrato.');
}
function parseOfx(text: string): BankTransactionInput[] {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  if (!blocks.length) throw new Error('Nenhuma transação encontrada no arquivo OFX.');
  if (blocks.length > MAX_ROWS) throw new Error('Extrato acima do limite de linhas suportado.');
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([^<\r\n]*)`, 'i'))?.[1]?.trim() ?? '';
  return blocks.map((block) => {
    const amount = tag(block, 'TRNAMT');
    const date = tag(block, 'DTPOSTED');
    if (!amount || !date) throw new Error('Transação OFX sem data ou valor.');
    return {
      date: ofxDate(date),
      amount: parseMoney(amount),
      description: (tag(block, 'NAME') || tag(block, 'MEMO')).slice(0, 500),
      fitid: tag(block, 'FITID').slice(0, 120) || undefined,
    };
  });
}
function parseCsv(text: string): BankTransactionInput[] {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (result.errors.some((e) => e.code !== 'TooFewFields' && e.code !== 'TooManyFields'))
    throw new Error('CSV de extrato inválido.');
  const rows = result.data;
  if (!rows.length) throw new Error('O CSV do extrato está vazio.');
  if (rows.length > MAX_ROWS) throw new Error('Extrato acima do limite de linhas suportado.');
  const headers = Object.keys(rows[0] ?? {}).map((h) => h.toLowerCase().trim());
  const findKey = (candidates: string[]) => {
    const original = Object.keys(rows[0] ?? {});
    const index = headers.findIndex((h) => candidates.includes(h));
    return index >= 0 ? original[index] : undefined;
  };
  const dateKey = findKey(['data', 'date', 'dt']);
  const descriptionKey = findKey(['descricao', 'descrição', 'description', 'historico', 'histórico', 'memo']);
  const amountKey = findKey(['valor', 'amount', 'value']);
  if (!dateKey || !amountKey) throw new Error('O CSV precisa ter colunas de data e valor.');
  return rows.map((row) => ({
    date: normalizeDate(row[dateKey] ?? ''),
    amount: parseMoney((row[amountKey] ?? '').trim()),
    description: (descriptionKey ? row[descriptionKey] : '')?.trim().slice(0, 500) ?? '',
  }));
}
export function parseBankStatement(bytes: Buffer, extension: string): BankTransactionInput[] {
  if (bytes.length > MAX_BYTES) throw new Error('Arquivo de extrato acima do limite permitido.');
  const text = bytes.toString('utf8');
  if (extension === 'ofx' || extension === 'qfx') return parseOfx(text);
  if (extension === 'csv') return parseCsv(text);
  throw new Error('Envie um extrato em OFX ou CSV.');
}

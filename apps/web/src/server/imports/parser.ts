import ExcelJS from 'exceljs';
import { Buffer } from 'node:buffer';
import Papa from 'papaparse';
export type WorkbookSheet = { name: string; rows: string[][] };
const MAX_ROWS = 5001,
  MAX_COLUMNS = 100,
  MAX_EXPANDED = 40 * 1024 * 1024;
export function inspectZip(bytes: Buffer) {
  // Read central-directory sizes before decompression to reject zip bombs/macros.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('Arquivo XLSX inválido.');
  const entries = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (entries > 2000 || entries === 65535 || offset === 0xffffffff)
    throw new Error('Planilha excede os limites de segurança.');
  let cursor = offset,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('Estrutura XLSX inválida.');
    const size = bytes.readUInt32LE(cursor + 24),
      nameLength = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    total += size;
    if (size === 0xffffffff || total > MAX_EXPANDED || /vbaProject|macros|externalLinks|\.bin$/i.test(name))
      throw new Error('Arquivo com macros, vínculos externos ou conteúdo expandido acima do limite.');
    cursor += 46 + nameLength + extra + comment;
  }
}
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value)
      throw new Error(
        'Planilhas com fórmulas não são aceitas nesta versão. Exporte os valores para um novo arquivo.',
      );
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    if ('hyperlink' in value) return value.text;
    if ('error' in value) throw new Error('A planilha contém uma célula com erro.');
  }
  return String(value);
}
export async function parseSpreadsheet(bytes: Buffer, extension: string): Promise<WorkbookSheet[]> {
  if (extension === 'csv') {
    const raw = bytes.toString('utf8').replace(/^\uFEFF/, '');
    if (raw.includes('\uFFFD')) throw new Error('Salve o CSV em UTF-8 para preservar os caracteres.');
    const parsed = Papa.parse<string[]>(raw, { skipEmptyLines: 'greedy', preview: MAX_ROWS + 1 });
    if (parsed.errors.some((e) => e.type === 'Quotes'))
      throw new Error('Não foi possível interpretar o CSV. Confira o separador e as aspas.');
    if (parsed.data.length > MAX_ROWS || parsed.data.some((r) => r.length > MAX_COLUMNS))
      throw new Error('Limite: 5.000 linhas e 100 colunas.');
    if (parsed.data.length < 2)
      throw new Error('O arquivo precisa de um cabeçalho e ao menos uma linha de dados.');
    return [{ name: 'CSV', rows: parsed.data }];
  }
  inspectZip(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (workbook.worksheets.length > 20) throw new Error('Limite de 20 planilhas por arquivo.');
  const sheets: WorkbookSheet[] = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS)
      throw new Error('Limite: 5.000 linhas e 100 colunas por planilha.');
    if (sheet.rowCount === 0) continue;
    const rows: string[][] = [];
    for (let row = 1; row <= sheet.rowCount; row++) {
      const values: string[] = [];
      for (let col = 1; col <= sheet.columnCount; col++)
        values.push(cellText(sheet.getRow(row).getCell(col).value).slice(0, 1000));
      rows.push(values);
    }
    sheets.push({ name: sheet.name, rows });
  }
  if (!sheets.length) throw new Error('Nenhuma planilha com dados foi encontrada.');
  return sheets;
}

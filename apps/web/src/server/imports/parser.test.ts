import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSpreadsheet, inspectZip } from './parser';
describe('spreadsheet parsing', () => {
  it('reads semicolon CSV and quoted cells', async () => {
    const sheets = await parseSpreadsheet(Buffer.from('Nome;CPF\n"Pessoa; Fictícia";52998224725'), 'csv');
    expect(sheets[0]?.rows[1]?.[0]).toBe('Pessoa; Fictícia');
  });
  it('reads a real XLSX workbook with multiple sheets', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Dados').addRows([
      ['Nome', 'CPF'],
      ['Pessoa Fictícia', '52998224725'],
    ]);
    book.addWorksheet('Notas').addRows([['Nota'], ['Fictício']]);
    const sheets = await parseSpreadsheet(Buffer.from(await book.xlsx.writeBuffer()), 'xlsx');
    expect(sheets.map((s) => s.name)).toEqual(['Dados', 'Notas']);
    expect(sheets[0]?.rows).toHaveLength(2);
  });
  it('rejects formulas instead of using stale cached results', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Dados');
    sheet.addRows([['Valor'], [{ formula: '1+1', result: 2 }]]);
    await expect(parseSpreadsheet(Buffer.from(await book.xlsx.writeBuffer()), 'xlsx')).rejects.toThrow(
      'fórmulas',
    );
  });
  it('rejects malformed ZIP and empty CSV', async () => {
    expect(() => inspectZip(Buffer.from('not a zip'))).toThrow();
    await expect(parseSpreadsheet(Buffer.from('Nome'), 'csv')).rejects.toThrow();
  });
  it('rejects invalid UTF-8 and more than 5000 records', async () => {
    await expect(parseSpreadsheet(Buffer.from([0xff, 0x0a, 0x61]), 'csv')).rejects.toThrow('UTF-8');
    await expect(
      parseSpreadsheet(Buffer.from('Nome\n' + Array(5002).fill('Pessoa').join('\n')), 'csv'),
    ).rejects.toThrow('5.000');
  });
});

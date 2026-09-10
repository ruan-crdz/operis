import { describe, it, expect } from 'vitest';
import {
  money,
  parseMoney,
  competenceSchema,
  shiftCompetence,
  formatCompetence,
  validCpf,
  validateMapping,
  validateRows,
  schemaFingerprint,
  compareSchemas,
  minimizeForAI,
  validateUpload,
  canTransitionTask,
} from './index';
describe('money', () => {
  it('rounds explicitly with decimal arithmetic', () => {
    expect(money('1.005')).toBe('1.01');
    expect(money('0.30000000000000004')).toBe('0.30');
  });
  it('parses Brazilian amounts without floating point', () => {
    expect(parseMoney('R$ 1.234,56')).toBe('1234.56');
    expect(parseMoney('2500.10')).toBe('2500.10');
    expect(() => parseMoney('1,23,45')).toThrow();
  });
});
describe('competence', () => {
  it('handles year boundaries', () => {
    expect(shiftCompetence('2026-01', -1)).toBe('2025-12');
    expect(shiftCompetence('2026-12', 1)).toBe('2027-01');
  });
  it('rejects invalid months and years', () => {
    expect(competenceSchema.safeParse('2026-13').success).toBe(false);
    expect(competenceSchema.safeParse('0000-01').success).toBe(false);
    expect(formatCompetence('2026-09')).toContain('setembro');
  });
});
describe('CPF', () => {
  it('checks both digits', () => {
    expect(validCpf('529.982.247-25')).toBe(true);
    expect(validCpf('52998224724')).toBe(false);
    expect(validCpf('11111111111')).toBe(false);
    expect(validCpf('')).toBe(false);
  });
});
describe('import validation', () => {
  const headers = ['Nome', 'CPF', 'Valor', 'Admissão'];
  const mapping = {
    Nome: 'employee_name',
    CPF: 'employee_cpf',
    Valor: 'salary',
    Admissão: 'admission_date',
  } as const;
  it('requires destination fields and rejects duplicate targets', () => {
    expect(validateMapping(headers, {})).toHaveLength(2);
    expect(validateMapping(headers, { Nome: 'employee_name', CPF: 'employee_name' })).toHaveLength(2);
  });
  it('validates values deterministically and preserves decimals', () => {
    const result = validateRows(
      headers,
      [['Pessoa Fictícia', '52998224725', '2.450,90', '01/09/2026']],
      mapping,
    );
    expect(result.issues).toEqual([]);
    expect(result.records[0]?.salary).toBe('2450.90');
    expect(result.records[0]?.admission_date).toBe('2026-09-01');
  });
  it('blocks bad dates, negative salary, duplicate CPF and blank name', () => {
    const result = validateRows(
      headers,
      [
        ['', '52998224725', '-10', '31/02/2026'],
        ['Outra pessoa', '52998224725', '', ''],
      ],
      mapping,
    );
    expect(result.issues.map((i) => i.field)).toEqual([
      'employee_name',
      'salary',
      'admission_date',
      'employee_cpf',
    ]);
  });
  it('counts empty rows separately', () => {
    expect(validateRows(headers, [['', '', '', '']], mapping).ignored).toBe(1);
  });
  it('compares structural schemas without inventing renamed columns', () => {
    expect(schemaFingerprint([' CPF ', 'Nome'])).toBe(schemaFingerprint(['nome', 'cpf']));
    expect(compareSchemas(['Nome', 'CPF'], ['Nome', 'Documento'])).toEqual({
      added: ['Documento'],
      removed: ['CPF'],
    });
  });
  it('sends no personal sample values to AI', () => {
    const payload = JSON.stringify(
      minimizeForAI(headers, [['Pessoa Fictícia', '52998224725', '2.450,90', '01/09/2026']]),
    );
    expect(payload).not.toContain('Pessoa Fictícia');
    expect(payload).not.toContain('52998224725');
    expect(payload).not.toContain('2.450,90');
  });
});
describe('upload and workflow', () => {
  it('rejects disguised executables, empty files and oversized uploads', () => {
    expect(() => validateUpload('malware.exe', 'text/csv', 10, 'spreadsheet')).toThrow();
    expect(() => validateUpload('file.csv', 'application/x-msdownload', 10, 'spreadsheet')).toThrow();
    expect(() => validateUpload('file.csv', 'text/csv', 0, 'spreadsheet')).toThrow();
    expect(() => validateUpload('file.csv', 'text/csv', 11 * 1024 * 1024, 'spreadsheet')).toThrow();
  });
  it('accepts a CSV with browser MIME', () => {
    expect(validateUpload('people.csv', 'text/csv', 100, 'spreadsheet')).toBe('csv');
  });
  it('enforces blocked reasons and open dependencies', () => {
    expect(canTransitionTask('blocked', null)).toBe(false);
    expect(canTransitionTask('blocked', 'Documento ausente')).toBe(true);
    expect(canTransitionTask('completed', null, true)).toBe(false);
  });
});

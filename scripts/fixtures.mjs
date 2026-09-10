import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('fixtures', { recursive: true });
const headers = ['Nome Func.', 'CPF COLAB', 'Salário informado', 'Data admissão'];
const valid = [
  ['Colaborador Fictício A', '52998224725', '2.450,90', '01/09/2026'],
  ['Colaboradora Fictícia B', '11144477735', '3.200,00', '15/08/2026'],
];
for (const [name, rows] of [
  ['employees-valid.xlsx', [headers, ...valid]],
  [
    'employees-invalid.xlsx',
    [
      headers,
      ['', '11111111111', '-100', '31/02/2026'],
      ['Pessoa Fictícia', '52998224725', 'R$ valor', '01/09/2026'],
    ],
  ],
  [
    'employees-schema-changed.xlsx',
    [
      ['Nome completo', 'CPF COLAB', 'Salário informado', 'Departamento'],
      ['Colaborador Fictício A', '52998224725', '2.450,90', 'DP'],
    ],
  ],
]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Colaboradores');
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((c) => (c.width = 25));
  await workbook.xlsx.writeFile(`fixtures/${name}`);
}
await writeFile(
  'fixtures/employees-valid.csv',
  [headers.join(';'), ...valid.map((row) => row.join(';'))].join('\n'),
  'utf8',
);
await writeFile(
  'fixtures/README.md',
  '# Fixtures fictícias\n\nOs nomes e os CPFs são dados de teste, sem associação a pessoas reais. Os CPFs foram escolhidos exclusivamente para exercitar dígitos verificadores. Nunca use estes arquivos como cadastros reais.\n\n- `employees-valid.xlsx` / `.csv`: dois colaboradores estruturalmente válidos.\n- `employees-invalid.xlsx`: nome ausente, CPF inválido, data impossível e salário inválido.\n- `employees-schema-changed.xlsx`: colunas novas/removidas, para revisão de template.\n\nRecriar: `pnpm fixtures`.\n',
);
console.log('Generated 4 synthetic spreadsheet fixtures.');

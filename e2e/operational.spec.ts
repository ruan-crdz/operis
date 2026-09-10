import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
test('real Supabase: login, client, task, move, upload, import, approval and theme', async ({ page }) => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    'Requires a running Supabase and a confirmed test account.',
  );
  const suffix = Date.now().toString();
  await page.goto('./#/login');
  await page.getByLabel('Email de trabalho').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar no Operis' }).click();
  await expect(page).toHaveURL(/\/(app|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.getByLabel('Nome do escritório').fill(`Escritório E2E ${suffix}`);
    await page.getByLabel('Seu nome').fill('Pessoa E2E');
    await page.getByRole('button', { name: 'Criar meu escritório' }).click();
  }
  await expect(page).toHaveURL(/\/app$/);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.goto('./#/app/clientes/novo');
  await page.getByLabel('Razão social').fill(`Cliente E2E ${suffix}`);
  await page.getByRole('button', { name: 'Criar cliente' }).click();
  await expect(page).toHaveURL(/\/app\/clientes\/[0-9a-f-]+$/);
  const clientId = page.url().split('/').pop()!;
  await page.goto(`./#/app/tarefas/nova?client=${clientId}`);
  await page.getByLabel('Título da tarefa').fill(`Conferir E2E ${suffix}`);
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/tarefas\/[0-9a-f-]+$/);
  const taskUrl = page.url();
  await page.goto('./#/app/tarefas');
  await page.getByLabel(`Mover Conferir E2E ${suffix} para`).selectOption('in_progress');
  await expect(page.getByLabel(`Mover Conferir E2E ${suffix} para`)).toHaveValue('in_progress');
  await page.reload();
  await expect(page.getByLabel(`Mover Conferir E2E ${suffix} para`)).toHaveValue('in_progress');
  await page.goto(taskUrl);
  await expect(page.getByText('Em andamento', { exact: true }).first()).toBeVisible();
  await page.goto('./#/app/documentos/enviar');
  await page.getByLabel('Cliente', { exact: true }).selectOption(clientId);
  await page
    .getByLabel('Documento', { exact: true })
    .setInputFiles(path.resolve('fixtures/employees-valid.csv'));
  await page.getByRole('button', { name: 'Enviar e armazenar' }).click();
  await expect(page).toHaveURL(/\/app\/documentos$/);
  await expect(page.getByText('employees-valid.csv', { exact: true })).toBeVisible();
  await page.goto('./#/app/importacoes/nova');
  await page.getByLabel('Cliente', { exact: true }).selectOption(clientId);
  await page
    .getByLabel('Planilha de colaboradores')
    .setInputFiles(path.resolve('fixtures/employees-valid.xlsx'));
  await page.getByRole('button', { name: 'Enviar e analisar arquivo' }).click();
  await expect(page).toHaveURL(/\/app\/importacoes\/[0-9a-f-]+$/);
  const importUrl = page.url();
  await page.getByLabel('Campo Operis para Nome Func.').selectOption('employee_name');
  await page.getByLabel('Campo Operis para CPF COLAB').selectOption('employee_cpf');
  await page.getByLabel('Campo Operis para Salário informado').selectOption('salary');
  await page.getByLabel('Campo Operis para Data admissão').selectOption('admission_date');
  await page.getByRole('button', { name: 'Validar e revisar' }).click();
  await expect(page.getByText('Pronta para aprovação')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Pronta para aprovação')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aprovar importação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Processar agora' })).toBeVisible();
  await page.getByRole('button', { name: 'Processar agora' }).click();
  await expect(page.getByText(/Importação concluída: 2 colaboradores/)).toBeVisible();
  await page.goto(importUrl);
  await expect(page.getByText(/Importação concluída: 2 colaboradores/)).toBeVisible();
  await page.goto('./#/app/configuracoes/aparencia');
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await page.getByLabel('Densidade', { exact: true }).selectOption('compact');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const route of ['/login', '/cadastro', '/recuperar-senha', '/configuracao'])
  test(`public page ${route} renders with no serious accessibility violations`, async ({ page }) => {
    await page.goto(`./#${route}`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
test('keyboard navigation reaches recovery and registration', async ({ page }) => {
  await page.goto('./#/login');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/recuperar-senha/);
  await page.getByRole('link', { name: 'Voltar para entrar' }).click();
  await page.getByRole('link', { name: 'Criar uma conta' }).click();
  await expect(page).toHaveURL(/cadastro/);
});
test('unauthenticated operational route is protected', async ({ page }) => {
  await page.goto('./#/app/clientes');
  await expect(page).toHaveURL(/\/(login|configuracao)$/);
});
test('login remains usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/login');
  await expect(page.getByRole('button', { name: 'Entrar no Operis' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true, caret: 'initial' });
});
test('desktop visual record', async ({ page }) => {
  await page.goto('./#/login');
  await expect(page.getByRole('button', {name:'Entrar no Operis'})).toBeVisible();
  await page.screenshot({ path: 'test-results/login-desktop.png', fullPage: true, caret: 'initial' });
  await page.goto('./#/configuracao');
  await expect(page.getByRole('heading', {name:'Uma base pronta para sua operação.'})).toBeVisible();
  await page.screenshot({ path: 'test-results/configuration-desktop.png', fullPage: true, caret: 'initial' });
});

test('shared links survive reload, a new tab, and browser history on static hosting',async({page,context})=>{
 await page.goto('./#/login');
 await page.getByRole('link',{name:'Criar uma conta'}).click();
 const shared=page.url();
 await page.reload();
 await expect(page.getByRole('button',{name:'Criar minha conta'})).toBeVisible();
 const other=await context.newPage();
 await other.goto(shared);
 await expect(other.getByRole('button',{name:'Criar minha conta'})).toBeVisible();
 await page.goBack();
 await expect(page.getByRole('button',{name:'Entrar no Operis'})).toBeVisible();
});
test('dark theme and compact density render accessibly from browser preferences', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const base = window.location.pathname.replace(/\/$/, '');
    localStorage.setItem('operis:' + base + ':operis_theme', 'dark');
    localStorage.setItem('operis:' + base + ':operis_density', 'compact');
  });
  await page.goto('./#/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/login-dark.png', fullPage: true, caret: 'initial' });
});

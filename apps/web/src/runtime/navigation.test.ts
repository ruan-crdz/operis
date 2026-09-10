import { describe, it, expect } from 'vitest';
import { resolveRoute, Navigation, redirect } from './navigation';
describe('static navigation', () => {
  it('keeps the detail route when applying filters', () => {
    expect(resolveRoute('?tab=tasks', '/app/clientes/abc?tab=overview')).toBe('/app/clientes/abc?tab=tasks');
  });
  it('rejects external redirect targets', () => {
    for (const target of ['//evil.test', 'https://evil.test', 'javascript:alert(1)'])
      expect(() => resolveRoute(target)).toThrow();
  });
  it('represents redirects without a server', () => {
    expect(() => redirect('/login')).toThrow(Navigation);
  });
});

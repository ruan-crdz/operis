import { describe, it, expect } from 'vitest';
import { createHandler } from './handler';
const handler = createHandler((name) =>
  name === 'ALLOWED_ORIGINS' ? 'https://example.github.io' : undefined,
);
describe('Edge HTTP boundary', () => {
  it('rejects origins that are not configured', async () => {
    const result = await handler(
      new Request('https://edge.test', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }),
    );
    expect(result.status).toBe(403);
    expect(result.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
  it('allows the configured preflight without accepting wildcard origins', async () => {
    const result = await handler(
      new Request('https://edge.test', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.github.io' },
      }),
    );
    expect(result.status).toBe(204);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://example.github.io');
  });
  it('requires a user JWT before parsing uploads', async () => {
    const result = await handler(new Request('https://edge.test', { method: 'POST', body: 'invalid' }));
    expect(result.status).toBe(401);
  });
  it('rejects unsupported HTTP methods', async () => {
    expect((await handler(new Request('https://edge.test'))).status).toBe(405);
  });
});

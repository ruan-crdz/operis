import { describe, expect, it } from 'vitest';
import { deploymentReloadUrl, isChunkLoadError } from './chunks';

describe('static deployment recovery', () => {
  it('recognizes dynamic chunk failures without treating regular errors as deployment failures', () => {
    expect(isChunkLoadError(new Error('Failed to load chunk /operis/_next/static/chunks/old.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Permission denied'))).toBe(false);
  });

  it('cache-busts the document while preserving the hash route', () => {
    expect(deploymentReloadUrl('https://example.test/operis/#/app/importacoes/nova', 123)).toBe(
      'https://example.test/operis/?_operis_reload=123#/app/importacoes/nova',
    );
  });
});

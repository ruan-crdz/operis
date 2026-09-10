import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const root = 'apps/web/out';
const walk = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir)).map(async (name) => {
        const p = path.join(dir, name);
        return (await stat(p)).isDirectory() ? walk(p) : [p];
      }),
    )
  ).flat();
const html = await readFile(`${root}/index.html`, 'utf8');
assert.match(html, /_next\/static/, 'O export deve conter assets locais.');
for (const file of (await walk(root)).filter((f) => /\.(js|html|json)$/.test(f))) {
  const content = await readFile(file, 'utf8');
  assert.doesNotMatch(
    content,
    /OPENAI_API_KEY|OPERIS_IMPORT_SIGNING_KEY|SUPABASE_SERVICE_ROLE_KEY|sk-proj-[a-zA-Z0-9_-]+|sb_secret_[a-zA-Z0-9_-]+/,
    `Segredo ou backend privado no export: ${file}`,
  );
}
await writeFile(`${root}/.nojekyll`, '');
console.log('Export estático verificado: index.html, assets e ausência de código de segredos.');

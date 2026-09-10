import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const modules = ['@supabase/supabase-js', 'openai', 'exceljs', 'papaparse', 'zod', 'decimal.js'];
const imports = {};
for (const name of modules) {
  const directory = name === 'decimal.js' ? 'packages/domain' : 'apps/web';
  const { version } = JSON.parse(await readFile(`${directory}/node_modules/${name}/package.json`, 'utf8'));
  imports[name] = `npm:${name}@${version}`;
  if (name === 'openai') imports['openai/helpers/zod'] = `npm:openai@${version}/helpers/zod`;
}
await mkdir('supabase/functions/operis', { recursive: true });
await build({
  entryPoints: ['apps/web/src/server/edge/handler.ts'],
  outfile: 'supabase/functions/operis/handler.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: modules,
  tsconfig: 'apps/web/tsconfig.json',
  logLevel: 'info',
});
await writeFile('supabase/functions/operis/deno.json', JSON.stringify({ imports }, null, 2) + '\n');
await writeFile(
  'supabase/functions/operis/index.ts',
  `// Handler generated from apps/web/src/server by pnpm edge:build.\nimport {createHandler} from './handler.js';\nDeno.serve(createHandler((name: string) => Deno.env.get(name)));\n`,
);

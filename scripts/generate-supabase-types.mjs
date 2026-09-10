import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'supabase', 'gen', 'types', 'typescript', '--local'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}
writeFileSync(
  'packages/types/src/database.ts',
  result.stdout +
    '\nexport type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];\n',
);

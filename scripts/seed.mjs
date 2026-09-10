import pg from 'pg';
import { readFile } from 'node:fs/promises';
// This command intentionally refuses remote databases. No production seed path.
const url = process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Demo seed is restricted to a local database.');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(await readFile('supabase/seed.sql', 'utf8'));
  console.log('Demo office seeded. Login: demo@operis.test / OperisDemo!2026');
} finally {
  await client.end();
}

import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 grant select,insert,update,delete on storage.objects to authenticated;
 grant execute on all functions in schema auth to authenticated,anon,service_role;`);
  for (const file of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    } catch (error) {
      console.error(`Migration failed: ${file}`);
      throw error;
    }
  }
  return db;
}

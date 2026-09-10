import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createDatabase } from './database-harness.mjs';
let signingKey, db, orgA, orgB, clientA, clientB, taskA, taskB, importA;
const a = randomUUID(),
  b = randomUUID(),
  reader = randomUUID();
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
async function asUser(user) {
  await db.exec('reset role');
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",
    [user],
  );
  await db.exec('set role authenticated');
}
before(
  async () => {
    db = await createDatabase();
    signingKey = await scalar(
      "select value from operis_private.edge_secrets where name='import_signing_key'",
    );
    await db.query(
      "insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test'),($3,'reader@example.test')",
      [a, b, reader],
    );
    await asUser(a);
    orgA = await scalar("select public.create_organization('Escritório A','Pessoa A',array['DP','Fiscal'])");
    clientA = await scalar(
      "insert into public.clients(organization_id,name) values($1,'Cliente A') returning id",
      [orgA],
    );
    taskA = await scalar(
      "insert into public.tasks(organization_id,client_id,competence,title) values($1,$2,'2026-09','Tarefa A') returning id",
      [orgA, clientA],
    );
    await asUser(b);
    orgB = await scalar("select public.create_organization('Escritório B','Pessoa B',array['DP'])");
    clientB = await scalar(
      "insert into public.clients(organization_id,name) values($1,'Cliente B') returning id",
      [orgB],
    );
    taskB = await scalar(
      "insert into public.tasks(organization_id,client_id,competence,title) values($1,$2,'2026-09','Tarefa B') returning id",
      [orgB, clientB],
    );
    await asUser(a);
  },
  { timeout: 30000 },
);
after(async () => {
  await db?.close();
});
test('migrations enable RLS on all public tables', async () => {
  await db.exec('reset role');
  const result = await scalar(
    "select count(*)::integer from pg_tables where schemaname='public' and not rowsecurity",
  );
  assert.equal(result, 0);
  await asUser(a);
});
test('tenant A reads A and cannot read B clients/tasks/audit', async () => {
  assert.equal(await scalar('select count(*)::integer from public.clients'), 1);
  assert.equal(await scalar('select count(*)::integer from public.tasks where id=$1', [taskB]), 0);
  assert.equal(
    await scalar('select count(*)::integer from public.audit_logs where organization_id=$1', [orgB]),
    0,
  );
});
test('cross-tenant insert and composite foreign keys are denied', async () => {
  await assert.rejects(
    db.query("insert into public.clients(organization_id,name) values($1,'Attack')", [orgB]),
    /row-level security/,
  );
  await assert.rejects(
    db.query(
      "insert into public.tasks(organization_id,client_id,competence,title) values($1,$2,'2026-09','Cross tenant')",
      [orgA, clientB],
    ),
    /foreign key/,
  );
});
test('cross-tenant task mutation affects no rows', async () => {
  const result = await db.query("update public.tasks set title='Attack' where id=$1 returning id", [taskB]);
  assert.equal(result.rows.length, 0);
});
test('organization cannot be moved through updates', async () => {
  await assert.rejects(
    db.query('update public.clients set organization_id=$1 where id=$2', [orgB, clientA]),
    /immutable/i,
  );
});
test('audit is append-only for authenticated users', async () => {
  await assert.rejects(db.exec('delete from public.audit_logs'), /permission denied/);
  await assert.rejects(db.exec("update public.audit_logs set action='forged'"), /permission denied/);
});
test('profile self updates work, peer profile updates do not', async () => {
  await db.query("update public.profiles set full_name='Pessoa A Editada' where id=$1", [a]);
  assert.equal(await scalar('select full_name from public.profiles where id=$1', [a]), 'Pessoa A Editada');
  assert.equal(
    (await db.query("update public.profiles set full_name='Attack' where id=$1 returning id", [b])).rows
      .length,
    0,
  );
});
test('preferences persist without changing tenant identity', async () => {
  await db.query("update public.user_preferences set theme='dark',density='compact' where id=$1", [a]);
  assert.equal(await scalar('select theme from public.user_preferences where id=$1', [a]), 'dark');
});
test('moving task increments version and stale writes affect no rows', async () => {
  await db.query("update public.tasks set status='in_progress' where id=$1 and version=1", [taskA]);
  assert.equal(await scalar('select version from public.tasks where id=$1', [taskA]), 2);
  assert.equal(
    (
      await db.query("update public.tasks set status='completed' where id=$1 and version=1 returning id", [
        taskA,
      ])
    ).rows.length,
    0,
  );
});
test('blocked task requires an explanation', async () => {
  await assert.rejects(
    db.query("update public.tasks set status='blocked',blocked_reason=null where id=$1", [taskA]),
    /check constraint/,
  );
});
test('comments cannot attach to a task in another organization', async () => {
  await assert.rejects(
    db.query("insert into public.task_comments(organization_id,task_id,body) values($1,$2,'Attack')", [
      orgA,
      taskB,
    ]),
    /foreign key/,
  );
});
test('member management grants a real read-only role', async () => {
  const role = await scalar("select id from public.roles where organization_id=$1 and name='Leitor'", [orgA]);
  await db.query("select public.manage_member($1,'reader@example.test',$2,null)", [orgA, role]);
  await asUser(reader);
  assert.equal(await scalar('select count(*)::integer from public.clients'), 1);
  await assert.rejects(
    db.query("insert into public.clients(organization_id,name) values($1,'Denied')", [orgA]),
    /row-level security/,
  );
  assert.equal(
    (await db.query("update public.tasks set title='Denied' where id=$1 returning id", [taskA])).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select public.manage_member($1,'a@example.test',$2,null)", [orgA, role]),
    /Permission denied/,
  );
  await asUser(a);
});
test('storage policies allow only authorized tenant/client paths and immutable originals', async () => {
  const pathA = `organizations/${orgA}/clients/${clientA}/documents/${randomUUID()}.pdf`;
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('documents',$1,$2)", [
    pathA,
    a,
  ]);
  await assert.rejects(
    db.query("insert into storage.objects(bucket_id,name,owner_id) values('documents',$1,$2)", [
      `organizations/${orgB}/clients/${clientB}/documents/test.pdf`,
      a,
    ]),
    /row-level security/,
  );
  assert.equal((await db.query("update storage.objects set name='overwrite' returning id")).rows.length, 0);
  await asUser(b);
  assert.equal(await scalar('select count(*)::integer from storage.objects'), 0);
  await asUser(a);
});
test('CPF SQL implementation checks both digits and rejects repeated digits', async () => {
  await db.exec('reset role');
  assert.equal(await scalar("select public.valid_cpf('52998224725')"), true);
  assert.equal(await scalar("select public.valid_cpf('52998224724')"), false);
  assert.equal(await scalar("select public.valid_cpf('11111111111')"), false);
  await asUser(a);
});
test('import config and validation persist, invalid records block approval', async () => {
  const workbook = [
    {
      name: 'Dados',
      rows: [
        ['Nome', 'CPF', 'Valor', 'Admissão'],
        ['Pessoa Fictícia', '52998224725', '2.450,90', '01/09/2026'],
      ],
    },
  ];
  importA = await createSignedImport([
    orgA,
    clientA,
    '2026-09',
    'fixture.xlsx',
    `organizations/${orgA}/clients/${clientA}/imports/test.xlsx`,
    'abc',
    JSON.stringify(workbook),
  ]);
  await assert.rejects(
    db.query("update public.imports set status='completed' where id=$1", [importA]),
    /permission denied/,
  );
  await assert.rejects(db.query('select public.approve_import($1,1)', [importA]), /Valide/);
  const mapping = { Nome: 'employee_name', CPF: 'employee_cpf', Valor: 'salary', Admissão: 'admission_date' };
  await db.query('select public.configure_import($1,1,0,1,$2)', [importA, JSON.stringify(mapping)]);
  const result = await scalar('select public.validate_import($1,2)', [importA]);
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, 1);
  assert.equal(await scalar('select status from public.imports where id=$1', [importA]), 'awaiting_approval');
});
test('tenant B and reader cannot approve tenant A import', async () => {
  await asUser(b);
  assert.equal(await scalar('select count(*)::integer from public.imports where id=$1', [importA]), 0);
  await assert.rejects(db.query('select public.approve_import($1,3)', [importA]), /Permission denied/);
  await asUser(reader);
  await assert.rejects(db.query('select public.approve_import($1,3)', [importA]), /Permission denied/);
  await asUser(a);
});
test('approval + process is transactional, idempotent and stores exact salary', async () => {
  await db.query('select public.approve_import($1,3)', [importA]);
  assert.equal(
    await scalar('select count(*)::integer from public.outbox_events where entity_id=$1', [importA]),
    1,
  );
  assert.equal(await scalar('select public.process_import($1)', [importA]), 1);
  assert.equal(await scalar('select public.process_import($1)', [importA]), 1);
  assert.equal(await scalar('select count(*)::integer from public.employee_snapshots'), 1);
  assert.equal(await scalar('select salary::text from public.employee_snapshots'), '2450.90');
  assert.equal(await scalar('select count(*)::integer from public.approvals'), 1);
  assert.equal(
    await scalar("select count(*)::integer from public.notifications where kind='import_completed'"),
    1,
  );
});
test('approved mappings cannot be changed; successful mapping can become a template', async () => {
  await assert.rejects(
    db.query("select public.configure_import($1,5,0,1,'{}')", [importA]),
    /aprovada|Recarregue|mudou/,
  );
  await db.query("select public.save_import_template($1,'Template fictício')", [importA]);
  assert.equal(await scalar('select count(*)::integer from public.import_templates'), 1);
});
test('invalid date/salary/CPF are errors in authoritative SQL validation', async () => {
  const workbook = [
    {
      name: 'Dados',
      rows: [
        ['Nome', 'CPF', 'Valor', 'Admissão'],
        ['', '11111111111', '-2', '31/02/2026'],
      ],
    },
  ];
  const importId = await createSignedImport([
    orgA,
    clientA,
    '2026-10',
    'invalid.csv',
    `organizations/${orgA}/clients/${clientA}/imports/invalid.csv`,
    'invalid',
    JSON.stringify(workbook),
  ]);
  await db.query('select public.configure_import($1,1,0,1,$2)', [
    importId,
    JSON.stringify({
      Nome: 'employee_name',
      CPF: 'employee_cpf',
      Valor: 'salary',
      Admissão: 'admission_date',
    }),
  ]);
  const result = await scalar('select public.validate_import($1,2)', [importId]);
  assert.equal(result.issues.length, 4);
  await assert.rejects(db.query('select public.approve_import($1,3)', [importId]), /Valide/);
});
test('document request creation is atomic and accepted items require evidence', async () => {
  const request = await scalar(
    "select public.create_document_request($1,$2,'Documentos do mês','2026-09',array['Ponto','Variáveis'])",
    [orgA, clientA],
  );
  assert.equal(
    await scalar('select count(*)::integer from public.document_request_items where request_id=$1', [
      request,
    ]),
    2,
  );
  await assert.rejects(
    db.query("update public.document_request_items set status='accepted' where request_id=$1", [request]),
    /Vincule/,
  );
});
test('rate limits are shared database counters and workers are restricted', async () => {
  for (let i = 0; i < 6; i++)
    assert.equal(await scalar("select public.consume_rate_limit($1,'ai_mapping')", [orgA]), true);
  assert.equal(await scalar("select public.consume_rate_limit($1,'ai_mapping')", [orgA]), false);
  await assert.rejects(db.query('select public.process_pending_imports()'), /permission denied/);
});
test('anonymous user cannot read operational data or create organization', async () => {
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select * from public.clients'), /permission denied/);
  await assert.rejects(
    db.query("select public.create_organization('Attack','Anonymous',array['DP'])"),
    /permission denied/,
  );
  await asUser(a);
});
test('avatar path cannot point at another user storage namespace', async () => {
  await assert.rejects(
    db.query('update public.profiles set avatar_path=$1 where id=$2', [`${b}/private.png`, a]),
    /check constraint/,
  );
});
test('dependency graph rejects cycles and unfinished predecessors block execution', async () => {
  const first = await scalar(
    "insert into public.tasks(organization_id,client_id,competence,title) values($1,$2,'2026-09','Etapa anterior') returning id",
    [orgA, clientA],
  );
  const next = await scalar(
    "insert into public.tasks(organization_id,client_id,competence,title) values($1,$2,'2026-09','Etapa seguinte') returning id",
    [orgA, clientA],
  );
  await db.query('select public.set_task_dependency($1,$2)', [next, first]);
  await assert.rejects(db.query('select public.set_task_dependency($1,$2)', [first, next]), /ciclo/);
  await assert.rejects(
    db.query("update public.tasks set status='completed' where id=$1", [next]),
    /Open dependency/,
  );
  await db.query("update public.tasks set status='completed' where id=$1", [first]);
  await db.query("update public.tasks set status='completed' where id=$1", [next]);
  assert.equal(await scalar('select status from public.tasks where id=$1', [next]), 'completed');
  await assert.rejects(
    db.query('select public.set_task_dependency($1,$2)', [taskB, first]),
    /Permission denied/,
  );
});

async function createSignedImport([org, client, competence, filename, path, checksum, workbook]) {
  const actor = await scalar('select auth.uid()');
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('documents',$1,$2)", [
    path,
    actor,
  ]);
  const payload = JSON.stringify({
    actor,
    org,
    client,
    competence,
    filename,
    path,
    checksum,
    workbook: JSON.parse(workbook),
    expires: Math.floor(Date.now() / 1000) + 120,
  });
  return scalar('select public.create_verified_import($1,$2)', [
    payload,
    createHmac('sha256', signingKey).update(payload).digest('hex'),
  ]);
}
test('browser cannot bypass the Edge parser or read its signing key', async () => {
  await asUser(a);
  await assert.rejects(
    db.query('select public.create_import($1,$2,$3,$4,$5,$6,$7)', [
      orgA,
      clientA,
      '2026-11',
      'fake.csv',
      'fake',
      'fake',
      '[]',
    ]),
    /permission denied/,
  );
  await assert.rejects(db.query('select * from operis_private.edge_secrets'), /permission denied/);
  await assert.rejects(db.query("select public.create_verified_import('{}','fake')"), /Assinatura/);
});
test('signed imports reject payload tampering, another actor, expired approval and absent originals', async () => {
  await asUser(a);
  const body = {
    actor: a,
    org: orgA,
    client: clientA,
    competence: '2026-12',
    filename: 'x.csv',
    path: 'missing',
    checksum: 'abc',
    workbook: [],
    expires: Math.floor(Date.now() / 1000) + 120,
  };
  const original = JSON.stringify(body),
    signature = createHmac('sha256', signingKey).update(original).digest('hex');
  await assert.rejects(
    db.query('select public.create_verified_import($1,$2)', [
      JSON.stringify({ ...body, org: orgB }),
      signature,
    ]),
    /Assinatura/,
  );
  await asUser(b);
  await assert.rejects(
    db.query('select public.create_verified_import($1,$2)', [original, signature]),
    /inválida/,
  );
  await asUser(a);
  const expired = JSON.stringify({ ...body, expires: 1 });
  await assert.rejects(
    db.query('select public.create_verified_import($1,$2)', [
      expired,
      createHmac('sha256', signingKey).update(expired).digest('hex'),
    ]),
    /expirada/,
  );
  await assert.rejects(
    db.query('select public.create_verified_import($1,$2)', [original, signature]),
    /original/,
  );
});

import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createDatabase } from './database-harness.mjs';
let signingKey, db, orgA, orgB, clientA, clientB, taskA, taskB, importA, dpProcess;
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
  for (let i = 0; i < 15; i++)
    assert.equal(await scalar("select public.consume_rate_limit($1,'ai_assistant')", [orgA]), true);
  assert.equal(await scalar("select public.consume_rate_limit($1,'ai_assistant')", [orgA]), false);
  await assert.rejects(db.query("select public.consume_rate_limit($1,'not_a_feature')", [orgA]), /Permission denied/);
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

test('monthly DP process is idempotent and materializes its versioned workflow', async () => {
  await asUser(a);
  dpProcess = await scalar(
    "select public.start_department_process($1,$2,'2027-01',$3,null,'2027-02-05')",
    [orgA, clientA, a],
  );
  assert.equal(
    await scalar("select public.start_department_process($1,$2,'2027-01',$3,null,'2027-02-05')", [
      orgA,
      clientA,
      a,
    ]),
    dpProcess,
  );
  assert.equal(
    await scalar('select count(*)::integer from public.workflow_step_runs where process_id=$1', [
      dpProcess,
    ]),
    16,
  );
  assert.equal(
    await scalar('select count(*)::integer from public.workflow_step_runs where process_id=$1 and task_id is not null', [dpProcess]),
    13,
  );
  assert.equal(
    await scalar('select count(*)::integer from public.dp_collection_items where process_id=$1', [dpProcess]),
    13,
  );
});

test('workflow dependencies block early completion and release the next step atomically', async () => {
  const first = (
    await db.query(
      'select sr.id,sr.version from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id where sr.process_id=$1 and s.position=1',
      [dpProcess],
    )
  ).rows[0];
  const second = (
    await db.query(
      'select sr.id,sr.version from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id where sr.process_id=$1 and s.position=2',
      [dpProcess],
    )
  ).rows[0];
  await assert.rejects(
    db.query("select public.update_workflow_step_run($1,$2,'completed')", [second.id, second.version]),
    /Transição|anteriores/,
  );
  await db.query("select public.update_workflow_step_run($1,$2,'completed')", [first.id, first.version]);
  assert.equal(await scalar('select status from public.workflow_step_runs where id=$1', [second.id]), 'ready');
  assert.equal(
    await scalar('select status from public.tasks where id=(select task_id from public.workflow_step_runs where id=$1)', [second.id]),
    'ready',
  );
});

test('DP tenant isolation covers reads and cross-tenant process creation', async () => {
  await asUser(b);
  assert.equal(
    await scalar('select count(*)::integer from public.department_processes where id=$1', [dpProcess]),
    0,
  );
  assert.equal(
    await scalar('select count(*)::integer from public.dp_collection_items where process_id=$1', [dpProcess]),
    0,
  );
  await assert.rejects(
    db.query("select public.start_department_process($1,$2,'2027-01')", [orgB, clientA]),
    /Cliente não pertence|Cliente n.o pertence/,
  );
  await asUser(a);
});

test('occurrences validate employee ownership and preserve completed-process immutability', async () => {
  await assert.rejects(
    db.query(
      "select public.create_dp_occurrence($1,'vacation',null,'2027-01-10','manual','Teste',$2)",
      [dpProcess, randomUUID()],
    ),
    /colaborador/,
  );
  const occurrence = await scalar(
    "select public.create_dp_occurrence($1,'admission',null,'2027-01-10','manual','Admissão informada',$2)",
    [dpProcess, randomUUID()],
  );
  assert.equal(await scalar('select status from public.dp_occurrences where id=$1', [occurrence]), 'received');
});

test('published workflow definition cannot be edited retroactively', async () => {
  await db.exec('reset role');
  await assert.rejects(
    db.query("update public.workflow_steps set name='Alterada' where workflow_version_id=(select workflow_version_id from public.department_processes where id=$1)", [dpProcess]),
    /imutável|imut.vel/,
  );
  await asUser(a);
});

test('new workflow version starts new processes while old runs keep their version', async () => {
  const originalVersion = await scalar('select workflow_version_id from public.department_processes where id=$1', [dpProcess]);
  const cloned = await scalar('select public.clone_workflow_version($1)', [originalVersion]);
  assert.notEqual(cloned, originalVersion);
  assert.equal(await scalar('select count(*)::integer from public.workflow_steps where workflow_version_id=$1', [cloned]), 16);
  await db.query('select public.publish_workflow_version($1)', [cloned]);
  await db.query('select public.archive_workflow_version($1)', [originalVersion]);
  const next = await scalar("select public.start_department_process($1,$2,'2027-02')", [orgA, clientA]);
  assert.equal(await scalar('select workflow_version_id from public.department_processes where id=$1', [next]), cloned);
  assert.equal(await scalar('select workflow_version_id from public.department_processes where id=$1', [dpProcess]), originalVersion);
  await db.exec('reset role');
  await assert.rejects(db.query("update public.workflow_steps set name='Retroativa' where workflow_version_id=$1", [originalVersion]), /imutável|imut.vel/);
  await asUser(a);
});

test('four-eyes approval and completion gates close a fully evidenced competence', async () => {
  const process = await scalar("select public.start_department_process($1,$2,'2027-03',$3,$4)", [orgA, clientA, a, reader]);
  for (const item of (await db.query('select id from public.dp_collection_items where process_id=$1', [process])).rows)
    await db.query("select public.update_collection_item($1,'validated','no_occurrence')", [item.id]);
  await db.query('select public.validate_department_process($1)', [process]);
  for (let position = 1; position <= 13; position++) {
    const run = (await db.query('select sr.id,sr.version from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id where sr.process_id=$1 and s.position=$2', [process, position])).rows[0];
    await db.query("select public.update_workflow_step_run($1,$2,'completed')", [run.id, run.version]);
  }
  let processVersion = await scalar('select version from public.department_processes where id=$1', [process]);
  await db.query('select public.request_process_review($1,$2)', [process, processVersion]);
  processVersion = await scalar('select version from public.department_processes where id=$1', [process]);
  await assert.rejects(db.query("select public.review_department_process($1,$2,'approved')", [process, processVersion]), /segunda pessoa/);
  const operatorRole = await scalar("select id from public.roles where organization_id=$1 and name='Operador'", [orgA]);
  await db.query("select public.manage_member($1,'reader@example.test',$2,null)", [orgA, operatorRole]);
  await asUser(reader);
  await db.query("select public.review_department_process($1,$2,'approved')", [process, processVersion]);
  assert.equal(
    await scalar("select t.status from public.tasks t join public.workflow_step_runs sr on sr.task_id=t.id join public.workflow_steps s on s.id=sr.workflow_step_id where sr.process_id=$1 and s.code='approval'", [process]),
    'completed',
  );
  assert.equal(
    await scalar("select t.status from public.tasks t join public.workflow_step_runs sr on sr.task_id=t.id join public.workflow_steps s on s.id=sr.workflow_step_id where sr.process_id=$1 and s.code='close'", [process]),
    'ready',
  );
  for (const position of [15, 16]) {
    const run = (await db.query('select sr.id,sr.version from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id where sr.process_id=$1 and s.position=$2', [process, position])).rows[0];
    await db.query("select public.update_workflow_step_run($1,$2,'completed')", [run.id, run.version]);
  }
  processVersion = await scalar('select version from public.department_processes where id=$1', [process]);
  await db.query('select public.complete_department_process($1,$2)', [process, processVersion]);
  assert.equal(await scalar('select status from public.department_processes where id=$1', [process]), 'completed');
  assert.equal(await scalar("select count(*)::integer from public.process_evidence where process_id=$1 and evidence_type='approval'", [process]), 1);
  await asUser(a);
});
let ledgerBook, ledgerPeriod, cashAccount, expenseAccount;
test('ledger: book, period and chart of accounts are created for a client', async () => {
  ledgerBook = await scalar('select public.ensure_ledger_book($1,$2)', [orgA, clientA]);
  ledgerPeriod = await scalar("select public.open_ledger_period($1,'2026-09')", [ledgerBook]);
  cashAccount = await scalar(
    "select public.create_ledger_account($1,'1.1.01','Caixa','asset','debit',true,null)",
    [ledgerBook],
  );
  expenseAccount = await scalar(
    "select public.create_ledger_account($1,'4.1.01','Despesas com aluguel','expense','debit',true,null)",
    [ledgerBook],
  );
  assert.ok(ledgerBook && ledgerPeriod && cashAccount && expenseAccount);
});
test('ledger: unbalanced entry cannot be posted; balanced entry posts, is immutable and reverses', async () => {
  const draft = await scalar(
    "select public.create_ledger_entry($1,$2,'2026-09-05','Pagamento com diferença','',$3,$4)",
    [
      ledgerBook,
      ledgerPeriod,
      randomUUID(),
      JSON.stringify([
        { account_id: expenseAccount, side: 'debit', amount: '5000.00' },
        { account_id: cashAccount, side: 'credit', amount: '4999.99' },
      ]),
    ],
  );
  await assert.rejects(db.query('select public.post_ledger_entry($1,1)', [draft]), /desbalanceado/);
  await db.query('select public.discard_ledger_entry($1,1)', [draft]);
  const entry = await scalar(
    "select public.create_ledger_entry($1,$2,'2026-09-05','Pagamento de aluguel','',$3,$4)",
    [
      ledgerBook,
      ledgerPeriod,
      randomUUID(),
      JSON.stringify([
        { account_id: expenseAccount, side: 'debit', amount: '5000.00' },
        { account_id: cashAccount, side: 'credit', amount: '5000.00' },
      ]),
    ],
  );
  assert.equal(await scalar('select public.post_ledger_entry($1,1)', [entry]), 1);
  await assert.rejects(
    db.query("update public.ledger_journal_entries set description='hacked' where id=$1", [entry]),
    /permission denied/,
  );
  const reversal = await scalar(
    "select public.reverse_ledger_entry($1,$2,'2026-09-06','Pagamento duplicado por engano',$3)",
    [entry, ledgerPeriod, randomUUID()],
  );
  assert.equal(await scalar('select status from public.ledger_journal_entries where id=$1', [entry]), 'reversed');
  assert.equal(await scalar('select status from public.ledger_journal_entries where id=$1', [reversal]), 'posted');
});
test('ledger: period closes only when balanced with no drafts, and can be reopened with a reason', async () => {
  await db.query('select public.close_ledger_period($1,1)', [ledgerPeriod]);
  assert.equal(await scalar('select status from public.ledger_periods where id=$1', [ledgerPeriod]), 'closed');
  await assert.rejects(
    db.query(
      "select public.create_ledger_entry($1,$2,'2026-09-07','Deveria falhar','',$3,$4)",
      [ledgerBook, ledgerPeriod, randomUUID(), JSON.stringify([{ account_id: cashAccount, side: 'debit', amount: '1' }, { account_id: expenseAccount, side: 'credit', amount: '1' }])],
    ),
    /período contábil não está aberto/,
  );
  await db.query("select public.reopen_ledger_period($1,'Ajuste solicitado pelo cliente')", [ledgerPeriod]);
  assert.equal(await scalar('select status from public.ledger_periods where id=$1', [ledgerPeriod]), 'open');
});
test('ledger tenant isolation: org B cannot read or post org A ledger entries', async () => {
  await asUser(b);
  assert.equal(
    await scalar('select count(*)::integer from public.ledger_journal_entries where book_id=$1', [ledgerBook]),
    0,
  );
  await assert.rejects(db.query('select public.post_ledger_entry($1,1)', [randomUUID()]), /Permission denied/);
  await asUser(a);
});
test('ledger: bank statement import dedupes by fitid and reconciliation creates a balanced draft entry', async () => {
  const bankAccount = await scalar(
    "select public.create_ledger_bank_account($1,$2,'Banco Central do Escritório','Conta 1234-5')",
    [ledgerBook, cashAccount],
  );
  const rows = JSON.stringify([
    { date: '2026-09-10', amount: '-500.00', description: 'PIX ALUGUEL SETEMBRO', fitid: 'TX-1' },
    { date: '2026-09-11', amount: '1200.00', description: 'RECEBIMENTO CLIENTE', fitid: 'TX-2' },
  ]);
  const batch1 = await scalar(
    "select public.import_bank_statement($1,'extrato.ofx','checksum-1',$2)",
    [bankAccount, rows],
  );
  const batch2 = await scalar(
    "select public.import_bank_statement($1,'extrato.ofx','checksum-1',$2)",
    [bankAccount, rows],
  );
  assert.equal(batch2, batch1);
  assert.equal(
    await scalar('select count(*)::integer from public.ledger_bank_transactions where bank_account_id=$1', [bankAccount]),
    2,
  );
  const outflow = await scalar("select id from public.ledger_bank_transactions where fitid='TX-1'");
  const entryId = await scalar(
    "select public.create_entry_from_bank_transaction($1,$2,'Aluguel pago via PIX')",
    [outflow, expenseAccount],
  );
  assert.equal(await scalar('select status from public.ledger_bank_transactions where id=$1', [outflow]), 'matched');
  assert.equal(await scalar('select status from public.ledger_journal_entries where id=$1', [entryId]), 'draft');
  const debit = await scalar(
    "select sum(amount) from public.ledger_journal_lines where entry_id=$1 and side='debit'",
    [entryId],
  );
  const credit = await scalar(
    "select sum(amount) from public.ledger_journal_lines where entry_id=$1 and side='credit'",
    [entryId],
  );
  assert.equal(debit, credit);
  await assert.rejects(
    db.query('select public.create_entry_from_bank_transaction($1,$2,$3)', [outflow, expenseAccount, 'Duplicado']),
    /já foi conciliado/,
  );
});
test('ledger statements: DRE flags unmapped result accounts until mapped, and the balance sheet equation always holds', async () => {
  const revenueAccount = await scalar(
    "select public.create_ledger_account($1,'3.1.01','Receita de serviços','revenue','credit',true,null)",
    [ledgerBook],
  );
  const revenueEntry = await scalar(
    "select public.create_ledger_entry($1,$2,'2026-09-12','Recebimento de serviço','',$3,$4)",
    [
      ledgerBook,
      ledgerPeriod,
      randomUUID(),
      JSON.stringify([
        { account_id: cashAccount, side: 'debit', amount: '2000.00' },
        { account_id: revenueAccount, side: 'credit', amount: '2000.00' },
      ]),
    ],
  );
  await db.query('select public.post_ledger_entry($1,1)', [revenueEntry]);
  let checklist = await db.query('select check_key,ok from public.ledger_closing_checklist($1)', [ledgerPeriod]);
  assert.equal(checklist.rows.find((r) => r.check_key === 'unmapped_accounts').ok, false);
  let income = await db.query(
    "select line_key,amount from public.ledger_income_statement($1,'2026-09-01','2026-09-30')",
    [ledgerBook],
  );
  assert.ok(income.rows.some((r) => r.line_key === 'unmapped_revenue'));
  await db.query("select public.map_ledger_statement_account($1,$2,'gross_revenue')", [ledgerBook, revenueAccount]);
  income = await db.query(
    "select line_key,amount from public.ledger_income_statement($1,'2026-09-01','2026-09-30')",
    [ledgerBook],
  );
  assert.equal(Number(income.rows.find((r) => r.line_key === 'gross_revenue')?.amount), 2000);
  assert.ok(!income.rows.some((r) => r.line_key === 'unmapped_revenue'));
  checklist = await db.query('select check_key,ok from public.ledger_closing_checklist($1)', [ledgerPeriod]);
  assert.equal(checklist.rows.find((r) => r.check_key === 'unmapped_accounts').ok, false);
  await db.query("select public.map_ledger_statement_account($1,$2,'expense')", [ledgerBook, expenseAccount]);
  checklist = await db.query('select check_key,ok from public.ledger_closing_checklist($1)', [ledgerPeriod]);
  assert.equal(checklist.rows.find((r) => r.check_key === 'unmapped_accounts').ok, true);
  const trueResult = await scalar(
    `select coalesce(sum(case when a.account_type='revenue' then (case l.side when 'credit' then l.amount else -l.amount end)
                              else -(case l.side when 'debit' then l.amount else -l.amount end) end),0)
     from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
     join public.ledger_journal_entries e on e.id=l.entry_id
     where a.book_id=$1 and a.account_type in ('revenue','expense') and e.status in ('posted','reversed') and e.entry_date between '2026-09-01' and '2026-09-30'`,
    [ledgerBook],
  );
  const balance = await db.query(
    "select account_type,sum(balance) as total from public.ledger_balance_sheet($1,'2026-09-30') group by account_type",
    [ledgerBook],
  );
  const totals = Object.fromEntries(balance.rows.map((r) => [r.account_type, Number(r.total)]));
  const asset = totals.asset ?? 0,
    liability = totals.liability ?? 0,
    equity = totals.equity ?? 0;
  assert.equal(asset, 2000, 'saldo bancário em rascunho não deve compor o balanço');
  assert.ok(Math.abs(asset - (liability + equity + Number(trueResult))) < 0.01);
});

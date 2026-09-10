begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(12);
insert into auth.users(id,email,raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001','tenant-a@example.test','{}'),
 ('20000000-0000-4000-8000-000000000002','tenant-b@example.test','{}');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.org_a',public.create_organization('Tenant A','Pessoa A',array['DP'])::text,true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('test.org_b',public.create_organization('Tenant B','Pessoa B',array['DP'])::text,true);
insert into public.clients(id,organization_id,name) values
 ('30000000-0000-4000-8000-000000000001',current_setting('test.org_a')::uuid,'Cliente A'),
 ('30000000-0000-4000-8000-000000000002',current_setting('test.org_b')::uuid,'Cliente B');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.clients),1,'A sees only its client');
select extensions.is((select count(*)::integer from public.clients where id='30000000-0000-4000-8000-000000000002'),0,'A cannot read B by known ID');
select extensions.ok(public.is_org_member(current_setting('test.org_a')::uuid),'A is a member of A');
select extensions.ok(not public.is_org_member(current_setting('test.org_b')::uuid),'A is not a member of B');
select extensions.ok(not public.has_org_permission(current_setting('test.org_b')::uuid,'clients.create'),'A has no permission on B');
select extensions.throws_ok($$insert into public.clients(organization_id,name) values(current_setting('test.org_b')::uuid,'Attack')$$,'42501',null,'Cross-tenant insertion rejected');
select extensions.throws_ok($$insert into public.tasks(organization_id,client_id,competence,title) values(current_setting('test.org_a')::uuid,'30000000-0000-4000-8000-000000000002','2026-09','Attack')$$,'23503',null,'Composite foreign key rejects client B in task A');
select extensions.throws_ok($$delete from public.audit_logs$$,'42501',null,'Audit deletion denied');
select extensions.throws_ok($$update public.imports set status='completed'$$,'42501',null,'Import status cannot be forged');
select extensions.ok(not public.can_access_storage('organizations/'||current_setting('test.org_b')||'/clients/30000000-0000-4000-8000-000000000002/documents/test.pdf','read'),'Storage B denied');
select extensions.throws_ok($$select public.process_pending_imports()$$,'42501',null,'Worker RPC denied to user');
reset role;
select extensions.is((select count(*)::integer from pg_tables where schemaname='public' and not rowsecurity),0,'Every public table has RLS');
select * from extensions.finish();
rollback;

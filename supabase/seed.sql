-- Seed explícito para desenvolvimento local. Nunca aplique em produção.
begin;
create extension if not exists pgcrypto with schema extensions;
do $$
declare
 demo uuid := '10000000-0000-4000-8000-000000000001';
 reviewer uuid := '10000000-0000-4000-8000-000000000002';
 org uuid; client_a uuid; client_b uuid; client_id uuid; dp_process uuid; dp uuid; task uuid;
 i integer; statuses text[] := array['backlog','waiting_client','ready','in_progress','review','blocked','completed'];
begin
 if exists(select 1 from auth.users where id=demo) then raise notice 'Demo already exists; no duplicate seed.'; return; end if;
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
 values('00000000-0000-0000-0000-000000000000',demo,'authenticated','authenticated','demo@operis.test',extensions.crypt('OperisDemo!2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Alex Demo"}',now(),now(),'','','','');
 insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
 values(gen_random_uuid(),demo,demo::text,jsonb_build_object('sub',demo::text,'email','demo@operis.test','email_verified',true),'email',now(),now(),now());
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
 values('00000000-0000-0000-0000-000000000000',reviewer,'authenticated','authenticated','revisor@operis.test',extensions.crypt('OperisDemo!2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Revisor Demo"}',now(),now(),'','','','');
 insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
 values(gen_random_uuid(),reviewer,reviewer::text,jsonb_build_object('sub',reviewer::text,'email','revisor@operis.test','email_verified',true),'email',now(),now(),now());
 perform set_config('request.jwt.claim.sub',demo::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 org=public.create_organization('Operis Demo Accounting','Alex Demo',array['Departamento Pessoal','Fiscal','Contábil','Societário','BPO Financeiro','Compliance','Administração']);
 select id into dp from public.departments where organization_id=org and name='Departamento Pessoal';
 insert into public.clients(organization_id,name,trade_name,email) values(org,'Aurora Comércio — Fictícia','Aurora Demo','contato@aurora.example') returning id into client_a;
 insert into public.clients(organization_id,name,trade_name,email,tax_regime) values(org,'Horizonte Serviços — Fictícia','Horizonte Demo','contato@horizonte.example','presumido') returning id into client_b;
 insert into public.organization_members(organization_id,user_id,status) values(org,reviewer,'active');
 insert into public.member_roles(organization_id,member_id,role_id)
 select org,m.id,r.id from public.organization_members m join public.roles r on r.organization_id=m.organization_id and r.name='Operador'
 where m.organization_id=org and m.user_id=reviewer;
 for i in 1..28 loop
  insert into public.clients(organization_id,name,trade_name,email,tax_regime)
  values(org,'Empresa Fictícia '||lpad(i::text,2,'0'),'Cliente Demo '||lpad(i::text,2,'0'),'cliente'||i||'@example.test',case when i%3=0 then 'presumido' when i%3=1 then 'simples' else 'real' end);
 end loop;
 insert into public.competencies(organization_id,client_id,month) values(org,client_a,to_char(now(),'YYYY-MM')),(org,client_b,to_char(now(),'YYYY-MM'));
 for i in 1..7 loop
  insert into public.tasks(organization_id,client_id,competence,title,description,status,priority,department_id,assignee_id,due_date,blocked_reason)
  values(org,case when i%2=0 then client_b else client_a end,to_char(now(),'YYYY-MM'),(array['Organizar documentos da competência','Receber variáveis da folha','Conferir cadastro dos colaboradores','Revisar folha de ponto','Conferir admissões do mês','Preparar fechamento do cliente','Validar documentação recebida'])[i],'Tarefa fictícia do seed. Nenhum cálculo de folha é executado.',statuses[i],case when i=6 then 'urgent' when i=2 then 'high' else 'normal' end,dp,demo,current_date+(i-4),case when i=6 then 'Aguardando documento complementar do cliente.' else null end) returning id into task;
  insert into public.task_comments(organization_id,task_id,body) values(org,task,'Registro fictício para demonstrar a colaboração da equipe.');
 end loop;
 perform public.create_document_request(org,client_a,'Documentos da competência — Demonstração',to_char(now(),'YYYY-MM'),array['Folha de ponto','Admissões','Desligamentos','Variáveis'],current_date+3);
 i=0;
 for client_id in select id from public.clients where organization_id=org order by name limit 30 loop
  i=i+1;
  dp_process=public.start_department_process(org,client_id,to_char(now(),'YYYY-MM'),demo,reviewer,case when i between 16 and 20 then now()-interval '3 days' else now()+interval '7 days' end);
  if i<=5 then
   update public.workflow_step_runs set status='completed',started_at=now()-interval '5 days',completed_at=now()-interval '1 day' where workflow_step_runs.process_id=dp_process;
   perform set_config('operis.workflow_sync','1',true);
   update public.tasks set status='completed' where id in(select task_id from public.workflow_step_runs where workflow_step_runs.process_id=dp_process and task_id is not null);
   insert into public.process_approvals(organization_id,process_id,requested_by,decided_by,decision,requested_at,decided_at,comment) values(org,dp_process,demo,reviewer,'approved',now()-interval '2 days',now()-interval '1 day','Fixture de aprovação em dupla.');
   update public.department_processes set status='completed',prepared_by=demo,reviewer_id=reviewer,started_at=now()-interval '5 days',ready_at=now()-interval '2 days',completed_at=now()-interval '1 day' where id=dp_process;
  elsif i<=10 then
   update public.department_processes set status='waiting_client',started_at=now()-interval '2 days' where id=dp_process;
   update public.dp_collection_items set status='waiting' where dp_collection_items.process_id=dp_process and position<=5;
  elsif i<=15 then
   update public.department_processes set status='in_progress',started_at=now()-interval '2 days' where id=dp_process;
   update public.workflow_step_runs set status='completed',started_at=now()-interval '2 days',completed_at=now()-interval '1 day' where workflow_step_runs.process_id=dp_process and workflow_step_id in(select id from public.workflow_steps where position<=3);
  elsif i<=20 then
   update public.department_processes set status='requires_attention',started_at=now()-interval '4 days' where id=dp_process;
   insert into public.dp_validation_results(organization_id,process_id,validation_run_id,rule_id,rule_version,category,severity,entity_type,message) values(org,dp_process,gen_random_uuid(),'collection.pending',1,'operational','warning','collection_item','Cliente ainda não confirmou itens da coleta.');
  elsif i<=25 then
   update public.department_processes set status='blocked',started_at=now()-interval '2 days',blocked_reason='Aguardando documento complementar do cliente.' where id=dp_process;
  end if;
 end loop;
end $$;
commit;

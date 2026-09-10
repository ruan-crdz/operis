-- Explicit, local development seed. These are synthetic identities and records.
-- Run only through pnpm db:seed. Never apply to a production project.
begin;
create extension if not exists pgcrypto with schema extensions;
do $$
declare demo uuid:='10000000-0000-4000-8000-000000000001';org uuid;client_a uuid;client_b uuid;dp uuid;task uuid;i integer;statuses text[]:=array['backlog','waiting_client','ready','in_progress','review','blocked','completed'];
begin
 if exists(select 1 from auth.users where id=demo) then raise notice 'Demo already exists; no duplicate seed.';return;end if;
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
 values('00000000-0000-0000-0000-000000000000',demo,'authenticated','authenticated','demo@operis.test',extensions.crypt('OperisDemo!2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Alex Demo"}',now(),now(),'','','','');
 insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),demo,demo::text,jsonb_build_object('sub',demo::text,'email','demo@operis.test','email_verified',true),'email',now(),now(),now());
 perform set_config('request.jwt.claim.sub',demo::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 org=public.create_organization('Operis Demo Accounting','Alex Demo',array['Departamento Pessoal','Fiscal','Contábil','Societário','BPO Financeiro','Compliance','Administração']);
 select id into dp from public.departments where organization_id=org and name='Departamento Pessoal';
 insert into public.clients(organization_id,name,trade_name,email) values(org,'Aurora Comércio — Fictícia','Aurora Demo','contato@aurora.example') returning id into client_a;
 insert into public.clients(organization_id,name,trade_name,email,tax_regime) values(org,'Horizonte Serviços — Fictícia','Horizonte Demo','contato@horizonte.example','presumido') returning id into client_b;
 insert into public.competencies(organization_id,client_id,month) values(org,client_a,to_char(now(),'YYYY-MM')),(org,client_b,to_char(now(),'YYYY-MM'));
 for i in 1..7 loop
 insert into public.tasks(organization_id,client_id,competence,title,description,status,priority,department_id,assignee_id,due_date,blocked_reason)
 values(org,case when i%2=0 then client_b else client_a end,to_char(now(),'YYYY-MM'),(array['Organizar documentos da competência','Receber variáveis da folha','Conferir cadastro dos colaboradores','Revisar folha de ponto','Conferir admissões do mês','Preparar fechamento do cliente','Validar documentação recebida'])[i],'Tarefa fictícia criada pelo seed de desenvolvimento. Nenhum cálculo de folha é executado.',statuses[i],case when i=6 then 'urgent' when i=2 then 'high' else 'normal' end,dp,demo,current_date+(i-4),case when i=6 then 'Aguardando documento complementar do cliente.' else null end) returning id into task;
 insert into public.task_comments(organization_id,task_id,body) values(org,task,'Registro fictício para demonstrar a colaboração da equipe.');
 end loop;
 perform public.create_document_request(org,client_a,'Documentos da competência — Demonstração',to_char(now(),'YYYY-MM'),array['Folha de ponto','Admissões','Desligamentos','Variáveis'],current_date+3);
end $$;
commit;

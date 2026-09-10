insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('documents','documents',false,10485760,array['application/pdf','image/png','image/jpeg','text/csv','text/plain','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
 ('avatars','avatars',false,2097152,array['image/png','image/jpeg']) on conflict(id) do nothing;

create function public.can_access_storage(object_name text, operation text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(object_name,'/');org uuid;client uuid;permission text;begin
 if array_length(parts,1)<>6 or parts[1]<>'organizations' or parts[3]<>'clients' or parts[5] not in ('documents','imports') then return false;end if;
 begin org=parts[2]::uuid;client=parts[4]::uuid;exception when invalid_text_representation then return false;end;
 permission=case when parts[5]='imports' then 'imports.'||case when operation='read' then 'read' else 'create' end else 'documents.'||case when operation='read' then 'read' else 'upload' end end;
 return public.has_org_permission(org,permission) and exists(select 1 from public.clients where organization_id=org and id=client);
end $$;
revoke all on function public.can_access_storage(text,text) from public,anon;
grant execute on function public.can_access_storage(text,text) to authenticated;
create policy document_object_read on storage.objects for select to authenticated using(bucket_id='documents' and public.can_access_storage(name,'read'));
create policy document_object_insert on storage.objects for insert to authenticated with check(bucket_id='documents' and public.can_access_storage(name,'write'));
-- Originals cannot be overwritten. Failed uploads can be compensated before metadata exists.
create policy orphan_object_delete on storage.objects for delete to authenticated using(bucket_id='documents' and owner_id=auth.uid()::text and public.can_access_storage(name,'write') and not exists(select 1 from public.documents d where d.storage_path=name) and not exists(select 1 from public.imports i where i.storage_path=name));
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='avatars' and (split_part(name,'/',1)=auth.uid()::text or exists(select 1 from public.profiles p where p.avatar_path=name and public.share_organization(p.id))));
create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and split_part(name,'/',1)=auth.uid()::text and array_length(string_to_array(name,'/'),1)=2);
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and split_part(name,'/',1)=auth.uid()::text);

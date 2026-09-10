-- Extend the shared rate limiter to cover the AI assistant chat feature.
create or replace function public.consume_rate_limit(org_id uuid, feature_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare hits integer;
begin
 if not public.is_org_member(org_id) or feature_name not in ('ai_mapping','ai_assistant','upload') then raise exception 'Permission denied';end if;
 insert into public.rate_limits(organization_id,user_id,feature) values(org_id,auth.uid(),feature_name)
 on conflict(organization_id,user_id,feature) do update set hits=case when public.rate_limits.window_start<now()-interval '1 minute' then 1 else public.rate_limits.hits+1 end,window_start=case when public.rate_limits.window_start<now()-interval '1 minute' then now() else public.rate_limits.window_start end returning rate_limits.hits into hits;
 return hits<=case when feature_name='ai_mapping' then 6 when feature_name='ai_assistant' then 15 else 20 end;
end $$;
revoke all on function public.consume_rate_limit(uuid,text) from public,anon;
grant execute on function public.consume_rate_limit(uuid,text) to authenticated;

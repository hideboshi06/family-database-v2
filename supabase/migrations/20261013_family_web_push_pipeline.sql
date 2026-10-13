-- Real Web Push delivery. Family members can register only their own device.
-- An administrator must explicitly enable broadcasts after verifying remote delivery.
drop policy if exists "admin select own push subscription" on public.push_subscriptions;
drop policy if exists "admin insert own push subscription" on public.push_subscriptions;
drop policy if exists "admin update own push subscription" on public.push_subscriptions;
drop policy if exists "admin delete own push subscription" on public.push_subscriptions;
create policy "family read own push subscription" on public.push_subscriptions for select to authenticated
 using (user_id=(select auth.uid()) and (select private.is_family_member()));
create policy "family insert own push subscription" on public.push_subscriptions for insert to authenticated
 with check (user_id=(select auth.uid()) and (select private.is_family_member()));
create policy "family update own push subscription" on public.push_subscriptions for update to authenticated
 using (user_id=(select auth.uid()) and (select private.is_family_member()))
 with check (user_id=(select auth.uid()) and (select private.is_family_member()));
create policy "family delete own push subscription" on public.push_subscriptions for delete to authenticated
 using (user_id=(select auth.uid()) and (select private.is_family_member()));

-- Caller is verified as service_role by PostgREST before this function runs.
create or replace function public.active_family_push_subscriptions()
returns table(endpoint text, user_id uuid, p256dh text, auth text)
language sql stable security definer set search_path=''
as $$
 select p.endpoint,p.user_id,p.p256dh,p.auth
 from public.push_subscriptions p
 join auth.users u on u.id=p.user_id
 join public.family_members fm on fm.email=lower(u.email)
 where u.email_confirmed_at is not null and
   exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
$$;
revoke all on function public.active_family_push_subscriptions() from public,anon,authenticated;
grant execute on function public.active_family_push_subscriptions() to service_role;

create table if not exists public.push_delivery_runs (
  day date primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'started' check(status in ('started','finished','failed')),
  recipients integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0
);
alter table public.push_delivery_runs enable row level security;
revoke all on public.push_delivery_runs from public,anon,authenticated;
grant select,insert,update on public.push_delivery_runs to service_role;
grant select on public.push_delivery_runs to authenticated;
drop policy if exists "admins can review push history" on public.push_delivery_runs;
create policy "admins can review push history" on public.push_delivery_runs for select to authenticated
using ((select private.is_family_admin()));

-- A secret generated server-side in Postgres. It is never returned to client roles.
create table if not exists private.push_cron_auth (
  id boolean primary key default true check(id=true),
  token text not null
);
revoke all on private.push_cron_auth from public,anon,authenticated;
insert into private.push_cron_auth(id,token)
values(true,encode(gen_random_bytes(32),'hex')) on conflict(id) do nothing;
create or replace function public.verify_family_push_cron(candidate text)
returns boolean language sql stable security definer set search_path=''
as $$
 select candidate is not null and length(candidate)=64 and
  exists(select 1 from private.push_cron_auth where token=candidate);
$$;
revoke all on function public.verify_family_push_cron(text) from public,anon,authenticated;
grant execute on function public.verify_family_push_cron(text) to service_role;

-- A once-a-minute local-time check allows changing the saved time without rebuilding the cron job.
create or replace function private.invoke_family_push() returns void
language plpgsql security definer set search_path=''
as $$
declare
  settings record;
  token_value text;
begin
  select send_time,delivery_enabled into settings from public.notification_settings where id=1;
  if settings.delivery_enabled is distinct from true or settings.send_time is null then return; end if;
  if to_char(now() at time zone 'Asia/Tokyo','HH24:MI') <> to_char(settings.send_time,'HH24:MI') then return; end if;
  select token into token_value from private.push_cron_auth where id=true;
  if token_value is null then return; end if;
  perform net.http_post(
    url:='https://besevrrmhwmkdqmoiscf.supabase.co/functions/v1/family-push',
    headers:=jsonb_build_object('Content-Type','application/json','x-family-push-cron',token_value),
    body:='{"action":"scheduled"}'::jsonb,
    timeout_milliseconds:=30000
  );
end;
$$;
revoke all on function private.invoke_family_push() from public,anon,authenticated;
-- Start the cron safely: it makes no network calls while delivery_enabled is false.
select cron.schedule('family-push-dynamic-jst','* * * * *','select private.invoke_family_push();');

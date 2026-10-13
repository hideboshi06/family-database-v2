-- Shared morning notification time, editable only by verified family administrators.
-- Storing the preference does not start any automatic broadcasts.
create table if not exists public.notification_settings (
  id smallint primary key default 1 check (id = 1),
  send_time time without time zone not null default time '05:30',
  time_zone text not null default 'Asia/Tokyo' check (time_zone = 'Asia/Tokyo'),
  delivery_enabled boolean not null default false
);
insert into public.notification_settings (id,send_time,time_zone,delivery_enabled)
values (1,time '05:30','Asia/Tokyo',false)
on conflict (id) do nothing;

alter table public.notification_settings enable row level security;
drop policy if exists "family admins read notification settings" on public.notification_settings;
drop policy if exists "family admins update notification time" on public.notification_settings;
create policy "family admins read notification settings"
on public.notification_settings for select to authenticated
using ((select private.is_family_admin()));
create policy "family admins update notification time"
on public.notification_settings for update to authenticated
using ((select private.is_family_admin()))
with check ((select private.is_family_admin()));

-- Client administrators may change only the clock time, never the launch switch.
revoke all on public.notification_settings from public, anon, authenticated;
grant select on public.notification_settings to authenticated;
grant update (send_time) on public.notification_settings to authenticated;
grant select,insert,update,delete on public.notification_settings to service_role;

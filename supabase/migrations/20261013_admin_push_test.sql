-- Administrator-only Web Push pilot. No scheduled sends are created here.
create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 24 and 2048 and endpoint like 'https://%'),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth text not null check (char_length(auth) between 8 and 256),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "admin select own push subscription" on public.push_subscriptions;
drop policy if exists "admin insert own push subscription" on public.push_subscriptions;
drop policy if exists "admin update own push subscription" on public.push_subscriptions;
drop policy if exists "admin delete own push subscription" on public.push_subscriptions;
create policy "admin select own push subscription" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_family_admin()));
create policy "admin insert own push subscription" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_family_admin()));
create policy "admin update own push subscription" on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_family_admin()))
  with check (user_id = (select auth.uid()) and (select private.is_family_admin()));
create policy "admin delete own push subscription" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_family_admin()));
revoke all on public.push_subscriptions from public,anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- VAPID key is generated inside the authenticated Edge Function, not stored in source.
-- Service role can read/write; no client role can view its private JWK.
create table if not exists public.push_vapid_keys (
  id smallint primary key default 1 check (id = 1),
  private_jwk jsonb not null,
  public_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_vapid_keys enable row level security;
revoke all on public.push_vapid_keys from public,anon,authenticated;
grant select,insert,update on public.push_vapid_keys to service_role;

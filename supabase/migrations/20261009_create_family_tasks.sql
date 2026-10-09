-- General family to-dos are distinct from recurring cleaning and shopping inventory.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  assignee text null check (assignee is null or assignee in ('パパ','ママ','カイ')),
  due_on date null,
  completed boolean not null default false,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_open_due_idx on public.tasks (completed, due_on, created_at);
alter table public.tasks enable row level security;
create policy "family read tasks" on public.tasks for select to authenticated
  using ((select private.is_family_member()));
create policy "family write tasks" on public.tasks for all to authenticated
  using ((select private.is_family_member()))
  with check ((select private.is_family_member()));
grant select, insert, update, delete on public.tasks to authenticated;
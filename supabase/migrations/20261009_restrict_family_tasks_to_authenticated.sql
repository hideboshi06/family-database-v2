-- Restrict the new family task table to authenticated users explicitly.
-- Row-level security still checks family membership for every operation.
revoke all privileges on table public.tasks from public, anon;
grant select, insert, update, delete on table public.tasks to authenticated;

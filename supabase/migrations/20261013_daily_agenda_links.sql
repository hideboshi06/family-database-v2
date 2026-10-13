-- Optional webpage links for each individual agenda entry.
-- Existing plans are untouched. Null means the entry has no associated webpage.
alter table public.daily
  add column if not exists kai_url text,
  add column if not exists papa_url text,
  add column if not exists mama_url text,
  add column if not exists event_url text;

-- Only ordinary web URLs are accepted; never allow javascript: or data: links.
-- Application input is normalized and verified before saving.
do $$
declare column_name text;
begin
  foreach column_name in array array['kai_url','papa_url','mama_url','event_url'] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.daily'::regclass
      and conname = ('daily_'||column_name||'_web_url_check')
    ) then
      execute format(
        'alter table public.daily add constraint %I check (%I is null or (char_length(%I) <= 2048 and %I ~* %L))',
        'daily_'||column_name||'_web_url_check',
        column_name,column_name,column_name,
        '^https?://[^[:space:]]+$'
      );
    end if;
  end loop;
end $$;

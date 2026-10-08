-- Supabase: family weather at 05:35 JST, 20:35 UTC.
-- The shared token must first be stored as Vault secret family_weather_cron_token.
-- If no token exists, the job safely skips the HTTP call.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function private.invoke_family_weather()
returns void language plpgsql security definer set search_path=''
as $function$
declare cron_token text;
begin
  select decrypted_secret into cron_token from vault.decrypted_secrets
  where name='family_weather_cron_token' limit 1;
  if cron_token is null or length(cron_token) < 32 then
    raise notice 'Family weather cron token is not configured; skip invocation.';
    return;
  end if;
  perform net.http_post(
    url:='https://besevrrmhwmkdqmoiscf.supabase.co/functions/v1/family-weather-update',
    headers:=jsonb_build_object('Content-Type','application/json','x-weather-cron-token',cron_token),
    body:='{}'::jsonb,timeout_milliseconds:=30000
  );
end;
$function$;
revoke all on function private.invoke_family_weather() from public, anon, authenticated;
select cron.schedule('family-weather-daily-0535-jst','35 20 * * *',
  'select private.invoke_family_weather();');

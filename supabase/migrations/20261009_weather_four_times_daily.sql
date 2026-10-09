-- Four daily updates in Japan Standard Time: 05:00, 11:00, 17:00, 23:00.
-- pg_cron runs in UTC: 20:00 (previous day), 02:00, 08:00, 14:00.
-- Keep the existing authenticated private invoker; no secrets are copied into code.
do $$
begin
  if exists (select 1 from cron.job where jobname='family-weather-daily-0500-jst') then
    perform cron.unschedule('family-weather-daily-0500-jst');
  end if;
  if exists (select 1 from cron.job where jobname='family-weather-four-times-jst') then
    perform cron.unschedule('family-weather-four-times-jst');
  end if;
  perform cron.schedule(
    'family-weather-four-times-jst',
    '0 2,8,14,20 * * *',
    'select private.invoke_family_weather();'
  );
end;
$$;
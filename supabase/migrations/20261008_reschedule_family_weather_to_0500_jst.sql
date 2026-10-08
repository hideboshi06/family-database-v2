-- Reschedule Family Database v2 weather forecast refresh from 05:35 to 05:00 JST.
-- Cron runs in UTC: 20:00 UTC on the previous day = 05:00 JST.
-- Keep this separate from the original 05:35 migration to preserve history.
select cron.unschedule('family-weather-daily-0535-jst');
select cron.schedule(
  'family-weather-daily-0500-jst',
  '0 20 * * *',
  'select private.invoke_family_weather();'
);

-- Gebzem: scheduled jobs (pg_cron). Re-runnable.
create extension if not exists pg_cron;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('gebzem-expire-listings', 'gebzem-roll-demo-duty') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- 00:05 UTC = 03:05 Europe/Istanbul
select cron.schedule('gebzem-expire-listings', '5 0 * * *', $$select public.expire_listings()$$);
-- 05:31 UTC = 08:31 Europe/Istanbul (right after the 08:30 duty switch)
select cron.schedule('gebzem-roll-demo-duty', '31 5 * * *', $$select public.roll_demo_duty()$$);

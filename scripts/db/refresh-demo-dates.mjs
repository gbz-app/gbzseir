// Keep the prototype populated: move DEMO listings and events (is_demo = true) forward in time.
// Usage: node --env-file=.env.local scripts/db/refresh-demo-dates.mjs          (runs it)
//        node --env-file=.env.local scripts/db/refresh-demo-dates.mjs --print  (prints the SQL only)
//   Listings: active (or cron-expired) demo listings expire at the end of the day 60 days from today (Istanbul)
//             and are active again. published_at is kept.
//   Events:   demo events are spread over the next 6 weeks (day 1..42, stable order by id), keeping their
//             Istanbul time of day and their duration.
//   Idempotent: every run on the same day gives the same dates. Real rows (is_demo = false) are never touched.
//   Public pages pick the new dates up within their ISR window (about 5 minutes).
const TZ = "Europe/Istanbul";

export const REFRESH_SQL = `
with
listing_rows as (
  update public.listings
     set expires_at = (date_trunc('day', now() at time zone '${TZ}') + interval '60 days 23 hours 59 minutes') at time zone '${TZ}',
         status = 'active'
   where is_demo
     and status in ('active', 'expired')
  returning id
),
ranked as (
  select id, starts_at, ends_at,
         row_number() over (order by id) - 1 as i,
         count(*) over () as n
    from public.events
   where is_demo
),
planned as (
  select id,
         ((date_trunc('day', now() at time zone '${TZ}')
           + make_interval(days => 1 + (i * 42 / n)::int)
           + ((starts_at at time zone '${TZ}')::time)::interval) at time zone '${TZ}') as new_start,
         ends_at - starts_at as duration
    from ranked
),
event_rows as (
  update public.events e
     set starts_at = p.new_start,
         ends_at = case when e.ends_at is null then null else p.new_start + p.duration end
    from planned p
   where e.id = p.id
     and e.is_demo
  returning e.starts_at, e.ends_at
)
select (select count(*) from listing_rows) as listings,
       (select count(*) from event_rows) as events,
       (select min(starts_at) from event_rows) as first_event,
       (select max(coalesce(ends_at, starts_at)) from event_rows) as last_event;
`;

if (process.argv.includes("--print")) {
  console.log(REFRESH_SQL);
} else {
  // Loaded here so --print works without SUPABASE_ACCESS_TOKEN (sql.mjs exits when it is missing).
  const { sql } = await import("./lib.mjs");
  const [out] = await sql(REFRESH_SQL);
  console.log(
    `demo listings refreshed: ${out?.listings ?? 0}, demo events moved: ${out?.events ?? 0}` +
      (out?.first_event ? ` (${String(out.first_event).slice(0, 10)} .. ${String(out.last_event).slice(0, 10)})` : ""),
  );
}

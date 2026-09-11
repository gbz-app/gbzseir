-- Business panel: real page views (audit step 32). "Numara gösterimi" was always 0 for non-service businesses
-- because business pages never log phone_reveal. business_panel_stats now also counts analytics page views of
-- /firma/<slug> and /menu/<slug> for the last 7 and 30 days, leaving out the owner's own sessions.
-- Starts from the 2026091250_business_open.sql body. Additive and re-runnable.

-- Page views of one path over a time window (business panel counters).
create index if not exists analytics_page_views_path_idx on public.analytics_page_views (path, created_at desc);

create or replace function public.business_panel_stats(p_business_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_slug text;
  v_listing_ids uuid[];
  -- Calendar week (Monday 00:00) in Istanbul time.
  v_week_start timestamptz := date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_prev_start timestamptz := (date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '7 days') at time zone 'Europe/Istanbul';
  v_calls_week int;
  v_calls_prev int;
  v_calls_total int;
  v_reveals_week int;
  v_directions_week int;
  v_views_7d int;
  v_views_30d int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;

  -- Only the caller's own businesses; the oldest one when no id is given.
  select b.id, b.slug into v_biz, v_slug
    from public.businesses b
   where b.owner_id = v_uid and (p_business_id is null or b.id = p_business_id)
   order by b.created_at
   limit 1;
  if v_biz is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_listing_ids := array(select l.id from public.listings l where l.business_id = v_biz);

  select count(*) filter (where e.event = 'call_click' and e.created_at >= v_week_start),
         count(*) filter (where e.event = 'call_click' and e.created_at >= v_prev_start and e.created_at < v_week_start),
         count(*) filter (where e.event = 'call_click'),
         count(*) filter (where e.event = 'phone_reveal' and e.created_at >= v_week_start),
         count(*) filter (where e.event = 'directions' and e.created_at >= v_week_start)
    into v_calls_week, v_calls_prev, v_calls_total, v_reveals_week, v_directions_week
    from public.contact_events e
   where (e.subject_type = 'business' and e.subject_id = v_biz)
      or (e.subject_type in ('listing', 'job') and e.subject_id = any (v_listing_ids));

  -- Business page + QR menu views (rolling 7 / 30 days). A session the owner signed in to is not counted.
  select count(*) filter (where v.created_at >= now() - interval '7 days'),
         count(*)
    into v_views_7d, v_views_30d
    from public.analytics_page_views v
    join public.analytics_sessions s on s.id = v.session_id
   where v.path in ('/firma/' || v_slug, '/menu/' || v_slug)
     and v.created_at >= now() - interval '30 days'
     and v.user_id is distinct from v_uid
     and s.user_id is distinct from v_uid;

  return jsonb_build_object(
    'ok', true,
    'business_id', v_biz,
    'week_start', v_week_start,
    'leads_week', (select count(*) from public.leads l where l.business_id = v_biz and l.created_at >= v_week_start),
    'leads_waiting', (select count(*)
                        from public.leads l
                        join public.service_requests r on r.id = l.request_id
                       where l.business_id = v_biz and l.status in ('sent', 'seen') and r.status = 'open'),
    'calls_week', v_calls_week,
    'calls_prev_week', v_calls_prev,
    'calls_total', v_calls_total,
    'phone_reveals_week', v_reveals_week,
    'directions_week', v_directions_week,
    'page_views_7d', v_views_7d,
    'page_views_30d', v_views_30d,
    'reviews_unreplied', (select count(*) from public.reviews v where v.business_id = v_biz and v.reply is null)
  );
end $$;

comment on function public.business_panel_stats(uuid) is
  'Business panel counters for one of the caller''s own businesses (p_business_id; oldest when null): leads this week / waiting, call clicks (business + its listings) this week / previous week / total, phone reveals and directions this week, page views of /firma/<slug> and /menu/<slug> in the last 7 / 30 days (owner''s own sessions excluded), unreplied reviews. {ok:false, reason:not_found} when the caller does not own it.';

revoke all on function public.business_panel_stats(uuid) from public, anon;
grant execute on function public.business_panel_stats(uuid) to authenticated;

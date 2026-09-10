-- Module profile-business (NN=40): statistics for the business panel (/isletme).
-- contact_events is readable by admins only (RLS), so owners get their own aggregate counts through this
-- SECURITY DEFINER RPC. It never returns individual events, caller ids or IP hashes.
-- Additive and re-runnable.

create or replace function public.business_panel_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_listing_ids uuid[];
  -- Calendar week (Monday 00:00) in Istanbul time.
  v_week_start timestamptz := date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_prev_start timestamptz := (date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '7 days') at time zone 'Europe/Istanbul';
  v_calls_week int;
  v_calls_prev int;
  v_calls_total int;
  v_reveals_week int;
  v_directions_week int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;

  select b.id into v_biz from public.businesses b where b.owner_id = v_uid order by b.created_at limit 1;
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

  return jsonb_build_object(
    'ok', true,
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
    'reviews_unreplied', (select count(*) from public.reviews v where v.business_id = v_biz and v.reply is null)
  );
end $$;

comment on function public.business_panel_stats() is
  'Business panel counters for the caller''s own business: leads this week / waiting, call clicks (business + its listings) this week / previous week / total, phone reveals and directions this week, unreplied reviews. {ok:false, reason:not_found} without a business.';

revoke all on function public.business_panel_stats() from public, anon;
grant execute on function public.business_panel_stats() to authenticated;

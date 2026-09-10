-- Gebzem: Row Level Security policies, grants and public views.
-- Re-runnable: every policy is dropped before being (re)created.
set search_path = public, extensions;

-- Enable RLS on every public table.
do $$
declare t text;
begin
  foreach t in array array[
    'neighbourhoods', 'app_settings', 'profiles', 'service_categories', 'question_flows', 'businesses',
    'business_service_categories', 'business_service_areas', 'business_photos', 'business_documents',
    'poi', 'pharmacy_duty', 'news_sources', 'news_items', 'announcements', 'listing_categories', 'listings',
    'listing_media', 'favorites', 'reports', 'contact_events', 'service_requests', 'leads', 'reviews',
    'notifications', 'push_subscriptions', 'contact_messages', 'demo_otp'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Helper: drop all existing policies of a table (keeps this file re-runnable).
create or replace function private.drop_policies(p_table text)
returns void
language plpgsql
as $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = p_table loop
    execute format('drop policy if exists %I on public.%I', r.policyname, p_table);
  end loop;
end $$;

-- Helper used by policies: does the current user own this business?
create or replace function public.owns_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.businesses where id = p_business_id and owner_id = auth.uid())
$$;

-- Helper used by policies: is this business publicly visible (approved)?
create or replace function public.business_is_public(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.businesses where id = p_business_id and status = 'approved')
$$;

-- Helper used by policies: does the current user own this listing?
create or replace function public.owns_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Public reference data: read for everyone, write for admins.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['neighbourhoods', 'app_settings', 'poi', 'pharmacy_duty', 'news_sources', 'news_items',
                           'listing_categories', 'service_categories'] loop
    perform private.drop_policies(t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- question_flows: published flows are public.
select private.drop_policies('question_flows');
create policy "public read published" on public.question_flows for select to anon, authenticated
  using (published or public.is_admin());
create policy "admin write" on public.question_flows for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- announcements: public read of not-yet-ended ones.
select private.drop_policies('announcements');
create policy "public read active" on public.announcements for select to anon, authenticated
  using (ends_at is null or ends_at > now() or public.is_admin());
create policy "admin write" on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles: own row (+ admin). Public display data via view public_profiles.
-- ---------------------------------------------------------------------------
select private.drop_policies('profiles');
create policy "own read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy "own update" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());
create policy "admin delete" on public.profiles for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
select private.drop_policies('businesses');
create policy "public read approved" on public.businesses for select to anon, authenticated
  using (status = 'approved' or owner_id = (select auth.uid()) or public.is_admin());
create policy "owner insert" on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.is_admin());
create policy "owner update" on public.businesses for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());
create policy "admin delete" on public.businesses for delete to authenticated
  using (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['business_service_categories', 'business_service_areas', 'business_photos'] loop
    perform private.drop_policies(t);
    execute format($p$create policy "public read" on public.%I for select to anon, authenticated
      using (public.business_is_public(business_id) or public.owns_business(business_id) or public.is_admin())$p$, t);
    execute format($p$create policy "owner write" on public.%I for all to authenticated
      using (public.owns_business(business_id) or public.is_admin())
      with check (public.owns_business(business_id) or public.is_admin())$p$, t);
  end loop;
end $$;

select private.drop_policies('business_documents');
create policy "owner read" on public.business_documents for select to authenticated
  using (public.owns_business(business_id) or public.is_admin());
create policy "owner insert" on public.business_documents for insert to authenticated
  with check (public.owns_business(business_id) or public.is_admin());
create policy "owner delete" on public.business_documents for delete to authenticated
  using (public.owns_business(business_id) or public.is_admin());

-- reviews: public read for approved businesses; writes only through RPCs.
select private.drop_policies('reviews');
create policy "public read" on public.reviews for select to anon, authenticated
  using (public.business_is_public(business_id) or public.owns_business(business_id)
         or author_id = (select auth.uid()) or public.is_admin());
create policy "admin write" on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
select private.drop_policies('listings');
create policy "public read published" on public.listings for select to anon, authenticated
  using (status in ('active', 'sold', 'filled'));
create policy "owner read" on public.listings for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());
create policy "owner insert" on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.is_admin());
create policy "owner update" on public.listings for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());
create policy "owner delete" on public.listings for delete to authenticated
  using ((owner_id = (select auth.uid()) and status in ('draft', 'rejected', 'pending_review')) or public.is_admin());

select private.drop_policies('listing_media');
create policy "public read" on public.listing_media for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.status in ('active', 'sold', 'filled'))
         or public.owns_listing(listing_id) or public.is_admin());
create policy "owner write" on public.listing_media for all to authenticated
  using (public.owns_listing(listing_id) or public.is_admin())
  with check (public.owns_listing(listing_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Favorites, reports, contact events, contact messages
-- ---------------------------------------------------------------------------
select private.drop_policies('favorites');
create policy "own all" on public.favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

select private.drop_policies('reports');
create policy "anyone insert" on public.reports for insert to anon, authenticated
  with check (reporter_id is null or reporter_id = (select auth.uid()));
create policy "own or admin read" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());
create policy "admin update" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin delete" on public.reports for delete to authenticated
  using (public.is_admin());

select private.drop_policies('contact_events');
create policy "admin read" on public.contact_events for select to authenticated
  using (public.is_admin());

select private.drop_policies('contact_messages');
create policy "anyone insert" on public.contact_messages for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
create policy "admin read" on public.contact_messages for select to authenticated
  using (public.is_admin());
create policy "admin update" on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Services: requests (customer + admin), leads (business owner + customer + admin).
-- All writes go through RPCs.
-- ---------------------------------------------------------------------------
select private.drop_policies('service_requests');
create policy "customer read" on public.service_requests for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_admin());
create policy "admin write" on public.service_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

select private.drop_policies('leads');
create policy "business or customer read" on public.leads for select to authenticated
  using (public.owns_business(business_id)
         or exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = (select auth.uid()))
         or public.is_admin());
create policy "admin write" on public.leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Notifications + push subscriptions
-- ---------------------------------------------------------------------------
select private.drop_policies('notifications');
create policy "own read" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "own update" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own delete" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "admin insert" on public.notifications for insert to authenticated
  with check (public.is_admin());

select private.drop_policies('push_subscriptions');
create policy "own all" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- demo_otp: no policies at all (only security definer RPCs and the auth hook touch it).
select private.drop_policies('demo_otp');
revoke all on table public.demo_otp from anon, authenticated;

-- contact_events: no direct writes.
revoke insert, update, delete on table public.contact_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
-- Public display data of users (no phone, no email). Owner-privileged view on purpose.
create or replace view public.public_profiles
with (security_invoker = false) as
select p.id,
       public.short_name(p.full_name) as display_name,
       p.avatar_url,
       p.neighbourhood_id,
       (p.phone is not null) as phone_verified,
       p.created_at
  from public.profiles p
 where p.status <> 'banned';
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- Leads of the signed-in business owner (anonymous request data; no customer identity).
create or replace view public.my_leads
with (security_invoker = false) as
select l.id,
       l.request_id,
       l.business_id,
       l.status,
       l.offer_price_try,
       l.offer_note,
       l.wave_no,
       l.seen_at,
       l.accepted_at,
       l.created_at,
       r.status as request_status,
       r.when_type,
       r.when_date,
       r.accepted_count,
       r.max_providers,
       r.created_at as request_created_at,
       r.category_id,
       sc.name as category_name,
       sc.slug as category_slug,
       sc.icon as category_icon,
       r.neighbourhood_id,
       n.name as neighbourhood_name,
       coalesce(array_length(r.photos, 1), 0) as photo_count,
       (r.note is not null and r.note <> '') as has_note
  from public.leads l
  join public.businesses b on b.id = l.business_id
  join public.service_requests r on r.id = l.request_id
  left join public.service_categories sc on sc.id = r.category_id
  left join public.neighbourhoods n on n.id = r.neighbourhood_id
 where b.owner_id = auth.uid() or public.is_admin();
revoke all on public.my_leads from anon, authenticated;
grant select on public.my_leads to authenticated;

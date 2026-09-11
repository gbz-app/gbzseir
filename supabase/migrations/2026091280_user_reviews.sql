-- Any signed-in user can review an approved business (one review per user per business, editable).
-- Hired-request reviews (submit_review, request_id set) keep working as before. Additive and re-runnable.

create unique index if not exists reviews_user_business_uidx on public.reviews (business_id, author_id) where request_id is null;

create or replace function public.submit_business_review(p_business_id uuid, p_rating int, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.businesses;
  v_id uuid;
  v_comment text := nullif(left(btrim(coalesce(p_comment, '')), 1000), '');
begin
  if v_uid is null then
    raise exception 'Yorum yapmak için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status in ('banned', 'restricted')) then
    return jsonb_build_object('ok', false, 'reason', 'restricted');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rating');
  end if;
  select * into v_b from public.businesses where id = p_business_id;
  if not found or v_b.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_b.owner_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'own_business');
  end if;

  insert into public.reviews (business_id, author_id, rating, comment)
  values (p_business_id, v_uid, p_rating, v_comment)
  on conflict (business_id, author_id) where request_id is null
    do update set rating = excluded.rating, comment = excluded.comment
  returning id into v_id;

  update public.businesses b
     set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where business_id = b.id), 0),
         rating_count = (select count(*) from public.reviews where business_id = b.id)
   where b.id = p_business_id;

  perform private.notify(v_b.owner_id, 'review_new', 'Yeni değerlendirme: ' || p_rating || ' yıldız',
    v_b.name || ' için bir kullanıcı değerlendirme yaptı.', '/isletme/sec?b=' || v_b.id || '&next=/isletme/yorumlar');
  return jsonb_build_object('ok', true, 'review_id', v_id);
end $$;

revoke all on function public.submit_business_review(uuid, int, text) from public, anon;
grant execute on function public.submit_business_review(uuid, int, text) to authenticated;

-- The author can delete their own free review (rating is recomputed).
create or replace function public.delete_my_business_review(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  delete from public.reviews where business_id = p_business_id and author_id = v_uid and request_id is null;
  get diagnostics v_n = row_count;
  update public.businesses b
     set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where business_id = b.id), 0),
         rating_count = (select count(*) from public.reviews where business_id = b.id)
   where b.id = p_business_id;
  return jsonb_build_object('ok', v_n > 0);
end $$;

revoke all on function public.delete_my_business_review(uuid) from public, anon;
grant execute on function public.delete_my_business_review(uuid) to authenticated;

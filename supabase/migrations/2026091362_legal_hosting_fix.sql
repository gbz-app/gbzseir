-- Legal texts: correct the hosting location. The v0.1 drafts (2026091315) said data is stored in Supabase data centres in
-- the European Union. In fact Supabase (database, auth, storage) runs in Tokyo, Japan (ap-northeast-1), the Vercel server
-- functions run in Tokyo (hnd1) and the app is served through Vercel's global edge network.
-- Published versions are frozen (proof of what users accepted), so every slug whose live text states the hosting location
-- or the transfer abroad (kvkk, gizlilik) gets a NEW published version: the live body is copied and only those sentences
-- change; the KVKK art. 9 transfer wording and the [Hukuki inceleme ...] note stay. profiles.kvkk_version is not touched,
-- so users keep the version they accepted; new acceptances are stamped with the new live version.
-- Re-runnable: a slug whose live text no longer mentions the EU is skipped; changed wording fails instead of being skipped.

do $$
declare
  r record;
  v_live public.legal_texts;
  v_body text;
  v_major int;
  v_minor int;
  v_version text;
begin
  for r in
    select * from (values
      ('kvkk',
       array[
         'Supabase (veritabanı, kimlik doğrulama ve dosya depolama; Avrupa Birliği''ndeki veri merkezleri), Vercel (uygulamanın barındırılması ve dünya genelindeki sunucular üzerinden sunulması)',
         'Yurt dışına aktarım: Supabase ve Vercel sunucuları Türkiye dışındadır.'],
       array[
         'Supabase (veritabanı, kimlik doğrulama ve dosya depolama; Japonya''nın Tokyo bölgesindeki veri merkezleri), Vercel (uygulamanın barındırılması ve dünya genelindeki sunucular üzerinden sunulması; sunucu işlemleri Japonya''nın Tokyo bölgesindeki veri merkezlerinde çalışır)',
         'Yurt dışına aktarım: Supabase ve Vercel sunucuları Türkiye dışındadır. Kişisel verilerin Japonya''nın Tokyo bölgesindeki veri merkezlerinde saklanır ve işlenir; uygulama ayrıca Vercel''in dünya genelindeki sunucuları üzerinden sunulur.']),
      ('gizlilik',
       array['Veriler Supabase''in Avrupa Birliği''ndeki veri merkezlerinde saklanır; uygulama Vercel altyapısı üzerinden sunulur.'],
       array['Veriler Türkiye dışında, Japonya''nın Tokyo bölgesindeki Supabase veri merkezlerinde saklanır; uygulamanın sunucu işlemleri de aynı bölgedeki Vercel altyapısında çalışır ve uygulama Vercel''in dünya genelindeki sunucuları üzerinden sunulur.'])
    ) as t (slug, old_texts, new_texts)
  loop
    -- Live version = newest published (same rule as the /yasal pages and the KVKK acceptance trigger).
    select * into v_live from public.legal_texts t
    where t.slug = r.slug and t.published_at is not null and t.published_at <= now()
    order by t.published_at desc limit 1;
    if not found or position('Avrupa Birliği' in v_live.body_md) = 0 then
      raise notice 'legal_texts %: live text has no EU hosting wording, skipped', r.slug;
      continue;
    end if;

    v_body := v_live.body_md;
    for i in 1 .. cardinality(r.old_texts) loop
      if position(r.old_texts[i] in v_body) = 0 then
        raise exception 'legal_texts %: expected sentence not found in live version %: %...', r.slug, v_live.version, left(r.old_texts[i], 60);
      end if;
      v_body := replace(v_body, r.old_texts[i], r.new_texts[i]);
    end loop;
    if position('Avrupa Birliği' in v_body) > 0 then
      raise exception 'legal_texts %: EU hosting wording left after the fix', r.slug;
    end if;

    -- Next free "major.minor" after the highest one (same rule as suggestNextVersion in the admin editor).
    select m[1]::int, m[2]::int into v_major, v_minor
    from (select regexp_match(t.version, '^(\d+)\.(\d+)$') as m from public.legal_texts t where t.slug = r.slug) s
    where m is not null
    order by m[1]::int desc, m[2]::int desc limit 1;
    if not found then
      v_major := 1;
      v_minor := -1;
    end if;
    loop
      v_minor := v_minor + 1;
      v_version := v_major || '.' || v_minor;
      exit when not exists (select 1 from public.legal_texts t where t.slug = r.slug and t.version = v_version);
    end loop;

    insert into public.legal_texts (slug, version, title, body_md, pending_review, published_at)
    values (r.slug, v_version, v_live.title, v_body, true, now());
    raise notice 'legal_texts %: published % (from %)', r.slug, v_version, v_live.version;
  end loop;
end $$;

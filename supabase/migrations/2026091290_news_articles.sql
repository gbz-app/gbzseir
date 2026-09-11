-- Our own news articles (written in the admin site), shown in the app with an in-app detail page.
-- RSS headlines (news_sources) stay as a fallback. Additive and re-runnable.

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  summary text check (summary is null or char_length(summary) <= 300),
  body text not null default '' check (char_length(body) <= 20000),
  category text not null default 'gundem' check (category in ('gundem', 'siyaset', 'belediye', 'spor', 'etkinlik', 'duyuru')),
  cover_url text check (cover_url is null or cover_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  author_id uuid references public.profiles (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists news_articles_published_idx on public.news_articles (status, published_at desc);

drop trigger if exists set_updated_at on public.news_articles;
create trigger set_updated_at before update on public.news_articles for each row execute function private.set_updated_at();

alter table public.news_articles enable row level security;
drop policy if exists "public read" on public.news_articles;
drop policy if exists "admin write" on public.news_articles;
create policy "public read" on public.news_articles for select to anon, authenticated
  using ((status = 'published' and published_at is not null and published_at <= now()) or public.is_admin());
create policy "admin write" on public.news_articles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.news_articles to anon, authenticated;
grant insert, update, delete on public.news_articles to authenticated;

-- One welcome article about the app itself (not a news report), so the detail page can be seen before the team writes.
insert into public.news_articles (slug, title, summary, body, category, status, published_at, is_demo)
values (
  'gebzem-yayinda',
  'Gebzem yayında: şehir rehberi artık cebinde',
  'Nöbetçi eczane, taksi durakları, gezilecek yerler, işletmeler ve duyurular tek uygulamada.',
  'Gebzem, Gebze''de yaşayanlar için hazırlanan şehir uygulamasıdır.' || E'\n\n' ||
  'Nöbetçi eczaneleri, taksi duraklarını, camileri ve durakları haritada görebilir; yemek, kafe, otel, sağlık ve eğitim gibi kategorilerde işletmeleri inceleyebilirsiniz.' || E'\n\n' ||
  'Haberler bölümünde Gebzem ekibinin hazırladığı yazılar yayınlanacak. Görüş ve önerileriniz için Profil > Yardım ve destek bölümünü kullanabilirsiniz.',
  'duyuru', 'published', now(), true
)
on conflict (slug) do nothing;

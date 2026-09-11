# Gebzem: mimari ağacı ve devir belgesi

Bu belge, eski sohbet olmadan projeye giren yeni bir Claude Code oturumu ya da geliştirici içindir. İçerik 2026-09-11 tarihli kodun anlık görüntüsünden okundu; o sırada başka ajanlar da kodu değiştiriyordu, bu yüzden en son durumu her zaman kodda kontrol et. Kodda ya da canlı veritabanında doğrulanamayan her bilgi "(doğrulanmadı)" ile işaretli. Son commit: `d3bf2ac`, remote: `github.com/gbz-app/gbzseir`.

## 0. Önce bunları oku

- `AGENTS.md`: bu Next.js sürümü (16.3.4) eğitim verisindeki Next.js'ten farklı. Kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehberi oku.
- `supabase/README.md`: DB iş akışı, cron tablosu, seed sırası, demo hesaplar, auth ayarı, OTP'yi canlıya alma.
- `docs/contracts/db-contract.md` ve `docs/contracts/app-contract.md`: tablo, RPC ve uygulama iskeleti sözleşmeleri (2026-09-11'de güncellendi).
- `docs/mimari-plan.md`: 10 Eylül'deki ilk plan. Asıl yapı ondan farklı, tarihçe olarak oku.
- Sırlar repoda yok. `.env.local` git'e girmez. `SUPABASE_ACCESS_TOKEN` oturum scratchpad'indeki `secrets.ps1` dosyasından gelir. Değerleri asla yazdırma, commit'leme, belleğe yazma.

## 1. Özet

- **Ne:** Gebzem, Kocaeli/Gebze şehir rehberi PWA'sı: nöbetçi eczane, yakınımda haritası, şehir rehberi (resmî kurumlar, ATM, akaryakıt, şarj), 2. el ve iş ilanları, usta ve hizmet talebi, işletme sayfaları (QR menü, oda, doktor), etkinlikler, haberler, duyurular, GebzemAI asistanı.
- **Public site:** https://gbzsehir.vercel.app (Vercel projesi `gbzsehir`). `NEXT_PUBLIC_APP_MODE` boş.
- **Admin site:** https://gbzsehir-admin.vercel.app (Vercel projesi `gbzsehir-admin`). Aynı repodan `NEXT_PUBLIC_APP_MODE=admin` ile derlenir. Yalnız `/admin` ve `/giris` sunar (`src/proxy.ts`). Bu projede `SUPABASE_SERVICE_ROLE_KEY` bilerek YOK: tüm admin işleri admin'in kendi oturumuyla admin RPC'lerinden geçer. Service role gereken işler pg_net ile public uygulamanın `/api/cron/*` rotalarına kuyruklanır.
- Public uygulamada `/admin/*` adresi admin sitesine 307 ile yönlenir. Uygulamanın içinde admin'e giden hiçbir link yok.
- **Framework:** Next.js 16.3.4 App Router, Turbopack. Middleware yerine `src/proxy.ts` (Next 16 Proxy) kullanılıyor. React 19.2.8, TypeScript 5.
- **UI:** Tailwind CSS v4 (`@tailwindcss/postcss`) ve shadcn/ui (`components.json` style `radix-nova`, Lucide ikonlar). Font Google Sans. Ana renk `#8C6CF0`.
- **Diğer UI kütüphaneleri:** sonner, vaul, cmdk, embla, react-hook-form + zod v4.
- **Veri:** Supabase (Postgres + PostGIS, pg_trgm, unaccent, pgcrypto, pg_cron, pg_net, Vault). Proje ref'i `fboythglcjofakbskstg`, bölge ap-northeast-1 (Tokyo). RLS her tabloda açık. İş kuralları SECURITY DEFINER RPC'lerde ve guard trigger'larda.
- **Barındırma:** Vercel functions `hnd1` (Tokyo), `vercel.json` içinde. DB'ye yakın kalsın diye bölgeyi değiştirme. `vercel.json` içinde `crons: []`: bütün zamanlanmış işler pg_cron'da.
- **Push:** Web Push (VAPID, `web-push` paketi). Gönderici `/api/notifications/push`, tetikleyen DB trigger'ı ve pg_net.
- **Medya:** Cloudflare R2 (S3 SigV4 presigned PUT, `src/lib/media/*`): ilan fotoğrafı, ilan videosu, video kapağı. Diğer görseller Supabase Storage `media` bucket'ında.
- **Harita:** MapLibre GL v6 ve OpenFreeMap karoları (`src/features/nearby/map/*`). Google Maps JS API yalnız `LocationPicker` içinde kullanılıyor (Places Autocomplete ve ters geocode). Anahtar yoksa MapLibre'ye düşer.
- **GebzemAI:** sağlayıcı katmanı OpenAI (Chat Completions) ve Anthropic (Messages) destekler, ikisi de fetch ile ve SDK'sız. Canlı ayar: `ai_provider = openai`, `ai_model = gpt-5.4-mini`, `ai_enabled = false`.
- **Diğer servisler:** Open-Meteo (hava), AlAdhan (namaz vakitleri, Diyanet yöntemi), RSS haber kaynakları, Cloudflare Turnstile (isteğe bağlı, anahtar tanımlı değil).
- Harici kaynaklar ayrıca `next.config.ts` içindeki CSP'de listeli (report-only).

## 2. Klasör ağacı

### 2.1 `src/app` (rotalar)

Çoğu route klasöründe ayrıca `loading.tsx` (ilk boyamayı taklit eden iskelet) ve bazılarında `error.tsx` / `not-found.tsx` var; aşağıda yalnız sayfalar ve route handler'lar yazılı.

```
src/
|-- proxy.ts                               # Next 16 Proxy: public'te /admin/* -> admin sitesi (307); admin sitesinde yalnız /admin + /giris; oturum çerezini yeniler; admin'de misafir /admin -> /giris/yonetim (rewrite)
`-- app/
    |-- layout.tsx                         # kök layout: Google Sans, ThemeScript + onboarding pre-script (<head>), AppProviders
    |-- manifest.ts                        # PWA manifest (admin sitesinde ayrı "Yönetim" uygulaması)
    |-- robots.ts, sitemap.ts              # admin sitesinde noindex / boş sitemap; public sitemap feature sitemap.ts kaynaklarından
    |-- globals.css                        # Tailwind v4 + tema token'ları + onboarding animasyonları
    |-- not-found.tsx, global-error.tsx    # kök 404 ve kök hata
    |-- offline/page.tsx                   # SW'nin önbelleğe aldığı çevrimdışı sayfa (offline-retry.tsx)
    |-- (auth)/                            # alt menüsüz, dar sütun giriş ekranları (layout.tsx)
    |   `-- giris/
    |       |-- page.tsx                   # B1: telefon -> SMS kodu (giriş = kayıt, adım 1/3)
    |       |-- dogrula/page.tsx           # B2: 6 haneli kod (2/3); yeni kullanıcı -> /giris/profil
    |       |-- profil/page.tsx            # profil tamamlama (ad, avatar; 3/3)
    |       |-- yonetim/page.tsx           # admin sitesi: telefon + şifre girişi (proxy /admin adresinde gösterir)
    |       `-- yetki/page.tsx             # admin sitesi: admin rolü olmayan hesap
    |-- (main)/                            # public kabuk (layout.tsx): içerik + BottomNav + onboarding + install prompt
    |   |-- page.tsx                       # ana sayfa: TopBar (selam, hava, zil), arama, GebzemAI kartı + hızlı kartlar, kategori kutuları, duyuru/etkinlik/haber/gezi şeritleri (bölüm sırası doğrulanmadı)
    |   |-- ara/page.tsx                   # J1 genel arama (global_search, popüler aramalar/yerler, son aramalar)
    |   |-- yakinimda/page.tsx             # D1 tam ekran harita (?tur=eczane|nobetci|cami|durak|taksi|atm|banka|akaryakit|sarj|kurum|gezilecek)
    |   |-- nobetci-eczane/page.tsx        # D2 nöbetçi eczaneler (ISR 5 dk; duty_data_mode 'off' ise yalnız resmî link)
    |   |-- eczane/[id]/page.tsx           # D3 eczane detayı
    |   |-- cami/[id]/page.tsx             # D4 cami detayı + namaz vakitleri
    |   |-- durak/[id]/page.tsx            # D5 otobüs durağı detayı
    |   |-- gezilecek-yerler/page.tsx      # D6 gezilecek yerler (place_categories chip'leri)
    |   |-- gezilecek-yerler/[slug]/       # yer detayı (DetailHero, galeri, siyah "Ara")
    |   |-- rehber/page.tsx                # şehir rehberi hub: arama, kategori kutuları, bölümler, acil numaralar, kaynaklar
    |   |-- rehber/[kategori]/page.tsx     # rehber listesi (GUIDE_SECTIONS slug'ı ya da kurum kategori slug'ı, ör. /rehber/nufus)
    |   |-- rehber/dizin/route.ts          # GET: rehber arama kutusu için JSON indeks (CDN 1 saat)
    |   |-- kurum/[slug]/page.tsx          # kurum / ATM / banka / akaryakıt / şarj detayı (ISR)
    |   |-- acil-durum/page.tsx            # acil ve arıza numaraları (app_settings.emergency_numbers)
    |   |-- ilanlar/page.tsx               # E1 İkinci El listesi (filtreler, sonsuz yükleme)
    |   |-- is-ilanlari/page.tsx           # E1b İş ilanları listesi
    |   |-- ilan/[id]/page.tsx             # E3 2. el ilan detayı (foto/video hero, siyah alt bar)
    |   |-- is-ilani/[id]/page.tsx         # E4 iş ilanı detayı (telefon girişsiz görünür, CV/başvuru yok)
    |   |-- ilan-ver/page.tsx              # E5 ilan türü seçimi
    |   |-- ilan-ver/ikinci-el/page.tsx    # E6 2. el ilan sihirbazı (?duzenle=<id>)
    |   |-- ilan-ver/is-ilani/page.tsx     # E7 iş ilanı sihirbazı (yalnız onaylı işletme sahibi)
    |   |-- ilan-ver/tamam/page.tsx        # E8 ilan gönderildi / yayında
    |   |-- hizmetler/page.tsx             # F1 hizmet ara / seç (her "hizmet al" girişi buraya)
    |   |-- hizmetler/[kategori]/page.tsx  # F2 üst kategori: alt kategoriler, en fazla 5 firma
    |   |-- hizmet-talebi/[altKategori]/   # F3/F4 talep sihirbazı (question_flows + sistem adımları, ?adim=N)
    |   |-- hizmet-talebi/tamam/page.tsx   # F5 onay + push izni kartı
    |   |-- talep/[code]/page.tsx          # müşterinin talep sayfası (kabul eden firmalar, kapat, yorum)
    |   |-- firmalar/page.tsx              # F7 firma dizini (kategori chip'leri, puan/mesafe sıralaması)
    |   |-- firma/[slug]/page.tsx          # işletme sayfası (galeri hero, sekmeler, olanaklar, oda/menü/hizmet/doktor, yorumlar, "Ara"; ISR)
    |   |-- kesfet/[tur]/page.tsx          # dikey listesi (büyük foto kartlar + harita; LISTABLE_VERTICALS dışındaki tur 404; saglik'ta Doktorlar segmenti)
    |   |-- menu/[slug]/page.tsx           # public QR menü (girişsiz, alt menüsüz)
    |   |-- etkinlikler/page.tsx           # etkinlik listesi + harita
    |   |-- etkinlikler/gecmis/page.tsx    # son 90 günde biten etkinlikler
    |   |-- etkinlik/[slug]/page.tsx       # etkinlik detayı (ISR 5 dk)
    |   |-- etkinlik/[slug]/takvim/route.ts # GET .ics dosyası ("Takvime ekle")
    |   |-- etkinlik-olustur/page.tsx      # etkinlik sihirbazı (kullanıcı adına ya da ?isletme=<id>; ?duzenle=<id>)
    |   |-- haberler/page.tsx              # kendi haberlerimiz + RSS başlıkları
    |   |-- haberler/[slug]/page.tsx       # kendi haber yazımızın detayı
    |   |-- duyurular/page.tsx             # su/elektrik kesintisi, belediye, genel duyurular
    |   |-- gebzemai/page.tsx              # GebzemAI sohbet (yalnız giriş yapmış kullanıcı; kapalıyken sakin bilgi ekranı)
    |   |-- yardim/page.tsx                # destek merkezi (konu adımlı form, SSS, "Mesajlarım"; ?konu=)
    |   |-- kaynaklar/page.tsx             # veri kaynakları ve lisanslar
    |   |-- yasal/{kvkk,acik-riza,gizlilik,kosullar,cerez}/page.tsx  # legal_texts'in son yayınlanan sürümü (ISR)
    |   |-- profil/page.tsx                # G1/G2 profil (misafir ve giriş yapmış)
    |   |-- profil/duzenle/                # G3 kişisel bilgiler
    |   |-- profil/ilanlarim/              # G4 2. el ilanlarım (+ [id]/istatistik: ilan istatistikleri)
    |   |-- profil/is-ilanlarim/           # işletme adına iş ilanlarım
    |   |-- profil/taleplerim/             # hizmet taleplerim
    |   |-- profil/etkinliklerim/          # kendi adıma etkinliklerim (yayında / onay bekleyen / reddedilen / geçmiş)
    |   |-- profil/favoriler/              # G6 favoriler (ilan, işletme, yer)
    |   |-- profil/bildirimler/            # G7 bildirimler ("Tümünü okundu yap")
    |   |-- profil/ayarlar/                # ayarlar (anahtarlı satırlar; içerik doğrulanmadı)
    |   |-- profil/telefon-degistir/       # B4 numara değiştir (yeni numaraya SMS)
    |   |-- profil/hesap-sil/              # G9 hesabı sil (taze SMS kodu şart)
    |   `-- isletme/                       # işletme paneli (sahip)
    |       |-- page.tsx                   # panel ana sayfası: istatistikler (sayfa görüntüleme, arama), görevler, geçiş
    |       |-- tanitim/page.tsx           # işletme hesabı tanıtımı
    |       |-- basvuru/page.tsx           # H1 yeni işletme aç (anında yayında) ya da yarım kalanı bitir
    |       |-- basvuru/alindi/page.tsx    # "İşletmen yayında"
    |       |-- sec/route.ts               # GET ?b=<id>&next=: aktif işletmeyi değiştirir (çerez), sahiplik kontrolü
    |       |-- duzenle/page.tsx           # düzenleme hub'ı
    |       |-- duzenle/[adim]/page.tsx    # tek bölüm: temel | iletisim | konum | saatler | ozellikler | hizmet-alani
    |       |-- fotograflar/page.tsx       # kapak + portfolyo
    |       |-- yorumlar/page.tsx          # yorumlar ve işletme yanıtı
    |       |-- hizmetlerim/page.tsx       # hizmet firması: fiyatlı hizmet kataloğu + kategori/bölge
    |       |-- menu/page.tsx              # menü yönetimi (yemek, restoran, kafe, otel)
    |       |-- menu/qr/page.tsx           # yazdırılabilir QR masa kartı
    |       |-- odalar/page.tsx            # otel odaları
    |       |-- doktorlar/page.tsx         # sağlık işletmesi doktorları
    |       |-- etkinlikler/page.tsx       # işletmenin etkinlikleri
    |       |-- talepler/page.tsx          # H4 gelen talepler (Yeni / İlgilendiklerim / Kapanan)
    |       `-- talepler/[id]/page.tsx     # talep detayı (fotoğraflar /api/talep-foto ile)
    |-- admin/                             # yalnız admin sitesinde; layout.tsx = admin guard (rol admin değilse /giris/yetki)
    |   |-- page.tsx                       # genel bakış: canlı kullanıcı, bugün, bekleyen işler, 14 gün grafik, kurulumlar
    |   |-- analitik/                      # canlı ve analitik (oturum, sayfa görüntüleme)
    |   |-- kullanicilar/ (+ [id])         # kullanıcı arama, detay, durum (Aktif/Kısıtlı/Engelli), ek işletme hakkı
    |   |-- isletmeler/                    # işletmeler (askıya al, tür değiştir, doğrulama seviyesi)
    |   |-- ilanlar/                       # ilan moderasyonu (onayla/reddet, video kaldır)
    |   |-- ilan-kategorileri/             # ilan kategori ağacı, yasaklı kategoriler, filtrelenebilir alanlar
    |   |-- hizmet-kategorileri/ (+ [id])  # hizmet kategorileri; [id] = soru akışı editörü (flow-editor, sürüm geçmişi)
    |   |-- talepler/                      # hizmet talepleri: incele, eşleştir, firmalara gönder (concierge)
    |   |-- etkinlikler/                   # kullanıcı etkinliği onay kuyruğu, tüm etkinlikler, şehir etkinliği ekle
    |   |-- sikayetler/                    # şikayetler (reports)
    |   |-- destek/                        # destek gelen kutusu + iç notlar
    |   |-- duyurular/                     # duyurular (mahalle hedefli)
    |   |-- haber-yazilari/                # kendi haber yazılarımız (taslak / yayında)
    |   |-- haberler/                      # RSS kaynakları, izin notu, "Şimdi çek"
    |   |-- rehber/ (+ [id], yeni, konum)  # şehir rehberi kayıtları; konum = "Konumu eksik" kuyruğu (harita pini)
    |   |-- yerler/                        # tüm poi türleri: ad, telefon, adres, konum, gizle, kilitle
    |   |-- nobet/                         # nöbet listesi (gün seç, eczaneleri işaretle; import kayıtları)
    |   |-- sozlukler/                     # keşfet chip'leri, olanaklar, oda özellikleri, etkinlik/haber/yer kategorileri
    |   |-- muhasebe/ (+ csv/route.ts)     # gelir-gider, dönem özeti, fiş yükleme, CSV dışa aktarma
    |   |-- veri/                          # veri sağlığı, demo temizliği, POI eşitleme
    |   |-- denetim/                       # işlem kaydı (audit_log)
    |   |-- ayarlar/ (+ yasal)             # app_settings formu; yasal metin sürümleri
    |   |-- gebzemai/                      # AI kullanım ve ayarları (sağlayıcı, model, limitler)
    |   `-- hesap/                         # admin'in kendi hesabı ve şifresi
    `-- api/                               # yalnız public uygulamada kullanılır
        |-- cron/duty/route.ts             # nöbet listesi import (NOSYAPI_KEY yoksa 'no_source' kaydı)
        |-- cron/news/route.ts             # RSS kaynaklarını çeker, kaydeder, haber cache'ini düşürür
        |-- cron/poi-sync/route.ts         # KBB/OSM POI yeniden eşitleme (aylık + admin "Şimdi eşitle"; ?dry=1)
        |-- cron/purge-listings/route.ts   # 30+ gün önce silinen ilanları ve dosyalarını siler, media_trash'i boşaltır
        |-- notifications/push/route.ts    # Web Push gönderici (claim_push_notifications, VAPID)
        |-- gebzemai/route.ts              # POST: bir AI turu, NDJSON stream (nodejs, maxDuration 60)
        |-- media/upload-url/route.ts      # GET: sağlayıcı (r2|supabase); POST: presigned PUT (reserve_media_upload)
        |-- media/delete/route.ts          # POST: kullanıcının kaydetmeden bıraktığı kendi R2 dosyalarını siler
        |-- talep-foto/route.ts            # GET ?r=&i=: özel talep fotoğrafına kısa ömürlü signed URL
        |-- revalidate/route.ts            # POST: admin sitesinden gelen tag/path invalidation (REVALIDATE_SECRET)
        `-- hava/route.ts                  # GET: güncel hava + 5 gün (Open-Meteo, CDN 30 dk)
```

### 2.2 `src/features` (modüller)

```
src/features/
|-- admin/                                 # admin sitesinin tüm iş mantığı
|   |-- server/guard.ts                    # withAdmin(): IS_ADMIN_SITE + rol kontrolü, admin oturumlu Supabase client, public refresh uyarısı
|   |-- server/guide-data.ts               # rehber okumaları (admin oturumu; gizli satırlar dahil)
|   |-- actions/*.ts                       # Server Actions: analytics, announcements, businesses, categories, data (demo temizliği), duty, events, finance, guide, legal-texts, listing-categories, listings, news-articles, news, places, poi-sync, reports, requests, settings, support, users, vocabularies
|   |-- components/                        # admin-login-form (telefon+şifre), change-password-form, admin-notices, charts, duty-editor, event-moderation, flow-editor/*, guide-form, guide-list, place-dialog, poi-sync-panel, request-list, settings-form, user-actions, vocabulary-editor ...
|   `-- lib/                               # action-result, labels (TR etiketleri), params, zod, guide-admin, poi-kinds, flow-draft, finance-period, analytics-types
|-- ai/                                    # GebzemAI
|   |-- lib/models.ts                      # sağlayıcı + model kataloğu ve fiyatlar (SQL allowlist ile aynı tutulmalı)
|   |-- lib/types.ts                       # limitler (1500 karakter girdi, 10 mesaj / 12.000 karakter geçmiş, 12 kart)
|   |-- server/config.ts                   # app_settings ai_* okur (cache'siz), sağlayıcı anahtarı var mı
|   |-- server/provider.ts                 # runProviderAgent: openai.ts ya da anthropic.ts
|   |-- server/openai.ts, anthropic.ts     # fetch ile stream + manuel tool döngüsü
|   |-- server/agent.ts                    # sağlayıcıdan bağımsız tool runner, hata tipi
|   |-- server/tools.ts                    # 6 tool: nobetci_eczane, isletme_ara, yer_ara, etkinlikler, taksi_duraklari, son_haberler (anon/RLS sorgular)
|   |-- server/prompt.ts, models.ts, rpc.ts # sistem prompt'u (TR), maliyet hesabı (micro-USD), tipten bağımsız RPC çağrısı
|   |-- components/                        # gebzemai-screen (sessionStorage sohbet), ai-cards, ai-intro, ai-privacy
|   `-- admin/                             # ai-settings-form + actions (admin_set_ai_settings)
|-- auth/                                  # login-screen (B1), verify-screen (B2), profile-setup-screen, avatar-circle-picker, auth-step-header
|-- business/                              # işletmeler, dikeyler, panel
|   |-- lib/verticals.ts                   # dikeyler (işletme türü) + chip/olanak/oda özelliği sabitleri (DB sözlüklerinin yedeği)
|   |-- lib/business-quota.ts              # hesap başına işletme sınırı metni + yardım linki
|   |-- lib/active-business.ts             # panelin aktif işletmesi (çerez ACTIVE_BUSINESS_COOKIE)
|   |-- lib/queries.ts, vertical-queries.ts, public-client.ts  # public (anon, çerezsiz, ISR) okumalar, cache tag 'businesses'
|   |-- lib/owner-queries.ts, owner-progress.ts, completeness.ts  # sahip okumaları, profil gücü
|   |-- lib/hours.ts, kinds.ts, qr.ts, service-catalog.ts, vocabularies.ts, category-visuals.ts, form-utils.ts, cache-tags.ts
|   |-- actions.ts                         # refreshMyBusinessPages(): sahibin sayfalarını revalidate eder
|   |-- review-actions.ts                  # submit_business_review / delete_my_business_review
|   |-- components/apply-wizard.tsx + apply/  # yeni işletme sihirbazı (tür adımı, "Sana neler açılır")
|   |-- components/edit/*, editor/*       # bölüm bölüm düzenleyici; location-picker (Google Maps / MapLibre), hours-editor, area-picker, doc-upload
|   |-- components/doctors/*              # doktor kartı/ızgarası, doctors-explorer (/kesfet/saglik#doktorlar), doctors-manager
|   |-- components/                        # business-limit, business-switcher, firm-gallery, firm/*, menu-manager, menu-view, rooms-manager, room-card, services-manager, service-list, photos-manager, vertical-explorer, firms-directory, vacation-toggle, owner-gate ...
|   `-- home-widgets.tsx, sitemap.ts
|-- content/                               # haber, duyuru, kendi yazılarımız
|   |-- news/get-news.ts, parse.ts, news-feed.tsx, news-ui.tsx  # RSS okuma/parse, refreshNewsFeeds (cron)
|   |-- articles/queries.ts, meta.ts, article-ui.tsx, sitemap.ts # news_articles
|   |-- announcements/*                   # duyuru listesi, ana sayfa şeridi
|   `-- cache-tags.ts, seo.ts, rich-text.tsx, sources.ts, sitemap.ts, home-widgets.tsx, server/public-client.ts
|-- events/                                # etkinlikler
|   |-- queries.ts, owner-queries.ts, owner-event.ts, status.ts, format.ts, ics.ts, draft.ts, sitemap.ts
|   |-- actions.ts                         # etkinlik değişince public sayfaları yeniler
|   `-- components/                        # event-wizard, event-cover-picker, events-explorer, events-map, events-rail, events-manager, my-events, event-phone-reveal
|-- guide/                                 # şehir rehberi (poi üzerinde)
|   |-- lib/constants.ts                   # GUIDE_SECTIONS (kamu, guvenlik, adalet, saglik, egitim, ptt, atm, banka, akaryakit, sarj, tarihi, muze, park, tabiat-parki, doga, sahil, kultur, spor, pazar, mezarlik, ulasim) + kurum kategorileri yedeği
|   |-- lib/queries.ts, details.ts, params.ts, types.ts
|   `-- components/                        # guide-hub, guide-list-browser, guide-map-view, guide-card, detail-parts, emergency-list, entries.ts (dizin), list-config.ts, places-browser
|-- home/components/                       # home-hero, home-search, home-news(-tabs), home-places, image-tile, prayer-progress
|-- legal/                                 # legal-page, legal-body ([yer tutucu] vurgusu), queries (anon, yayınlanan sürüm), meta
|-- listings/                              # 2. el + iş ilanları
|   |-- components/classified-wizard.tsx, classified-media-step.tsx, listing-video-field.tsx, job-wizard.tsx
|   |-- components/listings-screen.tsx, filter-sheet.tsx, listing-cards.tsx, gallery.tsx, detail-*.tsx, job-detail-parts.tsx, my-listings.tsx, post-fab.tsx
|   |-- components/stats/*                 # ilan istatistik grafiği, log-share
|   |-- server/queries.ts, public-client.ts, job-employer.ts
|   `-- constants.ts, filters.ts, search.ts, format.ts, seo.ts (JSON-LD), text-guard.ts (listing_flags aynası), types.ts, view-models.ts, wizard-drafts.ts, job-description.ts, sitemap.ts
|-- nearby/                                # Yakınımda, nöbet, cami, durak, yerler
|   |-- config.ts, types.ts                # PoiKind: pharmacy | mosque | bus_stop | place | taxi | atm | institution | fuel | ev_charge | bank
|   |-- server/queries.ts                  # poi, nöbet (duty_data_mode), yerler
|   |-- server/duty-import.ts              # nöbet import adaptörü (NosyAPI)
|   |-- server/poi-sync.ts                 # aylık KBB/OSM eşitleme (poi_sync_apply)
|   |-- server/external.ts                 # AlAdhan namaz vakitleri
|   |-- map/nearby-map.tsx, mini-map.tsx, lazy-map.tsx, markers.ts, attribution.tsx  # MapLibre + OpenFreeMap
|   |-- lib/                               # duty-view, prayer, hours, taxi, weather kodları, use-nearby-data, use-reference-point
|   `-- components/                        # nearby-explorer, nearby-sheet, duty-browser, duty-card, pharmacy-duty, info-report-sheet ("Bilgi hatalı mı?"), place-card, prayer-times ...
|-- onboarding/                            # onboarding-gate, personalize-step (izin hazırlığı), pre-script, illustrations, storage
|-- profile/                               # profile-screen, profile-edit-form, notifications-list, favorites-view, phone-change-flow, account-delete-flow, push-opt-in; actions/delete-account.ts
|-- search/                                # search-screen, search-results, popular-places, search-categories; server.ts (global_search), popular.ts, recent.ts (yalnız cihazda)
|-- services/                              # hizmet talepleri
|   |-- data.ts                            # public katalog (anon, cache 10 dk, tag 'services'), service_provider_counts
|   |-- business.ts                        # çağıranın onaylı hizmet işletmeleri (panel guard'ı)
|   |-- photo-store.ts                     # talep fotoğrafları cihazda küçültülür, IndexedDB'de bekler
|   `-- components/                        # request-start, request-wizard, service-picker, lead-actions, request-actions, push-opt-in-card, wizard-chrome
|-- support/                               # support-center, flow.ts (adımlar), topics.ts (sikayet, teknik_destek, reklam, isletme, oneri, diger), my-messages
`-- weather/                               # weather-sheet (5 günlük tahmin), server.ts (Open-Meteo, 30 dk cache)
```

### 2.3 `src/components`

```
src/components/
|-- layout/
|   |-- bottom-nav.tsx                     # alt menü (en uzun eşleşen prefix aktif sekme olur)
|   |-- nav-config.ts                      # MAIN_TABS: Anasayfa, Keşfet (/yakinimda), Arama, Bildirim, Profil; menünün gizlendiği prefix'ler
|   |-- nav-visibility.tsx                 # <HideBottomNav/> sayacı
|   |-- top-bar.tsx                        # ana sayfa başlığı (avatar + selam, hava, zil)
|   |-- announcement-banner.tsx            # app_settings.maintenance_banner bandı
|   `-- landscape-lock.tsx, no-zoom.tsx    # yalnız dikey; iOS pinch-zoom engeli
|-- shared/
|   |-- detail-hero.tsx                    # detay sayfalarının tam genişlik foto hero'su + bulanık yuvarlak butonlar
|   |-- detail-skeleton.tsx                # detay sayfalarının ilk boyamasını taklit eden loading iskeletleri
|   |-- bottom-dock.tsx                    # alt sabit bant (safe-area, gölgesiz)
|   |-- report-sheet.tsx, report-sheet-ui.tsx # şikayet sheet'i (submit_report) ve ortak parçalar
|   |-- page-header.tsx, profile-page-header.tsx, explore-header.tsx, section-header.tsx
|   |-- form-screen.tsx                    # sahip araçları için tam ekran form katmanı
|   |-- image-uploader.tsx                 # media bucket'a görsel yükleme (ilk görsel kapak)
|   |-- call-button.tsx, reveal-phone-button.tsx, directions-button.tsx, share-button.tsx, favorite-button.tsx, print-button.tsx
|   |-- auth-gate.tsx                      # giriş iste, sonra ?next ile geri dön
|   |-- bottom-sheet.tsx, chip-filter.tsx, empty-state.tsx, error-state.tsx, skeletons.tsx, coming-soon.tsx
|   |-- demo-data-banner.tsx, data-source-note.tsx, badges.tsx ("Nöbetçi"), price-text.tsx, relative-time.tsx
|   `-- location-chip.tsx, neighbourhood-picker.tsx  # mahalle seçimi (ürün kararı mahallenin kaldırılması, bkz. bölüm 7)
|-- wizard/                                # ortak sihirbaz: wizard.tsx, step-shell.tsx, question-renderer.tsx, flow-steps.tsx, draft.ts (localStorage 'gebzem.draft.<key>')
|-- auth/                                  # phone-form (Turnstile opsiyonel), otp-form, demo-otp-banner, sign-out-button
|-- admin/                                 # admin-shell (masaüstü kenar çubuğu), admin-page
|-- providers/app-providers.tsx            # tüm client provider'lar; admin sitesinde SW ve analytics yok
|-- pwa/                                   # service-worker-registrar ("Yeni sürüm hazır - Yenile"), install-prompt (2. ziyaretten itibaren)
|-- seo/json-ld.tsx                        # schema.org JSON-LD
|-- theme/                                 # theme-provider, theme-script, theme-toggle
`-- ui/                                    # shadcn/ui bileşenleri (accordion ... tooltip), elle düzenleme gerekmedikçe dokunma
```

### 2.4 `src/lib`, `src/config`, `src/core`

```
src/lib/
|-- supabase/client.ts                     # tarayıcı client'ı (sekme başına singleton, çerez oturumu)
|-- supabase/server.ts                     # Server Component / Route Handler / Server Action client'ı (istek başına yeni)
|-- supabase/proxy.ts                      # updateSession(): proxy.ts'ten çağrılır, getClaims ile oturum
|-- supabase/admin.ts                      # createAdminClient(): service role, RLS'i atlar; YALNIZ public uygulama sunucu kodu
|-- auth/server.ts                         # getCurrentUser, getProfile, require* yardımcıları, aktif işletme
|-- auth/otp.ts                            # signInWithOtp / verifyOtp (sms, phone_change), isDemoOtpPhone, TR hata mesajları
|-- auth/auth-provider.tsx, hooks.ts       # client oturum context'i
|-- app-settings.ts                        # getAppSettings(): app_settings (anon, cache 60 sn, tag 'app-settings')
|-- revalidate-public.ts                   # PUBLIC_CACHE_TAGS; revalidatePublic(): admin sitesinde /api/revalidate'e POST, public'te lokal expire
|-- server/cron-auth.ts                    # isCronAuthorized(): CRON_SECRET (x-cron-secret / Bearer) timing-safe
|-- media/                                 # medya adaptörü: kinds.ts (tür/limit/anahtar/URL), server.ts (sağlayıcı seçimi, silme), r2.ts, sigv4.ts, supabase.ts, client.ts (XHR upload), video.ts + iso-bmff.ts (video konum metaverisi temizleme, süre, kapak)
|-- maps/google.ts                         # Google Maps JS yükleyici + Places Autocomplete + ters geocode
|-- push/client.ts                         # Web Push abonelik (izin yalnız dokunuşla; iOS'ta yalnız kurulu PWA)
|-- notify.ts                              # sonner toast sarmalayıcısı (push değil, ekrandaki bildirim)
|-- notifications/use-unread-notifications.ts # okunmamış sayacı (admin bildirimleri hariç)
|-- analytics/tracker.tsx                  # birinci taraf, çerezsiz analitik (track_* RPC'leri)
|-- contact.ts                             # log_contact_event (arama tıklaması, numara gösterme) keepalive fetch
|-- db-contract.ts                         # tablo / RPC adları tek yerde
|-- database.types.ts                      # scripts/db/gen-types.mjs ile üretilir, elle düzenleme
|-- images.ts                              # tarayıcıda görsel küçültme, EXIF temizleme
|-- location/*, neighbourhoods.ts, platform.ts, pwa/install-store.ts, navigation-history.ts, storage.ts, use-json.ts, use-is-client.ts, types.ts, utils.ts (cn)
src/config/
|-- app-mode.ts                            # IS_ADMIN_SITE, ADMIN_SITE_URL, publicUrl()
|-- site.ts                                # APP_NAME "Gebzem", CITY (Gebze, Kocaeli, merkez), SITE_URL, BRAND_COLORS, TURNSTILE_SITE_KEY, FEATURES, STORAGE_KEYS
`-- sitemap-extra.ts                       # modüllerin sitemap kaynakları kaydı
src/core/                                  # saf TS (Expo/Flutter'a taşınabilir)
|-- routes.ts                              # TEK URL ağacı (routes.*), safeNextPath (open redirect koruması), PUBLIC_STATIC_ROUTES
|-- format.ts, time.ts                     # tr-TR biçimleme, Europe/Istanbul
|-- phone.ts                               # E.164 +905XXXXXXXXX
|-- tr.ts                                  # I/ı/İ/i normalizasyonu, slug
|-- duty.ts                                # nöbet penceresi 08:30 -> 08:30
|-- flow.ts                                # soru akışı sözleşmesi (hizmet talebi, ilan özellikleri)
`-- geo.ts, name.ts
```

### 2.5 `scripts/`

Hepsi repo kökünden, PowerShell'de `secrets.ps1` dot-source edildikten sonra `node --env-file=.env.local scripts/db/<dosya>` ile çalışır (Node 24 fetch'i kullanır).

```
scripts/
|-- generate-icons.mjs                     # Lucide'dan PWA ikonları (sharp)
`-- db/
    |-- sql.mjs                            # Management API ile SQL: -e "<sql>", <dosya>, --all (tüm migration'lar)
    |-- gen-types.mjs                      # src/lib/database.types.ts üretir (her şema değişikliğinden sonra çalıştır)
    |-- lib.mjs                            # seed ortak yardımcıları
    |-- auth-setup.mjs, auth-config.mjs    # Auth ayarı (telefon OTP, Send-SMS hook, admin test OTP'si) / oku-yamala (sırları gizler)
    |-- verify-auth.mjs, verify-all.mjs    # canlı projede uçtan uca OTP ve RLS/akış doğrulaması (test verisini siler)
    |-- seed-neighbourhoods.mjs            # Gebze mahalleleri + poligonlar (OSM)
    |-- seed-poi.mjs                       # KBB eczane/cami/tarihi + OSM durak/park + kürate yerler (poi_sync_apply)
    |-- seed-taxi.mjs, seed-atm.mjs        # OSM taksi durakları / ATM'ler
    |-- taxi-phones.sql                    # taksi durağı telefonları (doğrulanmadı: içerik okunmadı)
    |-- import-city-guide.mjs              # city-guide.json -> poi (kurum, atm, banka, akaryakıt, şarj, yer); Wikimedia fotoğrafları -> R2
    |-- seed-news-sources.mjs              # RSS kaynaklarını doğrular, çalışanları kaydeder
    |-- seed-demo.mjs, seed-verticals.mjs, seed-more-verticals.mjs, seed-finance.mjs  # demo hesap/işletme/ilan/menü/oda/etkinlik/muhasebe (is_demo = true)
    |-- refresh-demo-dates.mjs             # demo ilan/etkinlik tarihlerini ileri taşır (2026-11-10'dan önce tekrar çalıştır)
    `-- remove-demo.mjs                    # tüm demo veriyi siler (--yes), admin_clear_demo_data ile aynı
```

Geçici test yardımcıları (CDP ekran görüntüsü, deploy bekleme) oturum scratchpad'inde duruyordu. Kalıcı olsun istenirse `scripts/dev/` altına kopyalanabilirler; şu an o klasör yok (bkz. bölüm 6).

### 2.6 `supabase/`

- `README.md`: DB el kitabı.
- `golive/otp_golive.sql`: OTP'yi canlıya alma betiği. Migration değil ve UYGULANMADI. Gerçek SMS sağlayıcısı bağlanmadan çalıştırılırsa bütün girişler bozulur.
- `seed/`: boş.
- `migrations/`: aşağıda. Kurallar:
  - Her dosya yeniden çalıştırılabilir.
  - Fonksiyon değiştiren migration canlı gövdeden başlar (`pg_get_functiondef`).
  - Uygulama: `scripts/db/sql.mjs <dosya>`.
  - Önekler sıralama içindir; gerçek tarih değildir.

**20260910 (temel):**
- `20260910000001_init.sql`: eklentiler (postgis, pg_trgm, unaccent, pgcrypto), `private` şema, çekirdek tablolar, indeksler, trigger'lar (profil oluşturma, kolon koruma, ilan moderasyonu, arama kolonları).
- `20260910000002_rls.sql`: her tabloda RLS, politikalar, `public_profiles` ve `my_leads` view'ları.
- `20260910000003_rpc.sql`: temel RPC'ler, `private.notify` yardımcıları, grant'ler.
- `20260910000004_storage.sql`: `media` (public) ve `private-docs` (private) bucket'ları, politikaları.
- `20260910000005_seed_reference.sql`: app_settings tohumları, ilan/hizmet kategorileri, soru akışları v1.
- `20260910000006_cron.sql`: pg_cron `expire_listings`, `roll_demo_duty`.
- `20260910000007_trigger_enforcement_fix.sql`: koruma trigger'ları SECURITY INVOKER sarmalayıcı + SECURITY DEFINER `*_impl` desenine geçti (API yazımları denetlenir, RPC/cron güvenilir).
- `20260910000008_search_path_hygiene.sql`: yardımcı fonksiyonlarda `search_path` sabitlendi.

**2026091130-2026091290 (modüller):**
- `2026091130_services_push_and_leads.sql`: web push webhook'u (pg_net + Vault secret `gebzem_push_webhook_secret`), `my_lead_extras`.
- `2026091140_profile_business_stats.sql`: `business_panel_stats` (sahibe toplam sayılar).
- `2026091160_admin_tools.sql`: `media/admin/`, `admin_publish_flow`, `admin_request_candidates`, `admin_data_health`, `admin_clear_demo_data`, admin kendi rolünü düşüremez.
- `2026091210_verticals.sql`: işletme dikeyi, dijital menü (QR), otel odaları, etkinlikler.
- `2026091220_support.sql`: destek merkezi (contact_messages: konu, durum), sınırlı `submit_contact_message`.
- `2026091230_admin_core.sql`: analitik tabloları, mağaza istatistikleri, audit_log + trigger'lar, muhasebe, admin RPC'leri.
- `2026091240_support_notes.sql`: yalnız admin'e açık `support_notes`.
- `2026091250_business_open.sql`: inceleme kalktı (işletme anında yayında), sahip başına çok işletme, fiyatlı hizmet kataloğu.
- `2026091251_business_open_fixes.sql`: işletme yalnız `apply_business` ile açılır, eşleştirmede sahip başına tek işletme.
- `2026091260_poi_taxi.sql`: poi türü `taxi`.
- `2026091262_poi_atm.sql`: poi türü `atm`.
- `2026091270_verticals_more.sql`: `saglik`, `dugun`, `egitim` dikeyleri.
- `2026091280_user_reviews.sql`: her kullanıcı işletmeye yorum yazabilir (`submit_business_review`).
- `2026091290_news_articles.sql`: kendi haber yazılarımız (`news_articles`).

**2026091300-2026091315 (denetim adımları):**
- `2026091300_place_corrections_guest_throttle.sql`: `bilgi_duzeltme` konusu, misafir için IP hash sınırı.
- `2026091301_reports_hardening.sql`: şikayet yalnız `submit_report` ile, `report_notes`.
- `2026091302_marketing_consent_at.sql`: ticari ileti izni tarihi.
- `2026091303_account_delete_privacy.sql`: KVKK hesap silme, audit maskeleme, audit saklama süresi.
- `2026091304_security_pack.sql`: admin RPC'leri anon'a kapalı, başvuru anahtarı, ilan limitleri, sade `public_profiles`.
- `2026091305_analytics_throttle.sql`: günlük tuzlu IP hash ile analitik sınırları, güvenilir istemci IP'si.
- `2026091310_atomic_replace.sql`: `set_business_photos`, `set_business_service_scope`, `set_listing_media` (tek transaction).
- `2026091311_ban_enforcement.sql`: `private.is_banned`, engelli kullanıcının içeriği gizlenir, yazma reddedilir.
- `2026091312_sms_hook_tr_only.sql`: SMS hook yalnız +905 numaralar.
- `2026091313_request_photos_private.sql`: talep fotoğrafları `private-docs`'a, `/api/talep-foto` ile.
- `2026091314_listing_purge.sql`: `deleted_at`, 30 gün sonra kalıcı silme cron'u.
- `2026091315_legal_texts.sql`: sürümlü yasal metinler, `profiles.kvkk_version`.

**2026091320-2026091345:**
- `2026091320_duty_mode_gate.sql`: `duty_data_mode` demo | off | live.
- `2026091330_demo_cleanup_v2.sql`: demo temizliği kapsamları (events, finance, news_articles, demo_admin).
- `2026091331_admin_audit.sql`: admin değişiklikleri audit'e, `admin_audit_log()`.
- `2026091332_max_providers_fallback.sql`: kategori limiti yoksa `max_providers_default`.
- `2026091333_service_category_admin.sql`: `admin_save_service_category`, `admin_delete_service_category`.
- `2026091334_finance_receipts.sql`: muhasebe fişi `private-docs/finance/`, kullanılan kategori silinemez.
- `2026091335_poi_admin.sql`: `poi.hidden`, `poi.locked` (admin düzenlemesi seed/sync'ten korunur).
- `2026091340_request_redispatch.sql`: yeniden dağıtım dalgaları, `stalled_at`, 14 gün sonra süre dolumu, gece sessizliği.
- `2026091341_push_retry.sql`: push deneme kolonları, `claim_push_notifications`, retry cron'u.
- `2026091342_global_search_events_news.sql`: genel arama etkinlik ve haber yazılarını da bulur.
- `2026091343_news_cron.sql`: kaynak hata takibi, `news_record_fetch`, 20 dk'lık haber cron'u.
- `2026091344_duty_import.sql`: `pharmacy_duty` tekilliği, `duty_import_runs`, `admin_set_duty`, `duty_import_record`, import cron'ları.
- `2026091345_listing_attribute_filters.sql`: filtrelenebilir kategori alanları, `search_listings(p_attrs)`.

**2026091350-2026091369:**
- `2026091350_panel_page_views.sql`: panel istatistiğine `/firma` ve `/menu` sayfa görüntülemeleri.
- `2026091351_vocabularies.sql`: `vertical_subcategories`, `amenities`, `event_categories` (admin yönetir).
- `2026091352_poi_last_seen.sql`: `last_seen_at`, `missing_since`, `data_sync_runs`, `poi_sync_apply`.
- `2026091360_admin_without_service_key.sql`: service role'süz admin RPC'leri (`admin_news_sources`, `admin_refresh_news_now`, `admin_set_user_status`, demo foto silme).
- `2026091361_db_hygiene.sql`: private yardımcılarda EXECUTE grant temizliği, küçük düzeltmeler.
- `2026091362_legal_hosting_fix.sql`: yasal metinler Tokyo barındırmasını söylesin diye yeni sürüm.
- `2026091363_vocab_news_places.sql`: `news_categories`, `place_categories`.
- `2026091364_admin_polish.sql`: ayar audit etiketleri.
- `2026091365_service_dispatch_fix.sql`: otomatik dağıtım varsayılan, bölge dışlamaz öncelik verir, concierge güvenlik ağı (`request_review_minutes`), demo izolasyonu, push "parking".
- `2026091366_vacation_mode.sql`: `vacation_until` + `gebzem-end-vacations` cron'u.
- `2026091367_mark_all_notifications_read.sql`: "Tümünü okundu yap".
- `2026091368_otp_lockdown.sql`: demo OTP yalnız +90555000xxxx; diğer numaralara hook hatası.
- `2026091369_security_hardening.sql`:
  - push abonelik sınırı
  - yorum bildirimi sınırı
  - yayında olmayan işletmenin ilanlarını gizleme
  - günde 100 upload
  - contact_event sınırı
  - hesap silmede taze SMS şartı

**2026091370-2026091378 (ürün kuralları ve yeni özellikler):**
- `2026091370_business_rules.sql`: "personel arıyorum" kalktı, hesap başına bir işletme (`business_max_per_owner` + `extra_business_slots`), tür kilidi, `admin_set_business_vertical`.
- `2026091371_listing_stats.sql`: `listing_daily_stats`, `listing_owner_stats`, `log_listing_share`.
- `2026091372_user_events.sql`: kullanıcı etkinlikleri inceleme ile yayına girer, `admin_review_event`, limitler, `reveal_event_phone`.
- `2026091373_search.sql`: `search_terms_daily`, `log_search`, `popular_searches`, `popular_places`.
- `2026091374_listing_video.sql`: `media_public_base`, `reserve_media_upload`, `listing_videos`, `media_trash`, `set_listing_video`.
- `2026091375_gebzemai.sql`: AI kullanım tabloları (private), `ai_begin_turn`, `ai_finish_turn`, `ai_status`, `admin_ai_usage`, `admin_set_ai_settings`, cleanup cron'u.
- `2026091376_city_guide.sql`: poi türleri institution, fuel, ev_charge, bank; konum isteğe bağlı; `institution_categories`; `emergency_numbers`.
- `2026091377_business_staff.sql`: sağlık işletmesi doktorları (`business_staff` + `doctor_branches`).
- `2026091378_gebzemai_openai.sql`: `ai_provider` ayarı ve OpenAI modelleri allowlist'e.

### 2.7 `public/`, `docs/`, kök dosyalar

```
public/
|-- sw.js                                  # elle yazılmış service worker (VERSION "v4-2026-09-11"; dosya değişince VERSION'ı artır)
|   #  navigasyon: network-first (3 sn) -> önbellekteki public sayfa -> /offline
|   #  /_next/static, /icons, fontlar: cache-first; görseller: stale-while-revalidate (150 LRU); /data/*: SWR
|   #  ASLA önbelleğe alınmaz: /api, /auth, /giris, /admin, /profil, /isletme, /talep, /ilan-ver, /hizmet-talebi, /yardim, Authorization başlıklı istekler, cross-origin, RSC, GET dışı
|   #  "X-SW-Cache: no" başlığı sayfayı dışarıda tutar; çıkışta CLEAR_PAGES; güncelleme SKIP_WAITING ile kullanıcı onayıyla
|   #  push / notificationclick olayları (yalnız aynı origin linkleri açar)
|-- icons/                                 # PWA ikonları, maskable, badge-72, kısayol ikonları, og-image
`-- images/home/                           # ana sayfa kategori görselleri
docs/
|-- MIMARI-AGAC.md                         # bu belge
|-- mimari-plan.md                         # ilk plan (eski)
`-- contracts/{db-contract.md, app-contract.md}
kocaeli/                                   # sahibin verdiği KBB açık veri + GTFS (stop_times yok); git'e girmez
next.config.ts                             # güvenlik başlıkları, CSP (zorunlu kısım + report-only), images.remotePatterns (Supabase + r2.dev), admin'de X-Robots-Tag noindex
vercel.json                                # regions ["hnd1"], crons []
components.json, eslint.config.mjs, postcss.config.mjs, tsconfig.json
```

## 3. Veritabanı

### 3.1 Tablolar (canlı `public` şemasından okundu, 58 tablo)

**Kullanıcı ve çekirdek:**
- `profiles`: kullanıcı profili. İçerik: role (admin/user), status (active/restricted/banned), telefon, onaylar, `kvkk_version`, `extra_business_slots`, `is_demo`.
- `app_settings`: key/value (jsonb) ayarlar. Public okunur, admin yazar.
- `neighbourhoods`: Gebze mahalleleri, poligon ve merkez (OSM).
- `demo_otp`: Send-SMS hook'unun sakladığı demo kodları. Politika yok, API'den erişilemez.
- `push_subscriptions`: Web Push abonelikleri (kullanıcı başına en fazla 10).
- `notifications`: uygulama içi bildirimler ve push durumu (`push_sent_at`, `push_attempts`, `push_error`).
- `favorites`: ilan / işletme / yer favorileri.
- `legal_texts`: sürümlü yasal metinler. Yayınlanan sürüm değişmez.

**İşletme:**
- `businesses`: işletme. İçerik: vertical, kinds, status, verification_level, vacation_mode/until, slug, konum.
- `business_photos`, `business_documents`: galeri / özel belgeler (`private-docs`).
- `business_service_categories`, `business_service_areas`: hizmet firmasının kategorileri ve bölgeleri (eşleştirme).
- `business_services`: fiyatlı hizmet kataloğu.
- `business_menu_sections`, `business_menu_items`: dijital menü / QR menü.
- `business_rooms`: otel odaları.
- `business_staff`: doktorlar (şimdilik yalnız sağlık). `consent_confirmed_at` zorunlu.
- `doctor_branches`: branş sözlüğü.
- `reviews`: yorumlar (talep yorumu ya da serbest işletme yorumu, kullanıcı başına bir tane).
- `vertical_subcategories`, `amenities`: keşfet chip'leri ve olanak/oda özelliği sözlükleri.

**Hizmet talepleri:**
- `service_categories`: iki seviyeli katalog (`auto_dispatch`, `max_providers`).
- `question_flows`: sürümlü soru akışları.
- `service_requests`: müşteri talepleri (`public_code`, cevaplar, özel foto yolları, `stalled_at`).
- `leads`: talep x firma eşleşmeleri (kabul / red / kaldırıldı).

**İlanlar:**
- `listing_categories`: ilan kategorileri, `attributes_schema` ve yasaklılar dahil.
- `listings`: 2. el ve iş ilanları (status, flags, view_count, deleted_at).
- `listing_media`: ilan fotoğrafları.
- `listing_videos`: ilan başına en fazla bir video.
- `listing_daily_stats`: ilanın günlük istatistikleri. Yalnız sahip ve admin okur.
- `media_trash`: silinecek R2 dosyaları kuyruğu.

**Etkinlik:**
- `events`: etkinlikler. `contact_phone` kolonu API'den okunamaz.
- `event_categories`: sözlük.

**Şehir, POI ve nöbet:**
- `poi`: tüm yerler. 10 kind vardır. Ek alanlar: `details` jsonb, `hidden`, `locked`, `last_seen_at`, `missing_since`, `verified_at`.
- `pharmacy_duty`: nöbet satırları (eczane x gün, source demo/manual/nosyapi).
- `duty_import_runs`: nöbet import ve elle kayıt günlüğü.
- `data_sync_runs`: POI eşitleme çalışmaları.
- `place_categories`, `institution_categories`: yer / kurum kategori sözlükleri.

**İçerik:**
- `news_sources`: RSS kaynakları (`fail_count`, `permission_note` yalnız admin görür).
- `news_items`: RSS başlıkları.
- `news_articles`: kendi haberlerimiz.
- `news_categories`: sözlük.
- `announcements`: duyurular.

**Destek ve şikayet:**
- `contact_messages`: destek mesajları ve bilgi düzeltmeleri.
- `support_notes`: admin iç notu.
- `reports`: şikayetler.
- `report_notes`: admin notu.
- `contact_events`: arama tıklaması, numara gösterme, yol tarifi.

**Analitik ve admin:**
- `analytics_sessions`, `analytics_page_views`: oturum ve sayfa görüntüleme.
- `app_installs`: PWA kurulumları.
- `store_stats`: mağaza sayıları (elle).
- `audit_log`: işlem kaydı.
- `finance_categories`, `finance_entries`: muhasebe.
- `search_terms_daily`: yalnız toplu arama terimi sayıları.

**Diğer şema nesneleri:**
- `private` şemasında (API'den erişilemez): `ai_usage`, `ai_usage_daily`, `ai_turns`, `media_uploads`, `search_term_marks` (migration başlıklarından; canlıda listelenmedi).
- View'lar: `public_profiles` (yalnız güvenli kolonlar), `my_leads` (çağıranın kendi lead'leri).

**PostgREST tuzağı:** iki ya da daha fazla FK'si olan tablolarda (events, service_requests) embed belirsizleşir (PGRST201). FK ipucu kullan, ör. `neighbourhoods!businesses_neighbourhood_id_fkey(name)`. `events.venue_business_id` ve `reviewed_by` bu yüzden bilerek FK'siz.

### 3.2 Önemli RPC'ler (canlıda `public` + `prosecdef`, SECURITY DEFINER)

- **Auth ve profil:**
  - `send_sms_hook`: Auth hook. Yalnız +905; demo aralığında kodu `demo_otp`'ye yazar.
  - `get_demo_otp`: `otp_demo_mode` açıksa ve numara demo aralığındaysa kod.
  - `delete_my_account`, `is_admin`, `mark_notifications_read`, `mark_all_notifications_read`.
  - `rls_auto_enable` (amacı doğrulanmadı).
- **İşletme:**
  - `apply_business`, `my_business_quota`, `business_is_public`, `owns_business`, `business_panel_stats`.
  - `set_business_photos`, `set_business_service_scope`.
  - `submit_business_review`, `delete_my_business_review`, `reply_review`, `submit_review`.
- **Hizmet talepleri:**
  - `submit_service_request`, `dispatch_request`, `accept_lead`, `decline_lead`, `close_request`, `customer_remove_lead`.
  - `get_request_for_customer`, `get_lead_detail`, `my_lead_extras`, `get_request_photo_paths`, `service_provider_counts`.
- **İlanlar ve medya:**
  - `increment_listing_view`, `reveal_listing_phone`, `renew_listing`, `expire_listings`, `owns_listing`.
  - `set_listing_media`, `set_listing_video`, `reserve_media_upload`, `listing_owner_stats`, `log_listing_share`.
- **Etkinlik:** `reveal_event_phone`.
- **Şehir verisi:** `roll_demo_duty`, `duty_import_record` (service role), `poi_sync_apply` (service role), `neighbourhood_for_point`, `news_record_fetch` (service role).
- **Arama, analitik, iletişim:**
  - `log_search`, `popular_searches`, `popular_places`.
  - `track_heartbeat`, `track_page_view`, `track_install`.
  - `log_contact_event`, `submit_contact_message`, `submit_report`.
- **Push:** `claim_push_notifications` (service role, FOR UPDATE SKIP LOCKED + 5 dk lease).
- **GebzemAI:** `ai_begin_turn` (authenticated; limit ve bütçe kontrolü, tur rezervasyonu), `ai_finish_turn` (service role), `ai_status`.
- **Admin (hepsi `is_admin()` kontrol eder, anon'a kapalı):**
  - Panel ve analitik: `admin_dashboard`, `admin_online_now`, `admin_analytics`, `admin_user_overview`, `admin_set_user_status`, `admin_grant_business_slot`.
  - İnceleme: `admin_review_business`, `admin_set_business_vertical`, `admin_review_listing`, `admin_remove_listing_video`, `admin_review_event`, `admin_event_contacts`.
  - Hizmet talepleri: `admin_request_candidates`, `admin_save_service_category`, `admin_delete_service_category`, `admin_publish_flow`.
  - Veri: `admin_set_duty`, `admin_poi_sync_now`, `admin_news_sources`, `admin_refresh_news_now`, `admin_data_health`, `admin_clear_demo_data`.
  - Kayıt, muhasebe, AI: `admin_audit_log`, `admin_finance_summary`, `admin_ai_usage`, `admin_set_ai_settings`.
- **SECURITY DEFINER olmayanlar (RLS uygulanır):** `global_search` (migration başlığında SECURITY INVOKER yazıyor), `search_listings`, `nearby_pois` (definer listesinde yoklar).
- **`private` şemasındaki iç fonksiyonlar (API'den çağrılamaz):**
  - Bildirim ve dağıtım: `notify`, `notify_admins`, `dispatch_request`, `match_candidates`, `redispatch_requests`, `is_quiet_hours`.
  - Denetim ve ilan: `audit`, `assert_admin`, `is_banned`, `initial_listing_status`, `listing_flags`, `bump_listing_stat`.
  - Medya ve ayar: `own_media_url`, `media_public_base`, `app_setting_int`, `request_ip_hash`, `storage_upload_quota_ok`.
  - AI: `ai_*` yardımcıları.
  - pg_net webhook'ları: `*_webhook`.

### 3.3 Guard trigger'ları

Desen (20260910000007): tabloya bağlı SECURITY INVOKER trigger, gerçek `current_user`'ı SECURITY DEFINER `private.*_impl`'e iletir. PostgREST yazımları (`authenticated` / `anon`) denetlenir; RPC, cron ve seed (`postgres` / `service_role`) güvenilir sayılır.

- `profiles.profiles_protect` (+ `profiles_protect_impl`): kullanıcı kendi role, status, `extra_business_slots` gibi kolonlarını değiştiremez.
- Diğer `profiles` trigger'ları:
  - `profiles_no_self_demote`
  - `profiles_ban_changed` (puanları yeniden hesaplar)
  - `profiles_consent_at`
  - `profiles_kvkk_version`
- `businesses.businesses_before_write` (`businesses_write_impl`): korunan kolonlar, tür/kinds kilidi (hint `vertical_locked`). `businesses_vacation` tatil tutarlılığını sağlar.
- `listings.listings_before_insert` / `listings_before_update` (`listings_insert_impl` / `listings_update_impl`):
  - ilk ilan moderasyonu
  - yasaklı içerik flag'leri
  - günlük/açık ilan limitleri
  - iş ilanı için onaylı işletme şartı
- Diğer `listings` trigger'ları: `listings_deleted_at`, `listings_after_delete`.
- `events.events_before_write`:
  - kullanıcı/işletme limitleri
  - kapak yalnız kendi medya klasöründen
  - https bilet linki
  - işletme telefonu her zaman işletmenin kendi telefonu
- `events.events_review_queue`: kullanıcı düzenlemesi incelemeye geri döner.
- `poi.poi_before_write`: kilitli satırda admin alanlarını korur, `missing_since` / `updated_at` kuralları. `poi_place_category` ve `poi_institution_category` kategori anahtarını doğrular.
- Diğer korumalar:
  - `contact_messages.contact_messages_before_write`
  - `service_requests.service_requests_photos_check` (yalnız geçerli özel yol)
  - `business_staff.business_staff_before_write`
- Sözlük korumaları:
  - `vocabulary_guard`: 6 sözlük tablosunda anahtar değişmez, kullanılan satır silinemez.
  - `doctor_branch_guard`
  - `legal_texts_guard`: yayınlanan sürüm dondurulur.
- Push:
  - `push_subscriptions.push_subscriptions_cap`: 10 abonelik, gerçek push servisi endpoint'i.
  - `push_subscriptions.push_subscriptions_flush`: park edilmiş push'ları tetikler.
  - `notifications.notifications_push_webhook`: pg_net ile `/api/notifications/push`.
- İstatistik ve medya: `contact_events_listing_stats`, `favorites_listing_stats`, `listing_videos_trash` (`media_trash`'e).
- Audit: `audit_*` trigger'ları (profiles, businesses, listings, events, reviews, reports, support, finance, app_settings, içerik tabloları) `audit_log`'a yazar.

### 3.4 Cron işleri (canlı `cron.job` listesi, zamanlar UTC; TR = UTC+3)

- `gebzem-expire-listings`, `5 0 * * *`: `expire_listings()` (süresi dolan ilanlar).
- `gebzem-ai-cleanup`, `20 0 * * *`: `private.ai_cleanup()` (bayat rezervasyon, 3 günlük turlar, eski kullanım).
- `gebzem-poi-sync`, `23 1 2 * *`: ayın 2'si, `/api/cron/poi-sync`.
- `gebzem-analytics-retention`, `17 3 * * *`: `analytics_retention_days`'e göre temizlik.
- `gebzem-audit-retention`, `23 3 * * *`: `audit_retention_days`'e göre temizlik.
- `gebzem-listing-stat-marks`, `29 3 * * *`: ilan istatistiği tekilleştirme işaretlerini temizler (`private.cleanup_listing_stat_marks`).
- `gebzem-purge-listings`, `41 3 * * *`: `/api/cron/purge-listings`.
- `gebzem-roll-demo-duty`, `31 5 * * *`: `roll_demo_duty()` (yalnız `duty_data_mode = 'demo'`).
- `gebzem-duty-import`, `35 5 * * *`: `/api/cron/duty`.
- `gebzem-duty-import-recheck`, `10 6,9,15 * * *`: `/api/cron/duty`.
- `gebzem-duty-stale-check`, `15 6 * * *`: `live` modda nöbette gerçek satır yoksa admin bildirimi.
- `gebzem-end-vacations`, `1 21 * * *`: dönüş tarihi gelen tatilleri kapatır (00:01 TR).
- `gebzem-push-retry`, `*/10 * * * *`: talep edilebilir bildirim varsa `/api/notifications/push`.
- `gebzem-refresh-news`, `*/20 * * * *`: `/api/cron/news`.
- `gebzem-request-redispatch`, `13,43 * * * *`: `private.redispatch_requests` (saf SQL).

pg_net ile çağrılan işler `https://gbzsehir.vercel.app`'e `x-cron-secret` (push için `x-push-secret`) başlığıyla gider. Değer Vault'taki `gebzem_push_webhook_secret`'tır ve Vercel'deki `CRON_SECRET` ile aynı olmalıdır. Secret yoksa bu işler bir şey yapmaz.

### 3.5 Storage

- `media`: public, 5 MB, jpeg/png/webp/gif.
  - Kullanıcı yalnız `<uid>/...` altına yazar.
  - Admin `admin/...` altına yazar (yer fotoğrafları).
  - Demo görseller `demo/...` altındadır.
  - Anon listeleme yapamaz, public URL'ler çalışır.
- `private-docs`: private, 10 MB, görsel + pdf.
  - `<uid>/...`: işletme belgeleri.
  - `<uid>/requests/`: talep fotoğrafları. `/api/talep-foto` service role ile imzalar.
  - `finance/<entry id>/`: muhasebe fişleri, yalnız admin.
- Cloudflare R2 bucket'ı (`R2_BUCKET`, hafızaya göre `gbzsehir-media`, doğrulanmadı):
  - Anahtar deseni `<uid>/listings/<yyyy>/<uuid>.<ext>` (ilan fotoğrafı, video, kapak).
  - Tarayıcı presigned PUT ile yükler.
  - Sunum `NEXT_PUBLIC_MEDIA_BASE_URL` (r2.dev) üzerinden.
  - R2'de storage RLS yok. Kota `reserve_media_upload`'da: günde 100 dosya, 10 video, 1 GiB.
- Kullanıcı başına bucket başına günde 100 upload sınırı: `storage_upload_quota_ok` (2026091369).

### 3.6 Önemli `app_settings` anahtarları (canlı listeden)

- `otp_demo_mode` (canlı `true`): demo OTP banner'ı ve `get_demo_otp`. Tek anahtar budur; env değişkeni yok.
- `duty_data_mode` (canlı `"demo"`):
  - `demo`: örnek liste, "Örnek veri" etiketiyle.
  - `off`: liste yok, Eczacı Odası linki.
  - `live`: elle girilen ve import edilen satırlar.
- `business_max_per_owner` (canlı `1`): hesap başına işletme. Admin kullanıcıya `extra_business_slots` verebilir.
- `feature_business_applications` (canlı `true`): yeni işletme başvuruları açık/kapalı.
- `request_review_minutes` (canlı `5`, migration varsayılanı 30, aralık 5-1440): concierge'de bekleyen talep bu süreden sonra otomatik dağıtılır.
- `request_redispatch_hours` (`6`): kabul edilmeyen talebe sonraki dalga.
- `max_providers_default` (`5`): kategori limiti yoksa bir talebi kabul edebilecek firma sayısı.
- `listing_days` (`30`): ilan süresi.
- `first_listings_moderated` (`3`): kullanıcının ilk N ilanı incelemeye düşer.
- `listing_daily_cap` (`10`), `listing_active_cap` (`50`): ilan limitleri.
- `media_public_base`: R2 public adresi. `NEXT_PUBLIC_MEDIA_BASE_URL` ile aynı olmazsa yeni yüklemeler Supabase'e gider ve video kapanır.
- `ai_enabled` (`false`), `ai_provider` (`"openai"`), `ai_model` (`"gpt-5.4-mini"`), `ai_daily_messages` (`20`), `ai_per_minute` (`5`), `ai_daily_budget_usd` (`5`).
- `analytics_retention_days` (`180`), `audit_retention_days` (`730`).
- `emergency_numbers`: acil numaralar listesi (/acil-durum, /rehber).
- `maintenance_banner`: boşsa bant gizli.
- `popular_searches`: admin'in seçtiği popüler aramalar.
- `support_phone`, `support_email`: şu an yer tutucu (`+908500000000`, `destek@gebzem.app`) ve uygulama bunları "ayarlanmamış" sayar. Canlıya çıkmadan gerçek değer girilmeli.

## 4. Önemli akışlar

**Giriş (public):**
1. `/giris`: `PhoneForm` -> `signInWithOtp`. Turnstile yalnız `NEXT_PUBLIC_TURNSTILE_SITE_KEY` varsa devreye girer.
2. Supabase Auth, Postgres Send-SMS hook'unu çağırır (`pg-functions://postgres/public/send_sms_hook`).
3. Hook yalnız +90555000xxxx demo aralığının kodunu `demo_otp`'ye yazar. Diğer TR mobillere "SMS provider not configured" hatası döner; uygulama "Bu numaraya şu an SMS gönderemiyoruz" gösterir.
4. `otp_demo_mode` açıkken demo banner `get_demo_otp` ile kodu gösterir.
5. `/giris/dogrula`: `verifyOtp`. Yeni kullanıcı `/giris/profil`'e, dönen kullanıcı `?next`'e gider (`safeNextPath`).
6. Sahibin kendi numarasında GoTrue test OTP'si var (hafızaya göre 2027-06-30'a kadar; doğrulanmadı).

**Giriş (admin):**
- Admin sitesinde misafir `/admin`'i açınca proxy `/giris/yonetim`'i gösterir: telefon + şifre, `signInWithPassword`.
- Admin olmayan hesap `/giris/yetki`'ye gider.
- Şifre `/admin/hesap`'ta değiştirilir (`updateUser`).
- OTP ile giriş yedek olarak kalır.

**OTP'yi canlıya alma:**
- Gerçek SMS sağlayıcısı + HTTP hook kurulur, `otp_demo_mode = false` yapılır, `supabase/golive/otp_golive.sql` çalıştırılır.
- Adımlar `supabase/README.md`'de. Henüz yapılmadı.

**İşletme açma:**
1. `/isletme/tanitim` -> `/isletme/basvuru` (`apply-wizard`: tür adımı, bilgiler, konum `LocationPicker`, saatler...).
2. `rpc apply_business`: işletme hemen yayına girer (inceleme yok; admin askıya alabilir).
3. `/isletme/sec` aktif işletme çerezini ayarlar, ardından `/isletme/basvuru/alindi`.
4. Başvuru kapalıysa (`feature_business_applications = false`) `applications-paused` gösterilir.

**İşletme kuralları:**
- Hesap başına bir işletme: `business_max_per_owner` + `extra_business_slots`, `my_business_quota`.
- Sınırdaki kullanıcıya `BusinessLimit` sheet'i çıkar ve `/yardim`'e (konu işletme ekletme) yönlendirir.
- Birden fazla işletmesi olan eski hesaplar onları korur; panelde `business-switcher` vardır.
- Tür (vertical) oluşturulduktan sonra kilitlidir. Yalnız `admin_set_business_vertical` değiştirir (audit + sahibe bildirim).
- Dikeyler: yemek, restoran, kafe, otel, hizmet, magaza, saglik, dugun, egitim, etkinlik, diger.
- Türe göre açılan araçlar:
  - menü + QR: yemek, restoran, kafe, otel
  - oda: otel
  - hizmet kataloğu + talepler: hizmet
  - doktor: saglik
- Her onaylı işletme iş ilanı verebilir ("employer" kind kalktı).

**Hizmet talepleri:**
1. `/hizmetler` -> `/hizmetler/[kategori]` -> `/hizmet-talebi/[altKategori]`. Sihirbaz `question_flows` sürümü ve sistem adımlarından oluşur.
2. Fotoğraflar cihazda küçültülür, IndexedDB'de bekler, `private-docs/<uid>/requests/`'e yüklenir.
3. `submit_service_request` -> `/hizmet-talebi/tamam` (push izni kartı).
4. Otomatik dağıtım: `auto_dispatch` varsayılan `true` -> `private.dispatch_request` / `match_candidates`.
   - Kategoriye hizmet veren firmalar seçilir.
   - Talebin bölgesine hizmet verenler önce gelir; havuz dolmazsa diğer firmalar arkadan eklenir (`area_fallback`).
   - Sahip başına tek işletme.
   - Engelli sahip hariç.
   - Demo firma gerçek talebe gitmez.
5. Lead oluşur, firmaya `notify` ve push gider.
6. Firma `/isletme/talepler`'de `accept_lead` / `decline_lead` yapar. Kabul limiti kategori `max_providers` ya da `max_providers_default`.
7. Müşteri `/talep/[code]`'da kabul eden firmaları görür: `customer_remove_lead`, `close_request`, `submit_review`.
8. Yeniden dağıtım (cron :13 ve :43):
   - `request_redispatch_hours` sonra yeni dalga.
   - Yeni firma yoksa `stalled_at` ve admin bildirimi.
   - 14 gün sonra süre dolar.
   - 22:00-08:00 İstanbul arası dalga gönderilmez.
9. Concierge kategoride talep `/admin/talepler`'e düşer (`admin_request_candidates` + `dispatch_request`). `request_review_minutes` sonra otomatik gönderilir.

**Push parking:** abonelik yoksa bildirim `push_error = 'no_subscription'` ile bekler. Kullanıcı push'u açınca `push_subscriptions_flush` onu bir kez gönderir (24 saat, okunmamışsa).

**İlanlar:**
1. `/ilan-ver` -> `ikinci-el` (`classified-wizard`) ya da `is-ilani` (`job-wizard`, yalnız onaylı işletme sahibi).
2. Başlangıç durumu `private.initial_listing_status`:
   - İlk `first_listings_moderated` ilan `pending_review`.
   - Güvenilir yayıncı ya da yeterli yayınlanmış ilanı olan doğrudan yayına girer.
   - Yasaklı kelime flag'i incelemeye düşürür.
3. Limitler: `listing_daily_cap`, `listing_active_cap`.
4. Fotoğraf: `/api/media/upload-url` presigned PUT (R2 yapılandırılmış ve `media_public_base` eşleşiyorsa R2, değilse Supabase) -> `set_listing_media`.
5. Video (yalnız 2. el, ilan başına 1, yalnız R2):
   - mp4/mov/webm, 100 MB, 60 sn.
   - Tarayıcıda konum metaverisi silinir (`iso-bmff.ts`, yeniden kodlama yok).
   - JPEG kapak üretilir.
   - `reserve_media_upload` kotası, sonra `set_listing_video`.
   - Değişen videolar `media_trash`'e gider.
6. Süre: `listing_days`, gece `expire_listings`, `renew_listing` ile yenilenir.
7. Silme: `deleted_at` işaretlenir, 30 gün sonra `/api/cron/purge-listings` dosyalarla birlikte kalıcı siler.
8. İstatistik: `listing_daily_stats` (views, unique_views, calls, phone_reveals, favorites_added, shares) -> `/profil/ilanlarim/[id]/istatistik` (`listing_owner_stats`).
9. Admin moderasyonu: `/admin/ilanlar` (`admin_review_listing`, `admin_remove_listing_video`).

**Etkinlikler:**
- `/etkinlik-olustur` (`event-wizard`): kullanıcı kendi adına ya da `?isletme=<id>` ile işletme adına oluşturur.
- İşletme etkinliği doğrudan yayına girer.
- Normal kullanıcının etkinliği `pending_review` olur ve `/admin/etkinlikler`'de `admin_review_event` ile onaylanır.
  - Red ya da yayından kaldırma kalıcıdır (`admin_hidden`).
  - Kullanıcı düzenlemesi etkinliği tekrar incelemeye yollar.
- Limitler:
  - kullanıcı: 3 bekleyen + 10 yaklaşan
  - işletme: 24 saatte 10 + 30 yaklaşan
- Kullanıcının iletişim telefonu yalnız giriş yapmışlara `reveal_event_phone` ile gösterilir.
- `.ics`: `/etkinlik/[slug]/takvim`.

**Bildirimler:**
1. RPC'ler `private.notify` / `notify_admins` ile `notifications` satırı ekler.
2. `notifications_push_webhook` trigger'ı pg_net ile `/api/notifications/push`'a gider.
3. Route `claim_push_notifications` ile satırları alır, `web-push` (VAPID) gönderir, `push_sent_at` işaretler. Hata en fazla 3 deneme, 10 dakikalık retry cron'u.
4. 404/410 dönen abonelik silinir.
5. Uygulama içi: `/profil/bildirimler` + `use-unread-notifications`. Admin bildirimleri (link `/admin...`) uygulamada gizlidir, yalnız admin panelinde (`admin-notices`) görünür ve push'lanmaz.
6. Abonelik: `src/lib/push/client.ts`. İzin yalnız dokunuşla istenir; iOS'ta ana ekrana eklenmiş PWA gerekir.

**Şehir rehberi:**
- `poi` 10 türü tutar: pharmacy, mosque, bus_stop, place, taxi, atm, institution, fuel, ev_charge, bank.
- `/yakinimda`: MapLibre haritası, chip'ler.
- `/rehber` hub, `/rehber/[kategori]` (GUIDE_SECTIONS ya da kurum kategori slug'ı), `/kurum/[slug]`. Yerler `/gezilecek-yerler/[slug]`.
- Kurum kategorileri `institution_categories` tablosunda, grupları yonetim, guvenlik, adalet, saglik, egitim, iletisim. Ör. belediye, kaymakamlik, nufus, tapu, vergi, sgk, emniyet, jandarma, adliye, hastane, aile_sagligi_merkezi, okullar, universite, kutuphane, ptt.
- ATM/banka `details.bank`, akaryakıt `details.brand`, şarj `details.operator` alanını tutar.
- Konum isteğe bağlıdır. Konumsuz kayıtlar `/admin/rehber/konum` kuyruğunda bekler; pin `LocationPicker` ile girilir.
- Veri kaynakları:
  - `import-city-guide.mjs`: araştırılmış JSON, fotoğraflar Wikimedia'dan R2'ye.
  - `seed-poi.mjs` ve aylık `/api/cron/poi-sync`: KBB (CC BY) ve OSM (ODbL).
  - Kaynağın artık listelemediği satır gizlenir, silinmez. `locked` satır admin düzenlemesini korur.
- Nöbet: `pharmacy_duty` + `duty_data_mode`. Elle giriş `/admin/nobet` (`admin_set_duty`), otomatik import NosyAPI (anahtar tanımlı değil).

**Doktorlar:**
- `business_staff` satırları yalnız `vertical = 'saglik'` işletmelerde, branşlar `doctor_branches` sözlüğünden.
- Kişisel telefon yok; arama kliniğin numarasına gider.
- KVKK için `consent_confirmed_at` zorunlu ve sunucu damgalar.
- Sahip `/isletme/doktorlar`'dan (`doctors-manager`) yönetir.
- Public görünüm: `/kesfet/saglik#doktorlar` (2 sütun kart); firma sayfasında gösterimi doğrulanmadı.

**GebzemAI:**
1. `/gebzemai` (giriş gerekli) -> `POST /api/gebzemai`.
2. Route `ai_begin_turn` ile limit ve bütçeyi kontrol eder ve turu rezerve eder.
   - `ai_daily_messages` 20/gün, `ai_per_minute` 5, `ai_daily_budget_usd` 5 USD/gün global.
3. Sağlayıcı: `runProviderAgent` (OpenAI ya da Anthropic), stream.
   - En fazla 4 tool turu, 800 çıktı token'ı, 50 sn süre.
   - 6 uygulama içi tool, anon/RLS sorgularla.
4. Kullanım `ai_finish_turn` ile yazılır (service role).
5. Yalnız kullanım metaverisi saklanır; konuşma metni saklanmaz ya da loglanmaz.
6. Açık olması için iki şart: `ai_enabled = true` ve seçili sağlayıcının anahtarı (`OPENAI_API_KEY` ya da `ANTHROPIC_API_KEY`) public projede tanımlı. Ayarlar `/admin/gebzemai`'de.
7. Model allowlist'i `src/features/ai/lib/models.ts` ve `2026091378_gebzemai_openai.sql` içinde. İkisi aynı tutulmalı.

**Admin sitesi:**
- Sayfa okumaları admin'in oturumuyla yapılır.
- Server Action'lar `withAdmin()` ile çalışır: `IS_ADMIN_SITE` + `role = admin`.
- Yazmalar admin RPC'lerinden ya da RLS "admin write" politikaları olan tablolara doğrudan (ör. rehber `poi`) gider. `createAdminClient()` admin kodunda ASLA kullanılmaz.
- Service role gereken işler pg_net ile public `/api/cron/*`'a kuyruklanır: haber çek (`admin_refresh_news_now`), POI eşitle (`admin_poi_sync_now`), video/dosya silme (`media_trash`).
- Değişiklikten sonra `revalidatePublic({tags, paths})`, public uygulamanın `/api/revalidate`'ine `x-revalidate-secret` (= `REVALIDATE_SECRET`) ile POST atar. Ulaşılamazsa "bir saate kadar geç görünebilir" uyarısı çıkar.

## 5. Ortam değişkenleri (yalnız adlar; değerleri asla yazdırma)

Hangi projede olacağı koddan çıkarıldı. Vercel'deki gerçek tanımlar bu belgede doğrulanmadı.

**Her iki proje (public ve admin):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: tüm client'lar.
- `NEXT_PUBLIC_MEDIA_BASE_URL`: R2 public adresi (CSP, `next/image` remotePatterns, URL ayrıştırma).
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`: `LocationPicker`. Public'te başvuru, düzenleme, etkinlik; admin'de rehber ve yer formları.
- `REVALIDATE_SECRET`: admin gönderir, public doğrular.
- `NEXT_PUBLIC_SITE_URL` (isteğe bağlı, varsayılan `https://gbzsehir.vercel.app`): admin'de mutlak public linkler ve revalidate hedefi.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (isteğe bağlı): giriş formu. Şu an tanımlı değil.

**Yalnız admin projesi:**
- `NEXT_PUBLIC_APP_MODE=admin`.

**Yalnız public proje:**
- `SUPABASE_SERVICE_ROLE_KEY`: cron, push, talep-foto, AI kullanım yazımı, medya silme, haber kaydı.
- `CRON_SECRET`: Vault `gebzem_push_webhook_secret` ile aynı.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: Web Push.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: medya adaptörü. Hepsi ve `media_public_base` eşleşmesi olmazsa Supabase'e düşer.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`: GebzemAI (seçili sağlayıcınınki yeterli).
- `NOSYAPI_URL`, `NOSYAPI_KEY` (isteğe bağlı): nöbet import. Tanımlı değil.
- `NEXT_PUBLIC_ADMIN_SITE_URL` (isteğe bağlı, varsayılan `https://gbzsehir-admin.vercel.app`): `/admin` yönlendirme hedefi.

**Yalnız yerel ve betikler:**
- `SUPABASE_PROJECT_REF` (`.env.local`).
- `SUPABASE_ACCESS_TOKEN` (`secrets.ps1`, Management API).
- `ADMIN_OTP_FILE` (auth-setup / verify betikleri).
- `CITY_GUIDE_FILE` (import-city-guide).
- `NEXT_PUBLIC_DISABLE_SW` (isteğe bağlı, SW'yi kapatır).

**`.env.local`'de olup kodda okunmayan eski adlar:** `SEND_SMS_HOOK_SECRET`, `OTP_DEMO_MODE`, `NEXT_PUBLIC_OTP_DEMO_MODE`. OTP modu artık yalnız `app_settings.otp_demo_mode`'dan okunuyor.

## 6. Test ve dağıtım

**Kod kontrolleri (repo kökünde, her adımdan sonra):**
- `npx tsc --noEmit`
- `npx eslint` (`npm run lint`)
- `npx next build` (`npm run build`)
- `package.json`'da test script'i ya da test runner yok.

**DB değişikliği:**
1. Migration yaz (yeniden çalıştırılabilir, fonksiyonlar canlı gövdeden başlar).
2. `node --env-file=.env.local scripts/db/sql.mjs supabase/migrations/<dosya>.sql` ile uygula.
3. `scripts/db/gen-types.mjs` ile tipleri yeniden üret.
4. Gerekirse `verify-auth.mjs` / `verify-all.mjs` çalıştır.
5. Okuma sorguları: `sql.mjs -e "select ..."`.

**Ekran testleri:** headless Edge (`msedge --headless=new --remote-debugging-port=...`), 390 px genişlik, Chrome DevTools Protocol betikleri.
- `cdp-shot.mjs`: onboarding ve install prompt'u localStorage bayraklarıyla atlar, yatay taşmayı raporlar.
- `cdp-auth-shot.mjs`: demo OTP ile alınmış oturumu `@supabase/ssr` çerezi olarak enjekte eder, SW'yi bypass eder, token yazdırmaz.
- `cdp-flow.mjs`: link tıklaması sonrası 250 ms / 1 sn / 3 sn ekran görüntüsü ve konsol hataları.
- `cdp-steps.mjs`: çok adımlı UI testi (tap / type / wait / shot / text).
- `cdp-click.mjs`: tıklama sonrası ekran görüntüsü.
- Bu betikler oturum scratchpad'inde duruyordu ve oturumla birlikte kaybolabilir. Kalıcı olsun istenirse `scripts/dev/` altına kopyalanabilir; sır içermediklerinden emin olunmalı.
- Ekran görüntüsünde service worker'ı bypass et: bir kez bayat sayfa göstermişti.

**Dağıtım:**
- `git push origin main` -> Vercel `gbzsehir` projesi otomatik build/deploy.
- `gbzsehir-admin` projesinin de aynı push ile deploy olduğu varsayılıyor (doğrulanmadı).
- Scratchpad'deki `deploy-wait.mjs <sha> <proje...>` iki projenin READY olmasını bekler.
- Ardından 390 px ekran görüntüsü alınır ve kısa bir Türkçe rapor verilir.

**Çalışma kuralları (kullanıcı tercihleri):**
- Adım adım ilerle, kapsamın dışına çıkma.
- Yalnız adımın dosyalarını commit'le.
- Emoji kullanma, yatay sayfa kaydırması olmasın.
- Detay sayfalarında büyük siyah "Ara" butonu olur; uygulama içi mesajlaşma yok.
- Ayrıntılar `~/.claude/projects/.../memory/working-style.md` dosyasında.

## 7. Açık konular (kısa)

- **Demo OTP modu açık:** gerçek SMS sağlayıcısı yok, `otp_golive.sql` uygulanmadı.
- **Nöbet listesi `demo` modunda:** gerçek kaynak yok (NosyAPI anahtarı ya da Eczacı Odası izni gerekiyor).
- **Yasal metinler v0.1 taslak:** `[yer tutucu]`'lar ve avukat incelemesi bekliyor. Destek telefonu/e-postası da yer tutucu.
- **Demo veri:** canlıya çıkmadan `/admin/veri` ya da `remove-demo.mjs` ile silinmeli. O zamana kadar `refresh-demo-dates.mjs` 2026-11-10'dan önce tekrar çalıştırılmalı.
- **Ürün kararları kodla uyuşmuyor (hafızadan; doğrulanmadı):**
  - Kapsam tüm Kocaeli olacak ama `src/config/site.ts` `CITY` hâlâ Gebze.
  - Mahalle alanları kaldırılacak ama `neighbourhood-picker` ve `location-chip` hâlâ var.
  - Haritalarda her yerde Google Maps istenmiş ama harita görünümleri MapLibre + OpenFreeMap.
- **Bekleyen adımlar:** admin 2FA (TOTP), GTFS otobüs hatları (feed URL'si ve lisans gerekiyor), R2 kurulum token'ının silinmesi.
- **Repo OneDrive altında:** taşınması önerildi.
- **Sonraki büyük adım:** PWA prototipi bitince Flutter + Go ile yerel uygulama. Bu PWA onun şartnamesi (ekranlar, akışlar, şema, iş kuralları).

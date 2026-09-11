# Gebzem — Proje durumu ve devam rehberi

Son güncelleme: 11 Eylül 2026, gece. Bu dosya, sohbet kapanırsa yeni bir oturumun (Claude Code ya da bir geliştirici) kaldığı yerden devam edebilmesi için yazıldı. Gizli değer içermez; sadece değişken ve kaynak adları geçer.

Diğer belgeler:
- `docs/OTURUM-GUNLUGU.md`: sohbetin kronolojik özeti, yapılan hatalar ve dersler
- `docs/MIMARI-AGAC.md`: kod ağacı, veritabanı ve akışların ayrıntılı açıklaması
- `CLAUDE.md`: yeni oturumda ilk okunacak kurallar

---

## 1. Hızlı başlangıç (yeni oturum için)

| Konu | Bilgi |
|---|---|
| Canlı uygulama | https://gbzsehir.vercel.app |
| Admin sitesi (ayrı) | https://gbzsehir-admin.vercel.app/admin (telefon + şifre) |
| Kod deposu | GitHub `gbz-app/gbzseir`, dal `main`; `main`'e push = Vercel deploy |
| Vercel projeleri | `gbzsehir` (public), `gbzsehir-admin` (aynı repo, `NEXT_PUBLIC_APP_MODE=admin`) |
| Veritabanı | Supabase proje `fboythglcjofakbskstg`, bölge Tokyo (ap-northeast-1); Vercel fonksiyonları `hnd1` |
| Son canlı commit | `d3bf2ac` (Sağlık tek sütun, çalışma saatleri, iş ilanı detayı) |

**ÖNEMLİ:** `d3bf2ac`'den sonra yapılan ~250 dosyalık iş **henüz commit edilmedi ve canlıda değil**; çalışma ağacında duruyor. Veritabanı değişikliklerinin çoğu ise canlıya uygulandı (bkz. bölüm 5). Yeni oturumun ilk işi: `npx tsc --noEmit -p .` → `npx eslint` → `npx next build` → 390px ekran testleri → commit → push → deploy kontrolü.

**Gizli değerler nerede:** repo'da yok. Uygulama anahtarları `.env.local` (git-ignored) ve Vercel ortam değişkenlerinde. Yönetim anahtarları (Supabase access token, Vercel token, GitHub token) sahipte; önceki oturumda geçici oturum klasöründe (scratchpad) tutuluyordu ve oturum kapanınca kaybolur. Yeni oturumda bu üçünü sahipten tekrar isteyin; hiçbir zaman commit'e, belgeye veya çıktıya yazmayın.

---

## 2. Sahibin değişmeyen kuralları

- **Dil ve iletişim:** Türkçe, samimi ("dostum"). Her adımdan sonra kısa Türkçe özet. Sahip, gereksiz soruyla durdurulmayı sevmez; iş bitince kapsamlı özet ister.
- **Çalışma şekli:** adım adım; her adımda tip kontrolü + lint + build + 390px ekran görüntüsü + commit (sadece o adımın dosyaları, gizli tarama) + push + Vercel deploy kontrolü.
- **Tasarım:** gölge yok, kenarlık yok; lavanta zemin üstünde beyaz kartlar; Lucide ikonları, **emoji yok**; mor tema (#8C6CF0); ana eylem düğmesi **siyah**; 390px mobil öncelikli; yatay sayfa kaydırması yok; alt menü her sayfada tam genişlik, düz siyah.
- **Uygulama içi mesajlaşma yok:** iletişim sadece telefonla ("Ara" düğmesi).
- **Admin ayrı site:** uygulamadan admin'e link yok. Admin sitesinde service-role anahtarı yok; admin yazmaları admin-only SECURITY DEFINER RPC'lerle yapılır.
- **Kapsam:** Kocaeli'nin 12 ilçesinin tamamı (İzmit, Gebze, Darıca, Çayırova, Dilovası, Körfez, Derince, Kartepe, Başiskele, Gölcük, Karamürsel, Kandıra). Uygulamanın adı "Gebzem" olarak kalıyor.
- **Mahalle yok:** konum = ilçe + adres + harita pini.
- **Harita:** her yerde Google Maps (OpenStreetMap karosu kullanılmayacak).
- **Başka projelere dokunulmaz:** Vercel `gebzem`, `gbz-ver`, `2c-gebzem`; Google Cloud `gebzem-app-push`; Cloudflare `gbz-a2cloud` tokenı, D1, Pages.
- **Canlı veritabanında gerçek kullanıcıları etkileyen yazma** (bildirim gönderen değişiklikler vb.) öncesi sahibin açık onayı alınır.
- **Sonraki büyük hedef:** prototip bitince Flutter + Go ile sıfırdan native uygulama (bu PWA şartname olacak).

Ayrıntılı ürün kararları: `docs/OTURUM-GUNLUGU.md` bölüm "Kararlar".

---

## 3. Dış servisler (kaynak adları, gizli değer yok)

| Servis | Kaynak | Not |
|---|---|---|
| Supabase | proje `fboythglcjofakbskstg` | RLS + RPC; pg_cron + pg_net ile `/api/cron/*` çağrıları |
| Vercel | `gbzsehir`, `gbzsehir-admin` | ortam değişkeni adları bölüm 6'da |
| Google Cloud | proje `gbzsehir-rehber` (hesap gebzemapp@gmail.com) | Maps JavaScript, Geocoding, Places (New). Anahtar "gbzsehir-web": sadece iki vercel.app alanı ve localhost:3000/3100, sadece bu 3 servis. gcloud komutlarında **her zaman** `--configuration=gbzsehir --project=gbzsehir-rehber`; varsayılan gcloud ayarı diğer projeye (`gebzem-app-push`) bakar, değiştirmeyin. |
| Cloudflare R2 | bucket `gbzsehir-media` (EEUR), herkese açık r2.dev adresi, CORS iki vercel.app + localhost | Uygulama anahtarı "gbzsehir-media-app" sadece bu bucket'a yetkili. Kurulum anahtarı "gbzsehir-kurulum" güçlü; video yükleme uçtan uca test edilince silinmeli. |
| OpenAI | ortam değişkeni `OPENAI_API_KEY` (sadece gbzsehir) | GebzemAI için; varsayılan model `gpt-5.4-mini`; soru başı ~0,002 USD. `ai_enabled` şu an kapalı. Anahtar sohbette paylaşıldı: yenilenmesi önerildi. |
| SMS sağlayıcı | bağlı değil | Demo OTP sadece +90555000xxxx için. Sahibin numarasında sabit test kodu var. 6 gerçek hesap yeni giriş başlatamaz. |
| Nöbetçi eczane kaynağı | bağlı değil | `duty_data_mode = 'demo'`; gerçek kaynak (NosyAPI anahtarı veya Kocaeli Eczacı Odası izni) sahibin kararı |

---

## 4. Durum (11 Eylül 2026 gece)

### 4.1 Canlıda
- Sağlık tek sütun kart, çalışma saatleri kenarlıksız, modern iş ilanı detayı (commit `d3bf2ac`)
- Hizmet talebi: tüm kategoriler otomatik gönderim, gerçek taleplere örnek firma yok, bildirimi açık olmayanın bildirimi açınca gider (DB)
- Kritik demo-OTP açığı kapatıldı + 12 güvenlik sertleştirmesi (DB)
- Tatil modu, "tümünü okundu", işletme kuralları, ilan istatistikleri, kullanıcı etkinlikleri, arama kayıtları, ilan videosu, GebzemAI, şehir rehberi (402 kayıt), doktorlar: **veritabanı tarafı canlı, kodu değil**
- Google Maps projesi/anahtarı, Cloudflare R2, OpenAI anahtarı kurulu

### 4.2 Kodda hazır, test + deploy bekliyor
Header titremesi (yükleme ekranları), alt menü (düz siyah, tam genişlik), ortak alt çubuk (BottomDock), büyük/modern bildirim mesajları, modern şikayet sayfası, "Tümünü okundu yap", yeni tanıtım ekranları (5 adım), işletme açma (türe göre özellikler), tek işletme + destek yönlendirmesi, tür kilidi, adım adım işletme düzenleme, otellere QR menü, profil gücü (görev listesi), ilan sihirbazı ve detay ikonları, ilan istatistik ekranı, ilana 1 video (R2), etkinlikler (herkes oluşturur, kullanıcılar admin onayı; liste kategori tarzı, sade detay, takvime ekle), yeni arama sayfası, kenarlık/gölge temizliği, GebzemAI sayfası (OpenAI), ana sayfada Etkinlik kutusu ve GebzemAI kartı.

### 4.3 Arka planda çalışıyordu (bittiklerinde sonuçları kontrol edilmeli)
- Şehir rehberi sayfaları + admin rehber yönetimi (Google pin) + doktorlar (8 adımdan 5'i bitmişti)
- Kocaeli faz A: `2026091380_kocaeli_districts.sql` (12 ilçe, ilçe alanları, hizmet bölgesi ilçeye) ve KBB verisi + GTFS durak aktarımı (`scripts/db/import-kocaeli.mjs`)
- Kocaeli banka/ATM + kurum/okul/hastane/şarj/noter derin araştırması (çıktı oturum klasöründeydi; kalıcı kopyası `kocaeli/_arastirma/` altına alınacak)
- `docs/MIMARI-AGAC.md` yazımı

### 4.4 Sırada
1. Birleşik build + test + commit + deploy (bölüm 1)
2. Kocaeli faz B (arayüz): ilçe seçici, mahallenin kaldırılması. Gruplar: (G1) tanıtım + profil, (G2) ilanlar, (G3) işletme, (G4) hizmet talepleri, (G5) etkinlikler, (G6) yakınımda/rehber/arama/AI araçları, (G7) admin. Faz C: mahalle kolonlarını kullanmayı tamamen bırakmak.
3. Tüm haritaları Google Maps'e geçirmek (harita "Harita"ya basınca yüklensin; maliyet için)
4. Banka/ATM araştırmasını içeri aktarmak; OSM aylık senkronunu KBB kaynaklı türlerde kapatmak
5. Nöbetçi eczane için gerçek kaynak (sahibin kararı)
6. GebzemAI: internet araması (sadece veritabanında yoksa), doktor önerisi aracı, toplu taşıma (sefer saati verisi gelirse); sonra `ai_enabled` açılır
7. Yayın öncesi: demo verilerin temizlenmesi (Admin > Veri), hukuki metinlerin güncellenmesi (Tokyo barındırma, OpenAI (ABD), R2, arama istatistikleri), SMS sağlayıcı, captcha (Turnstile), admin 2FA, repo'nun OneDrive dışına taşınması

---

## 5. Bugünkü veritabanı değişiklikleri (supabase/migrations)

| Dosya | İçerik | Durum |
|---|---|---|
| 2026091365_service_dispatch_fix | otomatik gönderim, bölge önceliği, demo filtresi, bildirim park etme | canlı |
| 2026091366_vacation_mode | tatil modu + dönüş tarihi + günlük kapatma işi | canlı |
| 2026091367_mark_all_notifications_read | tümünü okundu RPC | canlı |
| 2026091368_otp_lockdown | demo OTP sadece +90555000xxxx | canlı |
| 2026091369_security_hardening | push adres kontrolü, yorum/yükleme/iletişim sınırları, hesap silmede yeni kod | canlı |
| 2026091370_business_rules | tek işletme, ek hak, tür kilidi, "personel arıyorum" temizliği | canlı |
| 2026091371_listing_stats | günlük ilan istatistikleri | canlı |
| 2026091372_user_events | kullanıcı etkinlikleri, onay, sınırlar, telefon gösterme | canlı |
| 2026091373_search | arama kayıtları, popüler aramalar/yerler | canlı |
| 2026091374_listing_video | ilan videosu, medya kotası | canlı |
| 2026091375_gebzemai | AI kullanım sınırları ve bütçe | canlı |
| 2026091376_city_guide | yeni yer türleri, kurum kategorileri | canlı |
| 2026091377_business_staff | doktorlar | canlı |
| 2026091378_gebzemai_openai | sağlayıcı seçimi, model listesi | canlı |
| 2026091380_kocaeli_districts | ilçeler, ilçe alanları | faz A işi çalışıyordu |
| 2026091381_kocaeli_import_support | aktarım desteği, toplu taşıma hatları | faz A işi çalışıyordu |

Uygulama şekli: `node --env-file=.env.local scripts/db/sql.mjs <dosya>` (önce yönetim tokenı ortamda olmalı). Önce deneme (BEGIN..ROLLBACK), `CREATE OR REPLACE` öncesi canlı tanımı `pg_get_functiondef` ile okuyun. Uyguladıktan sonra `scripts/db/gen-types.mjs` ile tipleri yenileyin.

---

## 6. Ortam değişkeni adları

- **gbzsehir (public):** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PROJECT_REF, CRON_SECRET, REVALIDATE_SECRET, SEND_SMS_HOOK_SECRET, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, OTP_DEMO_MODE ve NEXT_PUBLIC_OTP_DEMO_MODE (eski, artık app_settings kullanılıyor), NEXT_PUBLIC_GOOGLE_MAPS_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, NEXT_PUBLIC_MEDIA_BASE_URL, OPENAI_API_KEY
- **gbzsehir-admin:** NEXT_PUBLIC_APP_MODE=admin, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, REVALIDATE_SECRET, NEXT_PUBLIC_GOOGLE_MAPS_KEY, NEXT_PUBLIC_MEDIA_BASE_URL (service-role anahtarı bilerek yok)

---

## 7. Test ve araçlar

- Tip/lint/build: `npx tsc --noEmit -p .`, `npx eslint --max-warnings=0 <dosyalar>`, `npx next build`
- Yerel sunucu: `npx next dev -p 3100` (aynı anda birçok ajan dosya değiştirirken Turbopack çökebilir; sakin bir anda çalıştırın)
- 390px ekran görüntüsü: başsız Edge + CDP betikleri (`scripts/dev/cdp-steps.mjs`; demo kullanıcı oturumu çerez olarak enjekte edilir; servis çalışanı devre dışı bırakılır)
- Deploy bekleme: `scripts/dev/deploy-wait.mjs <sha> gbzsehir gbzsehir-admin` (Vercel token gerekir)
- SQL okuma/deneme: `scripts/dev/sqlq.mjs`, `scripts/dev/sql-dryrun.mjs`
- Vercel ortam değişkeni: `scripts/dev/vercel-env-keys.mjs` (sadece adlar), `scripts/dev/vercel-env-set.mjs` (değeri dosyadan okur, yazdırmaz)
- Git Bash'te `/yol` argümanları için `MSYS_NO_PATHCONV=1`; Edge CDP için mutlak `--user-data-dir`

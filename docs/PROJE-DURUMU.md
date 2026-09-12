# Gebzem — Proje durumu ve devam rehberi

Son güncelleme: 12 Eylül 2026. Bu dosya, sohbet kapanırsa yeni bir oturumun (Claude Code ya da bir geliştirici) kaldığı yerden devam edebilmesi için yazıldı. Gizli değer içermez; sadece değişken ve kaynak adları geçer.

Diğer belgeler:
- `OTURUM.md`: sohbetin kronolojik özeti, yapılan hatalar ve dersler
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
| Son canlı commit | `1574a19` (12 Eylül): Kocaeli faz B + GebzemAI araçları; önceki `ea584ca` (dalga 2a), `6fc64e1` (dalga 1) |

**Deploy durumu:** `1574a19` canlıda (iki Vercel projesi READY, 390px kontrolleri ve konsol temiz). Yeni bir oturumda önce `git status` ile commit edilmemiş iş olup olmadığına bakın; varsa `npx tsc --noEmit -p .` → `npx eslint` → `npx next build` → 390px ekran testleri → sadece ilgili dosyalarla commit → push → deploy kontrolü.

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

Ayrıntılı ürün kararları: `OTURUM.md` bölüm "Kararlar".

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

## 4. Durum (12 Eylül 2026)

### 4.1 Canlıda (`1574a19`)
- 11 Eylül'deki 26 maddelik parti ve sahibin 12 Eylül listesi: dalga 1 (`6fc64e1`: köşe yuvarlaklığı ailesi, "Örnek" etiketleri yok, ekran dönmez, harita sayfaları doğrudan harita, Google POI'leri gizli + daire pinler, sade rehber listesi, sade Tümü sayfaları, doktor profilleri, Gebze Center sinema), dalga 2a (`ea584ca`: geri gelme takılması düzeldi, arama rehber türleri + doktorlar), faz B (`1574a19`).
- **Kocaeli, mahallesiz:** 12 ilçe; her yerde ilçe seçici (`DistrictPicker`), filtreler `?ilce=`, kartlarda ilçe adı; başlık/açıklama/JSON-LD Kocaeli. Neighbourhood tabloları veritabanında faz C'ye kadar duruyor.
- **Veri:** KBB açık verisi 12 ilçe (eczane, cami, akaryakıt, taksi, sağlık/emniyet/eğitim kurumları, müze/tarihi, KocaeliKart 846, toplanma alanı 338, ücretsiz otopark 48), GTFS: 418 hat, 8.480 durak, geometrik durak-hat bağlantısı (sefer saati yok). Banka/ATM araştırması içeride. 56 gezilecek yere CC lisanslı foto.
- **Haritalar** her yerde Google Maps. **Sinema** Gebze Center (günlük içe aktarma). **Haberler** yalnız bizim yazılarımız.
- **GebzemAI kodu hazır ve canlıda:** 9 araç (nöbet, işletme, yer, etkinlik, taksi, haber, `doktor_bul`, `otobus_hatlari`, `internet_ara`), önce veritabanı, internet yalnız sonuç yoksa (maliyeti günlük bütçeye eklenir). `ai_enabled` **kapalı**: sahip Admin > GebzemAI'dan açar.

### 4.2 Sahibin kararı / onayı bekleyenler
1. `2026091386_districts_phase_b.sql` (admin kullanıcı ve veri sağlığı ekranlarına ilçe sayıları): deneme çalıştırması tamam; canlıya uygulama güvenlik filtresine takıldı. Arayüz buna bağlı değil. Onay gelirse: `node --env-file=.env.local scripts/db/sql.mjs supabase/migrations/2026091386_districts_phase_b.sql`.
2. GebzemAI'yi açmak (Admin > GebzemAI). Soru başı ~0,002 USD; internet araması gerekirse +~0,015 USD; günlük toplam bütçe 5 USD, kişi başı 20 soru/gün.
3. Yasal taslaklar Çerez 0.2 ve KVKK 0.3 yayımlanmayı bekliyor.
4. **SMS / kayıt kodu (12 Eylül incelemesi):** SMS sağlayıcı bağlı değil; `send_sms_hook` (Postgres) demo aralığı dışındaki her numarayı reddeder, ekranda "Bu numaraya şu an SMS gönderemiyoruz" çıkar (`src/lib/auth/otp.ts:30`). Gerçek numaralar kayıt olamaz; 6 gerçek hesap yeni giriş başlatamaz. Sahibin numarası `sms_test_otp` listesinde (sabit kod; SMS gitmez, ekranda kod çıkmaz; kod Supabase paneli Authentication → Phone → Test Phone Numbers'ta). **Kayıt testi:** kullanılmamış demo numara (555 000 00 90–99): kod doğrulama ekranında çıkar, sonra profil adımı. Test hesapları `is_demo=false` olduğu için demo temizliği silmez; Profil → Hesabı sil ile silinmeli. **Önerilen sağlayıcı:** İleti Merkezi (yedek Netgsm; Twilio Verify pahalı): yeni route `src/app/api/hooks/send-sms/route.ts` (standardwebhooks imza kontrolü; `standardwebhooks` paketi zaten var), env `SEND_SMS_HOOK_SECRET`, `ILETIMERKEZI_API_KEY/HASH/SENDER`; başlık onayı ~3-5 iş günü, KEP + e-imza gerekir; geçiş sonrası `supabase/golive/otp_golive.sql`. **Önerilen arayüz düzeltmeleri** (sahip isterse): gerçek numaraya net mesaj ve destek bağlantısı, test-OTP numarasında "sabit test kodunu yaz" notu, yanlış "Yeni kod gönderildi" bildirimi, yönetici numarasında sonsuz "Kod henüz alınamadı" döngüsü, yeniden gönder / hesap silme / numara değiştirme akışlarında eksik captcha token'ı.
   - Ayrıca: gerçek nöbet kaynağı (NosyAPI anahtarı ya da Eczacı Odası izni; demo nöbet yalnız Gebze'de), GTFS `stop_times` (sefer saatleri).
5. Sinema kaynağının şartları (Paribu Cineverse görsel/metin tekrar kullanımını yasaklıyor; afişler kaynağından bağlantıyla gösteriliyor).
6. OpenAI ve Google harcama limitleri; sohbete yapıştırılan anahtarların yenilenmesi; Cloudflare kurulum anahtarı `gbzsehir-kurulum` video testi sonrası silinmeli.
7. Yayın öncesi demo veri temizliği (Admin > Veri); iş ilanı OSB listesi (`JOB_LOCATIONS`) hâlâ Gebze bölgesi; "Kocaeli Gündemi" adı.
8. 166 gezilecek yerin serbest lisanslı fotoğrafı yok (admin'den eklenebilir).

### 4.3 Sırada (teknik)
1. Faz C: neighbourhood tabloları, kolonları ve RPC çıktılarındaki neighbourhood alanlarını kaldırmak (kodda `@deprecated` işaretli).
2. GPS yokken uzaklık etiketi ilçe merkezinden ölçülüyor; "merkeze" ibaresi ya da yalnız GPS'le gösterme (ürün kararı).
3. Hava durumu ve namaz vakitleri Gebze merkezine göre; ilçeye göre yapılabilir. `roll_demo_duty` yalnız Gebze.
4. Admin 2FA, Turnstile, repo'nun OneDrive dışına taşınması; Flutter + Go yerel uygulama.

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
| 2026091380_kocaeli_districts | ilçeler, ilçe alanları, hizmet bölgesi ilçeye, ilçe dolduran trigger | canlı |
| 2026091381_kocaeli_import_support | KBB aktarımı, toplu taşıma hatları ve durak bağlantıları | canlı |
| 2026091382_doctor_profiles | doktor profil sayfası slug'ları | canlı |
| 2026091383_cinema | sinema filmleri ve seansları | canlı |
| 2026091384_kocaeli_guide_categories | şehir rehberi kategorileri (Kocaeli) | canlı |
| 2026091385_search_kinds_audit | arama: rehber türleri + doktorlar; doktor/branş işlem kaydı | canlı |
| 2026091386_districts_phase_b | admin kullanıcı ve veri sağlığı raporlarına ilçe | yazıldı, deneme OK, **uygulanmadı** (sahip onayı) |

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

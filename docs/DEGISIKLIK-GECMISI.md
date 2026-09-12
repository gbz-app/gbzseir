# Gebzem — Değişiklik geçmişi (commit commit)

Bu dosya `git log` çıktısından üretildi: projenin bütün commitleri eskiden yeniye, mesajları ve değişen dosya sayılarıyla. Zamanlar Türkiye saati. Ne istendiği ve neden yapıldığı için `OTURUM.md`, sahibin mesajları için `docs/SOHBET-KAYDI.md`.
## 2026-09-10 18:50 — `87b268a`
**chore: Next.js 16 iskeleti ve mimari plan**
 20 files changed, 9356 insertions(+)
## 2026-09-10 21:18 — `61636d0`
**feat: temel altyapı (Supabase şema/RLS/RPC/seed, PWA iskeleti, telefonla giriş, tanıtım)**
- 8 migration: 28 tablo, RLS, 38+ RPC, storage, pg_cron; yetki yükseltme açığı düzeltildi
- Gerçek Gebze verisi: 40 mahalle, 95 eczane, 124 cami (KBB açık veri), OSM durak/park, 17 seçilmiş yer
- Demo nöbet listesi, hizmet kategorileri ve soru akışları, demo işletme/ilan
- Next.js 16 PWA: manifest, ikonlar, service worker, çevrimdışı sayfa, web push altyapısı
- Telefon + OTP giriş (prototip modu), profil tamamlama, 6 slaytlık tanıtım, kurulum rehberi
- Ortak bileşenler, sihirbaz (wizard) altyapısı, tüm rotalar için yer tutucular
 251 files changed, 24702 insertions(+), 401 deletions(-)
## 2026-09-10 21:56 — `75e1d6b`
**feat: Google Sans, logosuz tasarım, Lucide ikonlar ve modül sayfaları**
- Tüm arayüz Google Sans; logo bileşeni ve kullanımları kaldırıldı
- Tanıtım görselleri sadece Lucide ikonlarıyla düz (2B) tasarım
- Uygulama ikonları Lucide MapPin ile düz renkte yeniden üretildi
- Hizmetler (talep sihirbazı, firma tarafı), firma sayfaları, işletme başvurusu,
  haberler, duyurular ve admin modüllerinin ilk sürümü
- Bildirim push tetikleyicisi, işletme istatistikleri ve admin fonksiyonları (migration)
 233 files changed, 21778 insertions(+), 543 deletions(-)
## 2026-09-10 22:03 — `33596c5`
**feat: yakınımda detay sayfaları, nöbetçi eczane, gezilecek yerler ve ilanlar**
- /nobetci-eczane (ISR, Bugün/Yarın, 08:30 geçişi), /gezilecek-yerler
- Eczane, cami (namaz vakitleri), durak (hatlar) ve gezilecek yer detayları:
  mini harita, Ara/Yol tarifi, JSON-LD, hatalı bilgi bildirimi
- /ilanlar: 2. el / iş sekmeleri, URL filtreleri, sayfalama, İlan Ver butonu
- /ilan/[id] ve /is-ilani/[id]: detay, sahibine özel yönetim, yayında olmayanlar noindex
 9 files changed, 692 insertions(+), 54 deletions(-)
## 2026-09-10 22:09 — `a87b7d7`
**feat: ilan verme akışı (2. el ve iş ilanı sihirbazları)**
- /ilan-ver: ilan türü seçimi; iş ilanı yalnız onaylı işletmelere
- 2. el sihirbazı: kategori, fotoğraf (1-10), bilgiler, mahalle, önizleme
- İş ilanı sihirbazı: pozisyon/sektör, koşullar, açıklama, OSB/bölge, önizleme
- IBAN/kapora/telefon/URL için canlı uyarı, taslak otomatik kaydı, düzenleme modu
- /ilan-ver/tamam: yayında ya da onaya gönderildi ekranı
 8 files changed, 997 insertions(+), 24 deletions(-)
## 2026-09-10 22:15 — `fde3f06`
**feat: profil sayfaları (ilanlarım, favoriler, bildirimler, düzenle, telefon, hesap silme)**
- İlanlarım / İş ilanlarım: durum sekmeleri; düzenle, yayından kaldır/yayına al,
  satıldı/doldu, süreyi yenile, tekrar onaya gönder, sil (DB kurallarına uygun)
- Favorilerim: ilanlar, işletmeler, yerler
- Bildirimler: okunmamış vurgusu, okundu işaretleme
- Profili düzenle: sadece ad, mahalle, e-posta, fotoğraf (izinlere dokunmaz)
- Telefon numarası değiştirme (yeni numaraya kod) ve kodla onaylı hesap silme
 13 files changed, 1056 insertions(+), 42 deletions(-)
## 2026-09-10 22:19 — `b7f23a8`
**feat: işletme paneli, yorumlar ve fotoğraflar**
- /isletme: başvuru durumuna göre ekran; onaylıda istatistikler, profil tamamlama
  listesi, menü ve tatil modu
- /isletme/yorumlar: yorumlara herkese açık yanıt
- /isletme/fotograflar: kapak ve iş fotoğrafları
 6 files changed, 588 insertions(+), 17 deletions(-)
## 2026-09-10 22:33 — `224d13f`
**feat: lavanta-mor tasarım dili ve yeni ana sayfa**
- Renk paleti lavanta/mor, zeminde lavantadan kreme geçiş, mor tonlu yumuşak gölgeler
- Tüm butonlar hap şeklinde, daha büyük köşe yuvarlaklığı
- Yüzen siyah hap alt menü; üst barda profil, zil, arama ve konum hapı
- Ana sayfa: karşılama + hava rozeti, İlan Ver / Ara / Hizmet Al, işletme kartı,
  nöbetçi ve hava kartları, canlı namaz vakti ilerleme kartı, Keşfet, son ilanlar
- Mor uygulama ikonları, service worker sürümü v3
 22 files changed, 440 insertions(+), 195 deletions(-)
## 2026-09-10 22:48 — `c9d0f06`
**feat: yeni profil ve işletme paneli tasarımı, kaydırma düzeltmeleri**
- Profil: başlık, "Merhaba" satırı, duruma göre koyu tanıtım kartı
  (işletme paneli / başvuru durumu / işletmen mi var / giriş), ikonlu liste
- İşletme paneli: kart ızgarası (bekleyen talep, arama, profil gücü,
  puan, yanıtsız yorum, işletme durumu) ve yönetim listesi
- Aşağı çekince oluşan siyah alan ve yatay kaydırma kaldırıldı, kaydırma çubuğu gizlendi
- Profil sayfasında üst bar yerine sayfanın kendi başlığı
 5 files changed, 481 insertions(+), 110 deletions(-)
## 2026-09-10 23:00 — `d5533ad`
**feat: ana sayfa yeni düzen ve çalışan arama**
- Sola hizalı başlık ve altında arama kutusu
- Şehir Rehberi: yana kaydırılan kartlar (canlı nöbetçi eczane sayısı)
- Ana kartlar: Yemek, Restoran, Kafe, Hizmetler, İkinci El, İş İlanı
- Gebze Gündemi haber kartları ve Gezilecek Yerler kartları
- Popüler hizmetler, son ilanlar, duyurular, işletme kartı, nöbet/hava/vakit kartları
  ve hızlı butonlar kaldırıldı
- /ara: ilan, işletme, hizmet ve yer sonuçlarıyla genel arama
 4 files changed, 398 insertions(+), 206 deletions(-)
## 2026-09-10 23:30 — `88960e8`
**feat: ana sayfa üst bar ve kart düzenlemeleri, dikey ekran kilidi**
- Ana sayfa üst barı: solda profil + Merhaba/ad, sağda sadece bildirim
- Şehir Rehberi kartları daraltıldı, kategori kartları küçük 3 sütun
- Başlık bir tık kalın; ana sayfa içindeki ayrı selamlama kaldırıldı
- Yatay tutulan telefonda "Telefonunu dik tut" ekranı (manifest zaten portrait)
 5 files changed, 92 insertions(+), 40 deletions(-)
## 2026-09-11 00:03 — `e6b79bd`
**feat: Keşfet listeleri, etkinlikler, dikey işletme veritabanı + ilişki düzeltmesi**
- Migration: businesses.vertical/price_level/star_rating/amenities/website, menü bölüm/ürün (QR menü), otel odaları, etkinlikler (RLS)
- Demo seed: 8 yemek/restoran/kafe/otel işletmesi, 87 menü ürünü, 7 oda, 8 etkinlik (CC0 fotoğraflar storage'da)
- /kesfet/[tur]: arama, filtre çipleri, büyük fotoğraf kartları, harita görünümü
- /etkinlikler ve /etkinlik/[slug]: tarih/kategori filtreleri, tam ekran kapaklı detay
- Ana sayfa: 8 kompakt kart (Otel ve Etkinlik eklendi)
- Düzeltme: events tablosu businesses->neighbourhoods gömmesini belirsiz yapıyordu (PGRST201); FK ipucu eklendi
 26 files changed, 2829 insertions(+), 49 deletions(-)
## 2026-09-11 00:25 — `29ff8c0`
**feat: işletme detay yeniden tasarım, QR menü, odalar, galeri; döviz ve hava popup'ları**
- /firma/[slug]: tam ekran galeri kapak, beyaz sayfa, puan/yorum/fiyat kutuları, olanak çipleri, siyah "Ara" butonu
- Kafe/restoran/yemek: menü önizleme + /menu/[slug] herkese açık QR menü sayfası
- Otel: oda kartları (fotoğraf, kişi, yatak, m², özellikler, gecelik fiyat)
- Galeri: ızgara + tam ekran görüntüleyici (kaydırma), işletme etkinlikleri
- Ana sayfa üst bar: hava durumu (5 günlük) ve döviz/altın (günlük, haftalık, aylık, yıllık grafik) popup'ları
- /api/piyasa (Yahoo Finance, ECB yedek) ve /api/hava (Open-Meteo)
- Yakınlaştırma kapatıldı (viewport + iOS gesture), çift dokunma zoom yok
- İşletme başvuruları FEATURES.businessApplications ile askıya alındı
 30 files changed, 1702 insertions(+), 272 deletions(-)
## 2026-09-11 00:45 — `e098df1`
**feat: işletme paneli araçları (düzenle, menü + QR, odalar, etkinlikler) ve destek merkezi**
- /isletme/duzenle: tür, bilgiler, logo, fiyat seviyesi / yıldız, olanaklar, iletişim, konum, saatler, hizmet alanları
- /isletme/menu: bölüm ve ürün yönetimi (fiyat, fotoğraf, etiket, tükendi, sıralama) + QR kod indir/yazdır
- /isletme/odalar: oda ekle/düzenle (fotoğraflar, kapasite, yatak, m², özellikler, müsaitlik)
- /isletme/etkinlikler: etkinlik ekle/düzenle (taslak, yayında, iptal), kapak, ücret, bilet bağlantısı
- Panelde türe göre menü/oda/etkinlik ve reklam bağlantıları
- Destek merkezi (/yardim): şikayet, teknik destek, reklam ve iş birliği, işletme ekletme, öneri formları + SSS + mesajlarım
- Migration: contact_messages konu/durum/admin notu + hız sınırlı submit_contact_message RPC
- Testler: 25 sahip RLS testi ve 13 destek testi geçti
 25 files changed, 2294 insertions(+), 19 deletions(-)
## 2026-09-11 01:05 — `8730b21`
**feat(admin): canlı kullanıcı, analitik, denetim kaydı, muhasebe altyapısı ve genel bakış**
- Migration: analytics_sessions / page_views / app_installs / store_stats, audit_log (+ tetikleyiciler: giriş,
  profil fotoğrafı/ad/telefon/durum/rol, işletme, ilan, yorum, destek, etkinlik, muhasebe), finance_categories /
  finance_entries, ayar anahtarları, admin RPC'leri (dashboard, online, analytics, user_overview, finance_summary),
  180 günlük saklama cron'u
- Uygulama içi çerezsiz ölçüm: sayfa görüntüleme, 60 sn nabız, PWA kurulumları (admin ve /offline hariç)
- /admin: canlı kullanıcı, bugün, bekleyen işler, 14 günlük grafikler, sayfalar, türler, kurulumlar
- /admin/analitik: çevrimiçi liste (30 sn yenileme), 7/30/90 gün, cihaz/OS/tarayıcı, kaynaklar, mağaza verisi girişi
- Testler: 26 admin testi geçti
 13 files changed, 1972 insertions(+), 4 deletions(-)
## 2026-09-11 01:21 — `c5ed8b1`
**feat(admin): kullanıcılar, destek gelen kutusu ve muhasebe**
- /admin/kullanicilar: arama (ad/telefon), filtreler, son görülme, işletme etiketi
- /admin/kullanicilar/[id]: profil, içerik sayıları, işletmeler, hesap hareketleri zaman çizelgesi,
  en çok bakılan / son gezilen sayfalar, oturumlar; aktif et / kısıtla / engelle, güvenilir yayıncı
- /admin/destek: durum ve konu filtreleri, iletişim bilgileri, durum + iç not (support_notes; gönderen göremez)
- /admin/muhasebe: dönem seçimi, gelir/gider/net/KDV özeti, 12 aylık grafik, kategori dağılımı,
  kayıt ekle/düzenle/sil, kategori yönetimi, Excel uyumlu CSV dışa aktarma
- Denetim kayıtlarında durum ve konu adları Türkçe
- Demo muhasebe kayıtları (is_demo) ve temizleme betiği güncellemesi
- Testler: A2 11/11, CSV erişim testleri geçti
 20 files changed, 1688 insertions(+), 12 deletions(-)
## 2026-09-11 01:33 — `b72745a`
**feat(admin): ayarlar, ilan kategorileri ve filtre alanları, etkinlik moderasyonu**
- Ayarlar (/admin/ayarlar): yeni işletme başvuruları aç/kapat, duyuru bandı, destek telefonu / e-postası,
  ilan süresi, onaya düşen ilk ilan sayısı, talep başına firma, analitik saklama süresi; sistem bilgisi salt okunur
- Ayarlar veritabanından okunur (60 sn önbellek, kayıtta anında yenilenir); başvuru bağlantıları, yardım ve
  "başvurular kapalı" ekranları ayarı kullanır; uygulama üstünde duyuru bandı
- İlan kategorileri (/admin/ilan-kategorileri): ağaç, ekle / düzenle / sil, sıra, simge, yasaklı kategori,
  kategori bazlı özellik ve filtre alanları (metin, sayı, seçim, evet/hayır, zorunlu)
- Etkinlikler (/admin/etkinlikler): tüm etkinlikleri yayına al / kaldır / iptal / sil, şehir etkinliği ekleme
 27 files changed, 1190 insertions(+), 43 deletions(-)
## 2026-09-11 01:46 — `1c7876b`
**feat(admin): hizmet talepleri, duyurular, haber kaynakları, gezilecek yerler, veri sağlığı; SW v4**
- /admin/talepler: durum sekmeleri + mevcut detay çekmecesi (cevaplar, adaylar, firmalara gönder)
- /admin/duyurular: ekle / düzenle / sil, tür, kaynak, mahalle hedefleme, başlangıç-bitiş
- /admin/haberler: RSS kaynakları (ekle, düzenle, aktif/pasif, akış testi, sil), hata durumu, önbelleği yenile, son başlıklar
- /admin/yerler: gezilecek yer düzenle / ekle (kategori, açıklama, saat, ücret, fotoğraf yükleme, öne çıkan, konum)
- /admin/veri: POI kaynakları, nöbetçi eczane, sayımlar, örnek veri temizliği ("SİL" onayı; etkinlik ve muhasebe dahil)
- Service worker v4: Keşfet, etkinlik ve QR menü sayfaları çevrimdışı; /yardim kişisel olduğu için önbelleğe alınmaz
- Testler: A5 11/11 geçti
 14 files changed, 1366 insertions(+), 23 deletions(-)
## 2026-09-11 02:30 — `625a225`
**feat(profil): yöneticilere "Yönetim paneli" satırı**
 1 file changed, 2 insertions(+)
## 2026-09-11 02:35 — `eb3ec66`
**fix(admin): giriş yapmamış ziyaretçi /admin açınca giriş ekranına yönlendirilir**
Önceden misafir de 404 görüyordu; yönetici başka cihazda oturum açmadan panele giremiyordu.
Giriş yapmış ama yönetici olmayanlar yine 404 görür.
 1 file changed, 6 insertions(+), 3 deletions(-)
## 2026-09-11 03:29 — `69919c3`
**feat(isletme): inceleme kaldırıldı, bir hesapta birden fazla işletme, hizmet listesi**
- İşletme açılır açılmaz yayında (apply_business); başvurular açık. Admin yine askıya alabilir.
- Bir kullanıcı birden fazla işletmeye sahip olabilir (en fazla 10): panelde işletme seçici,
  /isletme/sec ile aktif işletme (gbz_biz çerezi, sahiplik her okumada doğrulanır), "Yeni işletme ekle".
- Sihirbaz: işletme türü seçimi (yemek, restoran, kafe, otel, hizmet, mağaza, diğer), yarım kalan
  işletmeyi ?duzenle=<id> ile tamamlama.
- Hizmet firmaları için fiyatlı hizmet listesi: /isletme/hizmetlerim, firma sayfasında
  "Hizmetler ve fiyatlar" (business_services + RLS; gizli hizmetler herkese açık değil).
- Panel istatistikleri, iş ilanları, talepler ve bildirim linkleri ilgili işletmeye göre.
- Güvenlik: işletmeler yalnız apply_business ile oluşur (doğrudan insert kapalı), askıdaki hesap
  yeni işletme açamaz, talep eşleştirmede sahip başına tek firma (admin seçimi önce uygulanır).
- Eski "başvurun inceleniyor" metinleri güncellendi (ilan ver, yardım, belgeler, admin işletmeler).
 41 files changed, 1686 insertions(+), 275 deletions(-)
## 2026-09-11 03:59 — `1d35d2e`
**feat(nav): alt menu - her sekmede ikon + yazi, secili sekme dolu ikon ve kalin beyaz yazi (siyah arka plan)**
 1 file changed, 16 insertions(+), 13 deletions(-)
## 2026-09-11 04:13 — `dad74d0`
**feat(admin): admin ayri site (Vercel projesi gbzsehir-admin), uygulamada admin yok**
- Ayni kod iki kez yayinlanir: NEXT_PUBLIC_APP_MODE=admin olan projede yalniz /admin ve /giris; ana uygulamada /admin 404.
- Admin islemleri ana sitenin onbellegini /api/revalidate ile yeniler (ortak REVALIDATE_SECRET).
- Uygulamada admin linki, admin bildirimi ve admin push'u yok; admin bildirimleri admin panelinde.
- Admin sitesi: SW/analitik/onboarding yok, noindex, cikis yap, yetkisiz hesap ekrani, ana siteye tam adresli linkler.
 46 files changed, 539 insertions(+), 137 deletions(-)
## 2026-09-11 04:26 — `8cb0179`
**feat(anasayfa): Kategoriler'e Taksi (gorsel kart) ve Kategoriler basligi**
 2 files changed, 29 insertions(+), 12 deletions(-)
## 2026-09-11 04:33 — `1303da5`
**feat(anasayfa): yeni ana sayfa - selamlama, doviz kaldirildi, slider, resim kartlari, gezilecek yerler**
- Header: saate gore Gunaydin / Iyi gunler / Iyi aksamlar; foto yoksa beyaz yuvarlak; hava durumu ve bildirim cercevesiz; sayfayla birlikte kayar.
- Doviz ozelligi ve /api/piyasa tamamen kaldirildi.
- 'Gebze'yi kesfet', cercevesiz arama, 3 sayfali slider (10 sn, yumusak gecis).
- Sehir Rehberi ve Kategoriler: resim kartlari, adi altta; Taksi gorselli.
- Gezilecek Yerler: sekmeler, buyuk kartlar + beyaz bilgi kutusu, one cikan yerler.
- Gebze Gundemi ve One cikan isletmeler kaldirildi.
- Admin: bildirimler okundu isaretlenir; uygulama 'tumunu oku' sadece gorunenleri isaretler; safeNextPath kontrol karakterlerini reddeder.
 17 files changed, 417 insertions(+), 786 deletions(-)
## 2026-09-11 04:38 — `e7478c0`
**feat(yakinimda): header yok (tam ekran harita), ornek veri yazilari kaldirildi, modern kartlar**
- Yakinimda sayfasinda ust bar kaldirildi; harita alani tam ekran (centik payi korunur).
- 'Ornek veri' rozet ve uyarilari kaldirildi (Yakinimda, nobetci eczane listesi, eczane nobet gunleri).
- Isletme/yer kartlari: golge ve kenarlik yok, buyuk koseler, yuvarlak butonlar.
- Alt menunun arkasindaki sarimsi arka plan gecisi kaldirildi.
 8 files changed, 30 insertions(+), 35 deletions(-)
## 2026-09-11 04:45 — `ed02d01`
**feat(anasayfa): Nobetci Eczane karti gorselli (kirmizi arti)**
 2 files changed, 4 insertions(+), 4 deletions(-)
## 2026-09-11 04:48 — `25b0d1a`
**feat(anasayfa): kategori kartlari %20 kucuk**
 1 file changed, 2 insertions(+), 2 deletions(-)
## 2026-09-11 05:03 — `8f78733`
**feat(anasayfa): yapay zeka karti + hizli kartlar, 4'lu kategoriler, haberler (sekmeli), acil durum sayfasi**
- Slider, Sehir Rehberi, 'Kategoriler' yazisi ve One cikan yerler kaldirildi.
- Baslik uzadi ('Gebze'yi kesfet, aradigini hemen bul'), biraz kucuk ve kalin; header 5px asagi; profil ikonu gorunur.
- Solda genis yapay zeka karti, saginda Nobetci Eczane, Durak, Sehir Rehberi, Acil Durum.
- Kategoriler satirda 4 (Cami, Firmalar, Magaza eklendi).
- Haberler: Gundem/Siyaset/Belediye/Spor/Etkinlik/Duyuru sekmeleri, buyuk kartlar (Siyaset kategorisi eklendi).
- /acil-durum: 112 ve ariza hatlari, tek dokunusla arama.
 9 files changed, 223 insertions(+), 154 deletions(-)
## 2026-09-11 05:09 — `9782c62`
**feat(yakinimda): Taksi sekmesi - taksi duraklari haritada (OSM), ana sayfa Taksi karti buraya acilir**
- poi.kind 'taxi' (migration 2026091260) ve scripts/db/seed-taxi.mjs (OSM amenity=taxi, 10 durak).
- Sari taksi pin ve kart; kart Google Haritalar'da acilir.
 9 files changed, 112 insertions(+), 5 deletions(-)
## 2026-09-11 05:18 — `6572d46`
**feat(anasayfa): GebzemAI karti, Taksi hizli kartta, yeni kategoriler (Saglik, Dugun, Egitim), alt menu hep gorunur**
- GebzemAI karti sade beyaz, ikon + isim.
- Hizli kartlar: Nobetci Eczane (haritada acilir), Durak, Sehir Rehberi, Taksi; Acil Durum kaldirildi.
- Kategoriler: Yemek, Restoran, Kafe, Hizmetler, Otel, Ikinci El, Is Ilani, Saglik, Dugun, Egitim (yeni isletme turleri + liste sayfalari, migration 2026091270).
- Gezilecek Yerler haberlerden once; aciklama kutulari daha az yuvarlak.
- Alt menu alttan 20px, kaydirinca kaybolmaz.
 8 files changed, 180 insertions(+), 41 deletions(-)
## 2026-09-11 05:21 — `9d35f9d`
**feat(nav): alt menu Anasayfa, Kesfet (harita), Arama, Bildirim, Profil; dolgusuz, buyuk ve kalin ikonlar**
 2 files changed, 32 insertions(+), 26 deletions(-)
## 2026-09-11 06:12 — `00b58db`
**UI batch: firm tabs, reviews, room sheet, own news, ATM, sheet search, subcategory chips**
- Firm detail: Genel / Menü|Odalar|Hizmetler / Yorumlar / Etkinlikler tabs, hero 100px shorter,
  blurred round arrow buttons, address card opens directions, room detail bottom sheet,
  user reviews (write / edit / delete) via submit_business_review RPC
- Own news articles (news_articles table): /haberler/[slug] detail, shown first on home and /haberler,
  admin editor at /admin/haber-yazilari
- Keşfet: ATM kind (11 OSM ATMs), İşletmeler chip removed, search bar in the sheet
  (Turkish-insensitive, filters list and pins), selected chip centered
- Services: "Usta mı arıyorsun" screen removed, /hizmetler opens stepper step 1 directly
- Category lists: sub-category chips (Döner, Kebap, ...) instead of Tümü/Şimdi açık/Yakınımda,
  cards 20% shorter, Sağlık in two columns; demo businesses for Sağlık, Düğün, Eğitim
- Bottom nav full-width solid bar, profile header one row, business card no longer jumps on load,
  wizard back button uses the blurred arrow style
 62 files changed, 3356 insertions(+), 760 deletions(-)
## 2026-09-11 06:40 — `0a8895f`
**Forward /admin on the public app to the admin site**
gbzsehir.vercel.app/admin/* now redirects (307) to gbzsehir-admin.vercel.app with the same path and query instead of a 404. Admin authorization is unchanged (requireAdmin + RLS); nothing in the app links to it.
 2 files changed, 8 insertions(+), 5 deletions(-)
## 2026-09-11 07:47 — `aa70e40`
**DB gap fixes group 1: place corrections, reports, settings, account delete, security, analytics throttle**
- 'Bilgi hatalı mı? Bildir' works again via submit_contact_message (new bilgi_duzeltme topic), guest IP throttle + global cap
- Reports: submit_report RPC (login, target check, daily cap, one open report per target), admin notes moved to admin-only report_notes, 'Şikayet et' on reviews
- Settings: push on/off, marketing consent switch with timestamp, sign-out removes the push subscription
- Account delete: server action, removes events and files after the RPC succeeds, audit phones masked
- Security pack: admin RPCs not executable by anon, business applications switch enforced in apply_business, listing daily/active caps, public_profiles limited
- Analytics/installs/contact counters throttled per IP hash (cf-connecting-ip), view/call counts once per viewer per day
 25 files changed, 1523 insertions(+), 129 deletions(-)
## 2026-09-11 08:29 — `ab67147`
**DB gap fixes groups 2+3: atomic saves, ban, OTP switch, private request photos, listing purge, legal texts, duty mode, demo labels, sources**
- Business photos, service scope and listing media saved in one transaction (set_* RPCs)
- 'Engelli' users: auth ban + all public content hidden; checks in leads, reviews, events, support, reports
- OTP: demo banner driven by the DB setting, SMS hook accepts only +905 numbers, go-live SQL prepared (not applied), Turnstile ready behind env key
- Service request photos moved to a private bucket, served via signed URLs to customer, matched firms and admin
- Deleted listings purged after 30 days (pg_cron -> /api/cron/purge-listings, shared cron-auth helper)
- Legal texts (KVKK, açık rıza, koşullar, gizlilik, çerez) as versioned drafts with an admin editor; accepted KVKK version stored
- Nöbetçi eczane: duty_data_mode (demo/off/live) drives RPCs and UI, demo list labelled everywhere
- Demo businesses, listings and events labelled, not callable, left out of JSON-LD; demo dates refreshed
- /kaynaklar lists every data source and licence
 84 files changed, 3834 insertions(+), 292 deletions(-)
## 2026-09-11 09:00 — `d6da510`
**DB gap fixes group 4: settings + support contact, demo cleanup v2, admin audit log, service category CRUD, finance receipts, POI editor**
- Placeholder support phone/e-mail treated as unset and hidden; admin edits listing caps, audit retention; max_providers falls back to the setting
- Demo cleanup covers news articles, demo events/finance, demo storage files, stops the demo duty job; optional demo admin removal
- Admin actions audited by triggers; new /admin/denetim page with filters
- Service categories: create, edit, delete (refused when in use)
- Finance: category rename/recolour/delete, receipts in private storage with signed links
- Every POI kind editable (phone incl. 444 numbers, address, location), hide + lock against re-sync; 'Yeri düzenle' from place corrections
 38 files changed, 3477 insertions(+), 346 deletions(-)
## 2026-09-11 09:36 — `8375c22`
**DB gap fixes group 5: request re-dispatch, push retry, location sync, sitemap + search, news cron, manual duty entry, listing filters**
- Service requests: second wave after 6 h (pg_cron), stalled/expired notices, 'Yakında' for services without firms
- Push: claim + retry up to 3 times with errors stored, 10-minute safety-net cron, opt-in cards on listing done and business panel
- Signed-in users get their profile neighbourhood on a new device
- Sitemap: firms, services, POIs, listings, events (demo and hidden rows excluded); global search finds events and articles
- News feeds fetched by cron every 20 minutes with failure tracking and admin 'Şimdi çek'
- Nöbet listesi: admin manual entry (/admin/nobet), import runs log, NosyAPI adapter behind NOSYAPI_KEY, live-mode morning check
- Listing category fields can be marked filterable and become URL filters on /ilanlar
 51 files changed, 3247 insertions(+), 274 deletions(-)
## 2026-09-11 10:41 — `b9854f6`
**DB gap fixes group 6 + admin without service key: panel page views, admin vocabularies, monthly POI sync**
- Business panel shows real /firma and /menu page views (7/30 days, owner sessions excluded)
- Keşfet sub-category chips, amenities and event categories are admin-managed (/admin/sozlukler), seeded from the old constants, with a built-in fallback
- Monthly POI re-sync (pg_cron -> /api/cron/poi-sync): missing rows hidden unless locked, run log, admin preview / sync now
- Admin site no longer needs SUPABASE_SERVICE_ROLE_KEY: news sources via admin RPC, 'Şimdi çek' and POI sync queued through pg_net to the public app, ban/unban in one DB transaction (profile status, auth ban, sessions closed), demo storage cleanup via admin storage policies
 48 files changed, 3808 insertions(+), 348 deletions(-)
## 2026-09-11 11:42 — `88270d2`
**Final polish: DB hygiene, admin refresh warnings, legal hosting fix, news/place vocabularies, admin and public follow-ups**
- Private helper functions no longer executable by PUBLIC/anon; banned firm's phone hidden in the customer's request view; active-listing cap also on status changes and renewals; direct owner writes to photo/scope/media tables closed (RPCs only)
- Admin actions warn when the public app could not be refreshed
- Legal texts v0.2: data is hosted in Tokyo, Japan (Supabase ap-northeast-1, Vercel hnd1), not the EU
- News article and place categories are admin-managed vocabularies
- Admin: request re-dispatch hours setting, audit labels for new actions, KVKK version on user detail, receipt column in the finance CSV
- Public: stalled state in Taleplerim, neutral services copy, server notifications use the retrying push path, dead code removed, docs updated
 48 files changed, 1757 insertions(+), 516 deletions(-)
## 2026-09-11 12:02 — `b86401a`
**Last mile: admin-added news/place categories end to end, legal sitemap dates, category dialog warnings, neutral provider copy**
- Admin news and place dialogs list the vocabulary categories; public pages show admin labels and icons, unknown valid place keys are kept
- Each /yasal URL appears once in the sitemap with its legal_texts publish date
- Service category delete/deactivate shows the 'public app not refreshed' warning
- No hardcoded '5 firma' in the services copy
 27 files changed, 213 insertions(+), 111 deletions(-)
## 2026-09-11 14:05 — `cff2197`
**Admin site: phone + password sign-in at /admin, account page with password change**
- Guests opening /admin/* on the admin site see a phone + password form at the same address (proxy rewrite to /giris/yonetim); only admin accounts get in, others are signed out with a message
- New /admin/hesap page (Hesabım ve şifre) to change the password; sign-out returns to the form
- The SMS code login stays available as a fallback link
 10 files changed, 340 insertions(+), 10 deletions(-)
## 2026-09-11 14:45 — `a468479`
**Home: photo tile for Yemek (yemek.webp, checkerboard removed)**
 2 files changed, 1 insertion(+), 1 deletion(-)
## 2026-09-11 14:52 — `4018eeb`
**Home news cards: no hydration error from cached relative times**
The home HTML is cached (ISR), so the server's 'x saat önce' can differ from the client's and React threw error 418. The time text now suppresses the hydration warning, like the shared RelativeTime component.
 1 file changed, 4 insertions(+), 1 deletion(-)
## 2026-09-11 15:32 — `f61cbe4`
**Owner list: separate İkinci El and İş İlanları pages, step-by-step signup and help, profile headers, taxi phones, home header fix**
- İkinci El (/ilanlar) and İş İlanları (/is-ilanlari) are separate pages in the /kesfet style, redesigned detail pages, no shadows/borders; job ads only for approved businesses (no 'İlan ver' for normal users there)
- Signup: phone -> code -> 'Adın ne?' (one field, surname upper case) -> round grey photo picker; neighbourhood step removed
- Profile sub pages use the Profil header; Ayarlar without 'Ana ekrana ekle'; Profil without 'Reklam ve iş birliği' and 'Yasal metinler'
- Yardım ve destek as steps: Konu seç, Mesajın, İletişim, Gönder; legal links in its footer
- Taxi stands: 11 verified phone numbers (17 stands), calm no-phone row with 'Bildir'; red 'Usta mı arıyorsun?'
- Home header rendered by the home page, fixing React hydration error 418 on the cached home HTML
 69 files changed, 2687 insertions(+), 1263 deletions(-)
## 2026-09-11 16:06 — `d3bf2ac`
**Sağlık single-column cards, borderless working hours, modern job ad detail**
- Sağlık list uses the same one-column photo cards as the other categories.
- Working hours table: no ring or shadow; today is a soft purple row.
- Job ad detail: logo notch hero, salary pill, fact chips, benefits grid,
  structured description with "Devamını oku", employer card with other ads,
  one "Başvurmadan önce" card and a heart + call bottom bar.
 9 files changed, 588 insertions(+), 102 deletions(-)
## 2026-09-11 21:09 — `1c9eb03`
**Big batch: Kocaeli-ready guide, events for everyone, business rules, listing stats/video, security fixes, GebzemAI**
- Bugs: detail-page header flash (matching skeletons), service requests dispatched instantly
  with push delivery for late subscribers, vacation mode shown everywhere.
- Security: demo OTP limited to the demo range, push endpoint allowlist, review/upload/contact
  caps, fresh code for account deletion, error and not-found pages, CSP headers.
- UI: flat full-width bottom nav and a shared bottom dock, bigger toasts, modern report sheet,
  mark-all-read, new onboarding, border/shadow cleanup.
- Business: modern apply flow with per-type features, one business per account (support for
  more), locked type, step-by-step edit, hotel QR menu, profile strength task list.
- Listings: wizard and detail icons, owner stats page, one video per listing (Cloudflare R2).
- Events: users and businesses create events (user events reviewed), category-style list,
  minimal detail with calendar export, home tile and rail.
- Search page with categories, popular searches and places; city guide hub, institution
  pages, doctors for health businesses; GebzemAI chat (OpenAI, off until enabled).
- Handoff docs (docs/PROJE-DURUMU.md, OTURUM.md), dev helper scripts.
 329 files changed, 31094 insertions(+), 2973 deletions(-)
## 2026-09-11 21:15 — `9c9a164`
**Home guide tile opens /rehber; imported city-guide places are hidden, not deleted, in admin**
 5 files changed, 14 insertions(+), 7 deletions(-)
## 2026-09-11 21:18 — `9a7e593`
**Handoff docs: architecture tree, deploy state**
 2 files changed, 905 insertions(+), 3 deletions(-)
## 2026-09-11 21:46 — `5f9c63b`
**Service worker v5: installed apps drop old cached pages and offer the new version**
 1 file changed, 1 insertion(+), 1 deletion(-)
## 2026-09-11 21:59 — `759382c`
**Google Maps everywhere (tap-to-load), admin doctors and vocabularies, Kocaeli districts layer**
- Maps: every MapLibre/OpenFreeMap map replaced with Google Maps. List maps load on "Harita",
  detail pages show a light preview card that loads the map on "Haritada göster"; directions
  open Google Maps. Calm fallback without a key. CSP report-only updated for Google hosts.
- Admin: institution categories and doctor branches in Sözlükler; add/edit/hide/delete doctors
  of health businesses with required consent.
- Kocaeli phase A (database, live): districts table and boundaries, district_id on core tables,
  service districts, dispatch district priority with a distance-capped fallback.
 44 files changed, 4265 insertions(+), 792 deletions(-)
## 2026-09-11 23:44 — `6fc64e1`
**Owner list wave 1: radius system, no demo labels, portrait lock, map polish, guide list, minimal news/places, doctor profiles, cinema; Kocaeli data import scripts**
- Design: one radius family for cards, inputs, tiles and sheets; demo labels removed (demo
  records hide the call button; the on-duty pharmacy notice stays for safety); portrait lock
  with a phone landscape notice.
- Maps: map-first pages load Google Maps directly; Google POIs hidden; round pins.
- City guide as a minimal list; categories open the map with pins and a bottom sheet.
- News shows only our articles; minimal news detail and "Tümü" pages.
- Doctor profile pages (/doktor/[slug]) and minimal doctor cards.
- Gebze Center cinema section and /sinema with a daily cron import.
- Kocaeli: KBB open data + GTFS stops/routes importer, 3,846-record guide importer (both run
  live), district boundaries seed, guide categories; place photo apply script.
 102 files changed, 8104 insertions(+), 1262 deletions(-)
## 2026-09-12 00:45 — `ea584ca`
**Owner list wave 2a: back-navigation jank fix, search covers the city guide and doctors, CC photo attribution kept on admin save**
- Home and back navigation: vaul drawer no longer forces a full style recalc; home news section drops the RSS fetch
- Search: institution, ATM, bank, fuel, EV charging and doctor groups (migration 2026091385); place results use the 1024 px thumb
- Audit log: doctors and doctor branches, news/place/institution category changes
- Admin places: saving keeps every Commons attribution key and the thumb of new uploads; guide-synced rows cannot be deleted
- One radius family on home rails, cinema cards and the offline page; landscape lock component removed (manifest keeps portrait)
 65 files changed, 805 insertions(+), 262 deletions(-)
## 2026-09-12 01:52 — `1574a19`
**Kocaeli phase B: mahalle leaves the app (district picker everywhere), Kocaeli-wide copy, GebzemAI doctor / bus line / web search tools**
- Shared DistrictPicker and a district in the location store; onboarding, profile, service request wizard, business
  apply / edit / service districts, listings (?ilce=), events, announcements (district targeting), nearby / guide /
  duty / search and admin screens use the district; cards show the district name instead of "X Mah."
- Writes send district_id / p_district_id / p_district_ids; the zz_fill_district trigger fills the district from a pin
- The unused NeighbourhoodPicker and neighbourhoods loader are removed (the DB tables stay until phase C)
- Scope copy says Kocaeli (titles, descriptions, JSON-LD areaServed, hero, onboarding); Kaynaklar lists the KBB data
- GebzemAI: Kocaeli scope, app data first; new tools doktor_bul, otobus_hatlari (geometric GTFS links, no timetable)
  and internet_ara (OpenAI web search only when the app has nothing; its cost is added to the daily budget); every
  tool takes an optional ilce
- supabase/migrations/2026091386_districts_phase_b.sql: district counts for the admin user overview and data health
  (dry-run OK, not applied yet)
 192 files changed, 2801 insertions(+), 1684 deletions(-)
## 2026-09-12 01:57 — `d4866f5`
**Docs: project status for 12 September (phase B live, GebzemAI tools, pending owner decisions)**
 1 file changed, 34 insertions(+), 31 deletions(-)

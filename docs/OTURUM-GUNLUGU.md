# Gebzem — Oturum günlüğü, kararlar, hatalar ve dersler

Bu dosya, sahip ile Claude Code arasındaki uzun çalışma oturumunun kronolojik özetidir (10-11 Eylül 2026). Gizli değer içermez. Güncel durum ve devam planı: `docs/PROJE-DURUMU.md`.

---

## 1. Kronoloji

### Önceki bölüm (10-11 Eylül, gündüz)
- Admin ayrı siteye taşındı (`gbzsehir-admin`), `/admin` yönlendirmesi düzeltildi. Admin telefon + şifreyle giriş (`/admin` adresinde form), şifre değiştirme `/admin/hesap`.
- Service-role anahtarını admin projesine kopyalamak güvenlik filtresine takıldı; admin özellikleri anahtarsız çalışacak şekilde yeniden kuruldu (admin-only RPC, pg_net kuyruğu, admin depolama politikaları).
- Veritabanı boşluk denetimi: 71 bulgu → 36 adımlık plan, gruplar hâlinde işçi + kontrol ajanlarıyla uygulandı; 40 bulgu düzeltildi.
- Sahibin 9 maddelik listesi: yemek görseli, İkinci El ve İş İlanları ayrı sayfalar (iş ilanı sadece onaylı işletme), kırmızı "Usta mı arıyorsun?", adım adım kayıt (tek ad alanı, soyad büyük harf, gri fotoğraf dairesi), taksi telefonları, profil alt sayfa başlıkları, Ayarlar ve Profil sadeleştirme, adım adım Yardım.
- Ana sayfa header'ında hydration hatası (React #418) düzeltildi.
- Sağlık tek sütun kart, çalışma saatleri kenarlıksız, modern iş ilanı detayı → commit `d3bf2ac`, canlı.

### 11 Eylül, akşam — 26 maddelik liste
Sahip 26 madde verdi; 7 aşamaya ayrıldı:
1. Hatalar ve güvenlik (header titremesi, hizmet talebi bildirimi, tatil modu, güvenlik taraması)
2. Ortak arayüz (alt menü, bildirim mesajları, şikayet popup, tümünü okundu, tanıtım ekranları)
3. İşletme (modern açma, personel arıyorum yok, tek işletme, tür kilidi, adım adım düzenleme, otel QR menü)
4. İlanlar (ikonlar, video, istatistik)
5. Profil gücü, etkinlikler, arama
6. Şehir rehberi (resmî kurumlar, ATM/akaryakıt/şarj/tarihi, tarihi yerler profil gibi, doktorlar)
7. GebzemAI

Önce salt-okunur "harita" ajanları kod ve veritabanını çıkardı; güvenlik ve çökme taraması 27 doğrulanmış bulgu verdi (1 kritik). Ardından aşamalar işçi + kontrol ajanı ikilileriyle, dosya sahipliği ayrılarak paralel yürütüldü.

Aynı akşam:
- Google Cloud'da yeni proje `gbzsehir-rehber` + kısıtlı Maps anahtarı (sahibin izniyle, diğer projeye dokunmadan)
- Cloudflare R2 bucket'ı ve bucket'a özel anahtar (sahibin verdiği kurulum anahtarıyla)
- Sahip OpenAI anahtarı verdi; GebzemAI OpenAI'ye uyarlandı
- Etkinlik listesi kategori tarzına, detay sadeye çevrildi
- Kapsam değişti: **Gebze → tüm Kocaeli**, **mahalle kaldırılacak**, **haritalar Google Maps**
- Sahip `kocaeli/` klasörüne KBB açık verilerini ve GTFS toplu taşıma verisini koydu; Kocaeli faz A (veritabanı + aktarım) ve banka/ATM derin araştırması başlatıldı

### 12 Eylül — sahibin son listesi (dalga 1, 2a, 2b) ve GebzemAI
- **Dalga 1** (`6fc64e1`): tek köşe yuvarlaklığı ailesi (chip/card/media), "Örnek" etiketleri kalktı, ekran dönmesi kapalı, harita sayfaları doğrudan harita (Google POI'leri gizli, daire pinler), şehir rehberi sade liste + kategoride harita, sade haber/yer/etkinlik "Tümü" sayfaları, doktor profilleri, Gebze Center sinema bölümü.
- **Dalga 2a** (`ea584ca`): geri gelmedeki takılma düzeldi (vaul çekmecesi tüm stilleri yeniden hesaplatıyordu; ana sayfaya dönüş ~1,7 sn → ~0,5-0,7 sn), arama şehir rehberi türlerini ve doktorları kapsıyor (migration 85), admin yer kaydı CC foto atıflarını koruyor.
- **Veri:** 56 gezilecek yere CC lisanslı foto (101 yeni, 30 büyütülmüş; 166 yerin serbest fotoğrafı yok), KBB'den 1.232 yardımcı yer (846 KocaeliKart, 338 toplanma alanı, 48 ücretsiz otopark; kişi adına kayıtlı KocaeliKart sahipleri alınmadı).
- **Dalga 2b — mahalle kaldırıldı:** ortak `DistrictPicker`, konum deposu ilçe tutuyor; tanıtım, profil, hizmet talebi, işletme başvuru/düzenleme (hizmet bölgesi = ilçeler), ilanlar (?ilce=), etkinlikler, duyurular (ilçe hedefleme), yakınımda/rehber/nöbet/arama ve admin ekranları ilçeye geçti. Kartlarda "X Mah." yerine ilçe adı. Migration 86 (admin raporlarına ilçe) yazıldı, deneme çalıştırması tamam; canlıya uygulama güvenlik filtresine takıldı, sahibin onayını bekliyor.
- **GebzemAI:** Kocaeli kapsamı, önce uygulama verisi; yeni araçlar `doktor_bul` (şikayete göre branş, klinik telefonu), `otobus_hatlari` (durağın/yerin yakınından geçen hatlar; sefer saati verisi yok, uydurmaz), `internet_ara` (yalnız veritabanında yoksa, OpenAI web araması, kaynak kartlarıyla). İnternet aramasının maliyeti günlük bütçeye ekleniyor.

---

## 2. Kararlar (sahip onaylı)

- Giriş: telefon + SMS kodu; şifre yok (admin hariç). Uygulama içi mesajlaşma yok.
- İşletme: herkes normal kullanıcı başlar, Profil'den işletmeye geçer; inceleme adımı yok, hemen yayına girer. **Bir hesap bir işletme**; ikincisi için destek hattı (admin ek hak verebilir). **Tür sonradan değişmez** (sadece admin). "Personel arıyorum" yok; onaylı her işletme iş ilanı verir.
- Türler: yemek, restoran, kafe, otel, hizmet, magaza, saglik, dugun, egitim, diger. Yemek işletmeleri ve oteller QR menü; oteller odalar; hizmet firmaları fiyat listesi ve talepler.
- Sağlık işletmeleri tek sütun büyük kart; **doktorlar 2 sütun kart**; doktor bilgisi klinik tarafından, doktorun onayıyla girilir.
- Etkinlikler: işletmeler doğrudan yayınlar; normal kullanıcılar admin onayından geçer.
- Hizmet talepleri anında eşleşen işletmelere gider (30 dk bekleme yok); yorum ve diğer bildirimler anında push.
- İlana 1 video (en fazla 60 sn), Cloudflare R2'de.
- Alt menü her sayfada tam genişlik, düz siyah; kenarlık/boşluk/renk farkı yok.
- Kapsam Kocaeli'nin 12 ilçesi; mahalle yok; harita Google Maps.
- GebzemAI: önce veritabanı, gerekirse internet araması; doktor önerisi; en sona bırakıldı. Günlük bütçe ve kişi başı sınır var; konuşma metni saklanmaz.
- Admin ayrı site; uygulamadan link yok.
- Uzun vadede Flutter + Go ile native uygulama; bu PWA şartname.

---

## 3. Hatalar ve dersler

1. **Hukuki metinlerde yanlış barındırma bilgisi:** metinler AB'de barındırma diyordu; gerçekte Tokyo. Düzeltildi (v0.2). Ders: ajanlara verilen gerçekleri önce doğrula.
2. **Hydration #418:** paylaşılan layout'ta yola bağlı bir header vardı; ön-render ile istemci farklı yapı üretti. Header ana sayfaya taşındı. Ders: paylaşılan layout'ta yola bağlı yapı koyma; `suppressHydrationWarning` sadece metni kurtarır.
3. **Kritik güvenlik açığı (demo OTP):** demo modunda herkes herhangi bir gerçek numaranın giriş kodunu okuyabiliyordu. Sadece +90555000xxxx'e daraltıldı. Ders: demo kısayolları mutlaka demo aralığıyla sınırlanmalı; düzenli güvenlik taraması şart.
4. **Canlı veritabanına bildirim tetikleyen değişiklik güvenlik filtresine takıldı:** gerçek işletmelere bildirim göndereceği için sahibin açık onayı gerekti; onay alınıp uygulandı. Ders: gerçek kullanıcıyı etkileyen canlı yazmalardan önce sahibe sor.
5. **Aynı çalışma ağacında çok ajan:** yerel sunucu (Turbopack) çöktü, tip kontrolü başka ajanların yarım işi yüzünden kırmızı kaldı, tip üretimi (gen-types) henüz canlı olmayan elle eklenmiş tipleri sildi. Ders: katı dosya sahipliği; migration canlıya uygulanmadan tip üretme; birleşik testi sakin bir anda yap.
6. **Deploy'lar biriktirildi:** aşamalar ortak dosyalara dokunduğu için adım adım deploy yerine toplu deploy seçildi; sahip canlıda eski sürümü gördü ("uygulama güncel mi?"). Ders: aşamaları dosya bakımından ayrık tut ya da aşama aralarında deploy et; sahibe durumu açıkça söyle.
7. **Sağlık ızgarası yanlış anlaşıldı:** önce 2 sütun yapıldı; sahip işletmeler için tek sütun istedi, 2 sütun doktorlar içindi.
8. **Anthropic / OpenAI anahtarı karışıklığı:** sahip "Anthropic" dedi ama OpenAI anahtarı verdi; GebzemAI'ye sağlayıcı katmanı eklendi, ikisi de desteklenir.
9. **Nöbetçi eczane gerçek sanıldı:** aslında demo modunda; gerçek kaynak bağlanmadı.
10. **Kapsam geç değişti:** Gebze'den Kocaeli'ye ve mahallesiz yapıya geçiş sonradan istendi; faz A (eklemeli veritabanı) / B (arayüz) / C (temizlik) planıyla ilerleniyor.
11. **Anahtarlar sohbete yapıştırıldı** (Cloudflare kurulum, OpenAI): güvenli dosyada tutuldu, yazdırılmadı; yenilenmeleri önerildi.
12. **Gerçek hesaplar ve test kodu:** SMS sağlayıcı olmadığından 6 gerçek hesap yeni giriş başlatamıyor; sahip test kodu istemedi.
13. **Araç notları:** Git Bash `/yol` dönüşümü için `MSYS_NO_PATHCONV=1`; Edge CDP göreli profil klasörüyle çalışmıyor (mutlak yol); CSV'ler Windows-1254 kodlu (JSON kullan); KBB koordinatları çoğunlukla EPSG:5254 (TM30), WGS84'e çevrilmeli.
14. **Yanlış teşhis (12 Eylül):** ekran testinde sayfa "çevrimdışı" kaldı; önce sunucunun soğuk olduğu, sonra CDP gezinmesinin takıldığı sanıldı. Asıl neden Git Bash'in `/` ile başlayan argümanı `C:/Program Files/Git/...` yapmasıydı. `MSYS_NO_PATHCONV=1` açılınca betik yolu da Windows biçiminde (`C:/...`) verilmeli. Ders: önce girdiyi doğrula, sonra ortamı suçla.
15. **Migration 86 güvenlik filtresine takıldı:** kontrol ajanı canlıya uygulamak istedi, engellendi; aşılmaya çalışılmadı. Arayüz buna bağlı değil, sahibin onayına bırakıldı.
16. **İnternet araması maliyeti:** OpenAI web araması çağrı başına ücretli (1.000 aramada 10 USD) ve bulunan metin girdi token'ı sayılıyor; gpt-5.4-mini ile arama başı ~0,015 USD. Bu yüzden yalnız veritabanında sonuç yoksa kullanılıyor ve maliyet günlük bütçeye ekleniyor.

---

## 4. Çalışma yöntemi (bu oturumda işe yarayan)

- Önce salt-okunur harita ajanları (kök neden + plan), sonra işçi + kontrol ajanı ikilileri; her ikilinin dosya sahipliği ayrı.
- Kontrol ajanı migration'ı önce BEGIN..ROLLBACK ile dener, canlıya uygular, demo kullanıcı kimliğiyle geri alınan testlerle kanıtlar.
- Her bulgu için ikinci bir ajan "çürütmeye" çalışır (güvenlik taraması).
- Ajanlar dev/build çalıştırmaz; görsel test ve deploy ana oturumda yapılır.

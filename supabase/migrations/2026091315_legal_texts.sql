-- Versioned legal texts (KVKK aydınlatma, açık rıza, kullanım koşulları, gizlilik, çerez) for /yasal/*, edited in the admin
-- site. The newest published version of a slug is live; a published version never changes (proof of what users accepted).
-- profiles.kvkk_version keeps the accepted KVKK version next to kvkk_accepted_at. Seeds v0.1 drafts that wait for legal
-- review (pending_review). Additive and re-runnable.

-- 1) Table ----------------------------------------------------------------------------------------------------------
create table if not exists public.legal_texts (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug in ('kvkk', 'acik-riza', 'kosullar', 'gizlilik', 'cerez')),
  version text not null check (version ~ '^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$'),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body_md text not null default '' check (char_length(body_md) <= 60000),
  pending_review boolean not null default true,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_texts_slug_version_key unique (slug, version)
);
create index if not exists legal_texts_live_idx on public.legal_texts (slug, published_at desc) where published_at is not null;

comment on table public.legal_texts is 'Versioned legal texts. Live = newest published_at <= now() per slug. Published rows are immutable (trigger).';
comment on column public.legal_texts.body_md is 'Plain text: blank lines split paragraphs, "## " heading lines, "- " list lines.';
comment on column public.legal_texts.pending_review is 'Show "Taslak - hukuki inceleme bekliyor" on the public page.';

drop trigger if exists set_updated_at on public.legal_texts;
create trigger set_updated_at before update on public.legal_texts for each row execute function private.set_updated_at();

-- 2) Guard: publishing is stamped with the server clock and the admin; a published version cannot be edited or deleted
--    (only its pending_review note and the on-delete-set-null user references may change).
create or replace function private.legal_texts_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_api boolean := current_user::text in ('authenticated', 'anon');
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception 'Yayınlanan sürüm silinemez' using errcode = '42501', hint = 'legal_published';
    end if;
    return old;
  end if;

  -- Provenance is not editable through the API (FK "set null" runs as the table owner).
  if tg_op = 'UPDATE' and v_api then
    new.created_by := old.created_by;
    new.published_by := old.published_by;
  end if;

  if tg_op = 'UPDATE' and old.published_at is not null then
    if new.slug is distinct from old.slug or new.version is distinct from old.version or new.title is distinct from old.title
       or new.body_md is distinct from old.body_md or new.published_at is distinct from old.published_at then
      raise exception 'Yayınlanan sürüm değiştirilemez; değişiklik için yeni sürüm oluştur' using errcode = '42501', hint = 'legal_published';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and v_api then
    new.created_by := auth.uid();
  end if;
  -- Insert or draft -> published. Scripts (owner) may set their own date.
  if v_api then
    if new.published_at is not null then
      new.published_at := now();
      new.published_by := auth.uid();
    else
      new.published_by := null;
    end if;
  end if;
  return new;
end $$;

revoke execute on function private.legal_texts_guard() from public, anon, authenticated;

drop trigger if exists legal_texts_guard on public.legal_texts;
create trigger legal_texts_guard before insert or update or delete on public.legal_texts
  for each row execute function private.legal_texts_guard();

-- 3) RLS: everyone reads published, due versions; admins read and write everything.
alter table public.legal_texts enable row level security;
drop policy if exists "public read" on public.legal_texts;
drop policy if exists "admin write" on public.legal_texts;
create policy "public read" on public.legal_texts for select to anon, authenticated
  using ((published_at is not null and published_at <= now()) or public.is_admin());
create policy "admin write" on public.legal_texts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Column grants: who created / published a version (admin profile ids) is not readable through the API.
revoke all on table public.legal_texts from anon, authenticated;
grant select (id, slug, version, title, body_md, pending_review, published_at, created_at, updated_at) on public.legal_texts to anon, authenticated;
grant insert, update, delete on public.legal_texts to authenticated;

-- 4) profiles.kvkk_version: the KVKK text version the user accepted at kvkk_accepted_at.
alter table public.profiles add column if not exists kvkk_version text;
comment on column public.profiles.kvkk_version is 'legal_texts version (slug kvkk) accepted at kvkk_accepted_at. Checked and stamped by trigger. Null for acceptances before versioned texts.';

-- Invoker trigger (same pattern as profiles_consent_at): for direct API writes an acceptance is stamped with the server time
-- and the live KVKK version (whatever the client sent); it cannot be erased through the API.
-- Scripts and our SECURITY DEFINER RPCs (owner) set both columns themselves.
create or replace function private.profiles_kvkk_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user::text not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.kvkk_accepted_at is not distinct from old.kvkk_accepted_at and new.kvkk_version is not distinct from old.kvkk_version then
      return new;
    end if;
    if new.kvkk_accepted_at is null then
      new.kvkk_accepted_at := old.kvkk_accepted_at;
      new.kvkk_version := old.kvkk_version;
      return new;
    end if;
  elsif new.kvkk_accepted_at is null then
    new.kvkk_version := null;
    return new;
  end if;

  new.kvkk_accepted_at := now();
  new.kvkk_version := (select t.version from public.legal_texts t
                        where t.slug = 'kvkk' and t.published_at is not null and t.published_at <= now()
                        order by t.published_at desc limit 1);
  return new;
end $$;

revoke execute on function private.profiles_kvkk_version() from public, anon, authenticated;

drop trigger if exists profiles_kvkk_version on public.profiles;
create trigger profiles_kvkk_version before insert or update of kvkk_accepted_at, kvkk_version on public.profiles
  for each row execute function private.profiles_kvkk_version();

-- 5) Seed: v0.1 drafts written for Gebzem, published so the pages are not empty, marked pending legal review.
--    Bracketed fields ([Şirket unvanı], [Adres], ...) are filled in by the owner; the approved text is published as a new version.
--    Bodies are dollar-quoted, so the surrounding line breaks are trimmed here (published rows cannot be updated later).
--    The kvkk/gizlilik hosting sentences below are the corrected (Tokyo) wording for fresh installs; databases seeded with the
--    earlier EU wording keep that frozen 0.1 and get the fix as 0.2 (2026091362).
insert into public.legal_texts (slug, version, title, body_md, pending_review, published_at)
select s.slug, s.version, s.title, btrim(s.body_md, E'\n'), s.pending_review, s.published_at
from (values
('kvkk', '0.1', 'KVKK Aydınlatma Metni', $kvkk$
Bu aydınlatma metni, Gebzem şehir uygulamasını (web sitesi ve ana ekrana eklenen uygulama sürümü dahil, birlikte "Gebzem") kullanırken kişisel verilerinin nasıl işlendiğini, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca açıklar.

## 1. Veri sorumlusu

Kişisel verilerin, veri sorumlusu sıfatıyla [Şirket unvanı] ("Gebzem" veya "biz") tarafından işlenir.
Adres: [Adres]
MERSİS No: [MERSİS No]
KEP / e-posta: [KEP/e-posta]

## 2. İşlenen kişisel veriler

- Kimlik ve iletişim: cep telefonu numaran (hesabın bu numarayla açılır ve doğrulanır), adın ve soyadın; isteğe bağlı olarak e-posta adresin ve profil fotoğrafın.
- Konum: profilinde seçtiğin mahalle. Konum izni verirsen cihazının bulduğu konum yaklaşık 100 metreye yuvarlanır, yalnızca cihazında saklanır ve sunucularımıza gönderilmez; sana yakın eczane, durak ve işletmeleri sıralamak için kullanılır. İşletme hesabı açarsan işletmenin haritadaki konumu da işlenir.
- Kullanıcı içerikleri: verdiğin 2. el ve iş ilanları (başlık, açıklama, fiyat, fotoğraflar, mahalle), hizmet talepleri (sorulara verdiğin cevaplar, mahalle, adres notu, tarih tercihi, not ve fotoğraflar), işletmeler hakkında yazdığın puan ve yorumlar, favorilerin, şikâyetlerin ve destek mesajların.
- İşletme bilgileri: işletme hesabı açarsan işletmenin adı, adresi, iletişim bilgileri, çalışma saatleri, fotoğrafları, menü, oda ve hizmet bilgileri, aldığın talepler ve verdiğin teklifler ile başvuru sırasında yüklediğin belgeler (örneğin vergi levhası). Belgeler herkese kapalı, ayrı bir depolama alanında tutulur.
- İşlem güvenliği: doğrulama kodu gönderim ve deneme kayıtları, oturum bilgileri, hesabında yapılan önemli işlemlerin kayıtları (denetim kaydı) ve kötüye kullanımı önlemek için IP adresinin geri döndürülemeyen özeti (hash).
- Kullanım verileri: görüntülediğin sayfaların adresi (arama ifadeleri ve adres parametreleri olmadan), görüntüleme süresi, cihaz türü, işletim sistemi, tarayıcı, bizi hangi siteden bulduğun (yalnızca alan adı), uygulamanın ana ekrana eklenip eklenmediği ve ilan ya da işletme sayfalarındaki "Ara", "Numarayı göster" gibi iletişim düğmelerine dokunma kayıtları. Bu ölçüm çerez kullanmaz.
- Bildirim verileri: bildirimlere izin verirsen tarayıcının anlık bildirim abonelik bilgileri (bildirim adresi, şifreleme anahtarları, tarayıcı bilgisi) ve sana gönderilen uygulama içi bildirimler.
- Pazarlama izni: kampanya ve duyuru iletileri için verdiğin ya da geri aldığın iznin durumu ve tarihi.
- Hukuki işlem: onayladığın metnin sürümü ve onay tarihi.

Gebzem'de ödeme alınmaz, kart bilgisi işlenmez. Özel nitelikli kişisel veri (sağlık, din, etnik köken gibi) istemeyiz; ilan, talep, yorum ve mesajlarına bu tür bilgiler yazmamanı rica ederiz.

## 3. İşleme amaçları

- Hesabını oluşturmak, telefon numaranı tek kullanımlık kodla doğrulamak ve oturumunu açık tutmak.
- İlan, hizmet talebi, işletme rehberi, favoriler, değerlendirme ve işletme paneli gibi özellikleri sunmak.
- Hizmet talebini kategorisine ve mahallene uygun işletmelere iletmek ve teklif sürecini yürütmek.
- İçerikleri denetlemek; kurallara aykırı içerik, sahte hesap ve dolandırıcılığı önlemek, şikâyetleri incelemek.
- Destek taleplerini yanıtlamak ve seninle iletişim kurmak.
- Uygulama içi ve anlık bildirim göndermek.
- İzin vermen halinde kampanya ve duyuru iletileri göndermek.
- Uygulamanın güvenliğini sağlamak, hataları gidermek, kullanımı istatistiklerle ölçüp geliştirmek.
- Hukuki yükümlülüklerimizi yerine getirmek ve yetkili kurumların taleplerini karşılamak.

## 4. Hukuki sebepler

Kişisel verilerin KVKK 5. maddesinin 2. fıkrasındaki şu sebeplere dayanılarak işlenir:
- Sözleşmenin kurulması ve ifası için gerekli olması (m.5/2-c): hesap, ilan, hizmet talebi, işletme paneli, bildirimler ve destek.
- Hukuki yükümlülüğümüzü yerine getirebilmemiz (m.5/2-ç): 5651 sayılı Kanun ve ilgili mevzuattaki kayıt ve bildirim yükümlülükleri, yetkili kurum talepleri.
- Bir hakkın tesisi, kullanılması veya korunması (m.5/2-e): şikâyet ve uyuşmazlıkların çözümü, onay kayıtları.
- Temel hak ve özgürlüklerine zarar vermemek kaydıyla meşru menfaatimiz (m.5/2-f): güvenlik, kötüye kullanımın önlenmesi, içerik denetimi ve kullanım istatistikleri.

Kampanya ve duyuru iletileri ise yalnızca açık rızana (m.5/1) ve 6563 sayılı Kanun kapsamındaki onayına dayanır. Bu izin isteğe bağlıdır; vermemen hiçbir özelliği kullanmana engel olmaz (bkz. Açık Rıza Metni).

## 5. Kişisel verilerin aktarıldığı taraflar

- İşletmeler: hizmet talebi gönderdiğinde talebin (kategori, cevaplar, mahalle, tarih, not ve fotoğraflar) talebine uygun işletmelere, talepte belirtilen sayıda (varsayılan en fazla 5) iletilir. Talebi kabul etmeden önce işletmeler adını yalnızca kısaltılmış olarak görür. Talebini kabul eden işletme ad soyadını, adres notunu ve "Numaram gizli kalsın" seçeneğini işaretlemediysen telefon numaranı görür.
- Diğer kullanıcılar: ilanların herkese açık yayımlanır; bir kullanıcı ilanında "Numarayı göster"e dokunduğunda telefon numaran ve kısaltılmış adın gösterilir. İşletmeler hakkındaki yorumların, puanın ve kısaltılmış adınla işletme sayfasında görünür.
- Hizmet sağlayıcılarımız (veri işleyenler): Supabase (veritabanı, kimlik doğrulama ve dosya depolama; Japonya'nın Tokyo bölgesindeki veri merkezleri), Vercel (uygulamanın barındırılması ve dünya genelindeki sunucular üzerinden sunulması; sunucu işlemleri Japonya'nın Tokyo bölgesindeki veri merkezlerinde çalışır), doğrulama kodu SMS'lerini gönderen [SMS sağlayıcısı], anlık bildirimleri cihazına ileten tarayıcı bildirim servisleri (Google, Apple, Mozilla, Microsoft) ve harita görüntülerini sunan OpenFreeMap. Harita görüntülenirken IP adresin ve tarayıcı bilgin harita sunucusuna iletilir.
- Yetkili kamu kurum ve kuruluşları ile yargı mercileri: kanunen yetkili oldukları hallerde ve talep etmeleri üzerine.

Yurt dışına aktarım: Supabase ve Vercel sunucuları Türkiye dışındadır. Kişisel verilerin Japonya'nın Tokyo bölgesindeki veri merkezlerinde saklanır ve işlenir; uygulama ayrıca Vercel'in dünya genelindeki sunucuları üzerinden sunulur. Bu aktarımlar KVKK 9. maddesi kapsamında, Kişisel Verileri Koruma Kurulu'na bildirilen standart sözleşmelere dayanır. [Hukuki inceleme: standart sözleşmelerin imzalanması ve Kurul'a bildirimi]

## 6. Toplama yöntemi

Kişisel verilerin; uygulamadaki formlar, fotoğraf ve belge yükleme alanları, cihaz izinleri (konum, bildirim, kamera ve galeri) ve kullanım sırasında otomatik yollarla (sayfa görüntüleme ölçümü, sunucu ve güvenlik kayıtları) elektronik ortamda toplanır.

## 7. Saklama süreleri

- Hesap ve profil verileri: hesabın açık kaldığı sürece. Hesabını Profil > Ayarlar > Hesabı sil ile sildiğinde profilin ve hesabına bağlı ilan, favori, bildirim ve benzeri içeriklerin silinir; işlem kayıtlarındaki ad ve telefon gibi kişisel değerler maskelenir.
- İlanlar: yayın süresi (varsayılan 30 gün) dolunca yayından kalkar; kaydı sen silene ya da hesabını silene kadar saklanır.
- Hizmet talepleri, teklifler ve yorumlar: hesabın açık kaldığı sürece.
- Kullanım istatistikleri: en fazla 180 gün; sonra otomatik silinir.
- Destek mesajları ve şikâyet kayıtları: [Saklama süresi].
- Güvenlik ve erişim kayıtları: ilgili mevzuatta öngörülen süre boyunca [Saklama süresi].

Süre dolduğunda veriler silinir, yok edilir ya da anonim hale getirilir.

## 8. Hakların

KVKK 11. maddesi uyarınca şu haklara sahipsin:
- Kişisel verilerinin işlenip işlenmediğini öğrenme.
- İşlenmişse buna ilişkin bilgi talep etme.
- İşlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme.
- Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme.
- Eksik veya yanlış işlenmişse düzeltilmesini isteme.
- KVKK 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme.
- Düzeltme, silme veya yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme.
- İşlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhine bir sonuç çıkmasına itiraz etme.
- Kanuna aykırı işleme nedeniyle zarara uğrarsan zararın giderilmesini talep etme.

## 9. Başvuru

Taleplerini Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak; [Adres] adresine yazılı olarak, [KEP/e-posta] adresine kayıtlı elektronik posta (KEP), güvenli elektronik imza veya mobil imza ile ya da sistemimizde kayıtlı e-posta adresinden iletebilirsin. Profil bilgilerini uygulamadan kendin düzeltebilir, hesabını Profil > Ayarlar > Hesabı sil ile kendin silebilirsin.

Başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır. İşlemin ayrıca bir maliyet gerektirmesi halinde Kurul'un belirlediği tarifedeki ücret alınabilir.

## 10. Değişiklikler

Bu metni güncelleyebiliriz. Her güncelleme yeni sürüm numarası ve yürürlük tarihiyle bu sayfada yayımlanır; önemli değişiklikleri uygulama içinden duyururuz. Kayıt sırasında onayladığın sürüm hesabında saklanır.
$kvkk$, true, now()),

('acik-riza', '0.1', 'Açık Rıza Metni', $riza$
Bu metin, [Şirket unvanı] ("Gebzem") tarafından isteğe bağlı olarak istenen açık rızanın kapsamını açıklar. Kişisel verilerinin işlenmesine ilişkin genel bilgiler KVKK Aydınlatma Metni'nde yer alır.

## Kampanya ve duyuru iletileri

Giriş ekranındaki "Kampanya ve duyuru bildirimleri almak istiyorum" kutusunu işaretlediğinde; adının, cep telefonu numaranın, varsa e-posta adresinin, seçtiğin mahallenin ve bildirim abonelik bilgilerinin, sana Gebze'deki kampanyalar, etkinlikler, yeni özellikler ve Gebzem duyuruları hakkında SMS, e-posta ve anlık bildirim yoluyla ticari elektronik ileti gönderilmesi amacıyla işlenmesine ve bu amaçla İleti Yönetim Sistemi'ne (İYS) kaydedilmesine; 6698 sayılı Kişisel Verilerin Korunması Kanunu 5. maddesinin 1. fıkrası uyarınca açık rıza, 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun kapsamında onay vermiş olursun.

Mahalle bilgin yalnızca iletileri bölgene uygun seçmek için kullanılır. İletiler için senin hakkında reklam profili oluşturulmaz ve verilerin reklam ağlarıyla paylaşılmaz.

## İsteğe bağlıdır

Bu rıza tamamen isteğe bağlıdır. Vermemen ya da geri alman; hesap açmana, ilan vermene, hizmet talebi göndermene ve Gebzem'in diğer özelliklerini kullanmana engel olmaz. Talep, ilan ve hesap güvenliği bildirimleri gibi hizmetin gereği olan iletiler bu izinden bağımsız olarak gönderilir.

## Rızanı geri alma

İznini dilediğin zaman, gerekçe göstermeden geri alabilirsin:
- Gelen SMS veya e-postadaki ret yolunu kullanarak.
- İYS üzerinden (iys.org.tr ya da e-Devlet).
- Profil > Yardım ve destek bölümünden bize yazarak.
- [KEP/e-posta] adresine başvurarak.

Anlık bildirimleri ayrıca cihazının ya da tarayıcının bildirim ayarlarından kapatabilirsin. Geri alma ileriye dönük sonuç doğurur. Onay ve ret kayıtların, ispat amacıyla ilgili mevzuatta öngörülen süre boyunca (onayın sona ermesinden itibaren üç yıl) saklanır.

## Veri sorumlusu

[Şirket unvanı]
Adres: [Adres]
MERSİS No: [MERSİS No]
KEP / e-posta: [KEP/e-posta]
$riza$, true, now()),

('kosullar', '0.1', 'Kullanım Koşulları', $kosul$
Bu Kullanım Koşulları ("Koşullar"), [Şirket unvanı] ("Gebzem" veya "biz") tarafından sunulan Gebzem şehir uygulamasının (web sitesi ve ana ekrana eklenen uygulama sürümü dahil) kullanımını düzenler. Gebzem'e telefon numaranla giriş yaparak bu Koşulları kabul etmiş olursun. Kabul etmiyorsan Gebzem'i kullanmamalısın.

## 1. Gebzem nedir?

Gebzem, Gebze'de yaşayanlar için bir şehir rehberidir: nöbetçi eczaneler, yakındaki cami, durak ve taksi durakları, gezilecek yerler, işletme rehberi ve dijital menüler, 2. el ve iş ilanları, usta ve hizmet talepleri, etkinlikler, haberler ve duyurular.

Gebzem, kullanıcıları işletmeler ve ilan verenlerle bir araya getiren aracı bir platformdur. İlan ve hizmet talepleri sonucunda kurulan anlaşmaların tarafı değildir; ödeme almaz, ürün veya hizmet satmaz ve sunulan ürün ya da hizmetin kalitesini, fiyatını veya sonucunu garanti etmez. Kullanıcıların oluşturduğu içerikler bakımından 5651 sayılı Kanun kapsamında yer sağlayıcıdır.

## 2. Hesap

- Hesap cep telefonu numaranla açılır; numaranı SMS ile gelen tek kullanımlık kodla doğrularsın. Bir numarayla tek hesap açılabilir.
- Gebzem'i kullanmak için 18 yaşını doldurmuş olmalısın. [Hukuki inceleme: yaş sınırı]
- Profil bilgilerin doğru olmalı; başkası adına ya da sahte bilgiyle hesap açamazsın.
- Hesabının ve telefonunun güvenliğinden sen sorumlusun. Doğrulama kodunu kimseyle paylaşma; Gebzem kodunu asla sormaz.
- Hesabını dilediğin zaman Profil > Ayarlar > Hesabı sil ile silebilirsin.

## 3. Kullanım kuralları

Gebzem'de şunları yapamazsın:
- Yasalara, genel ahlaka veya başkalarının haklarına aykırı; hakaret, tehdit, taciz, nefret söylemi ya da ayrımcılık içeren içerik paylaşmak.
- Satışı yasak ya da izne bağlı ürünleri (silah, uyuşturucu, reçeteli ilaç, sahte veya kaçak ürün gibi) ilana koymak.
- Yanıltıcı, sahte veya tekrarlanan ilan ya da talep oluşturmak, Gebzem'i dolandırıcılık amacıyla kullanmak.
- Başkalarının kişisel verilerini, fotoğraflarını veya iletişim bilgilerini izinsiz paylaşmak.
- Başkasına ait fotoğraf, marka veya metinleri izinsiz kullanmak.
- İstenmeyen reklam (spam) göndermek, sistemi otomatik araçlarla taramak, güvenliği aşmaya veya hizmeti aksatmaya çalışmak.

## 4. İlanlar

- İlandaki ürün ya da iş hakkında doğru bilgi vermekten sen sorumlusun. Fiyat ve fotoğraflar ilana konu ürünü veya işi yansıtmalıdır.
- İlanlar yayın süresi (varsayılan 30 gün) boyunca yayında kalır. İlk ilanların yayından önce incelenebilir.
- İlanında "Numarayı göster"e dokunan kullanıcılar telefon numaranı görebilir.
- Alışverişi karşı tarafla kendin yaparsın. Ürünü görmeden ödeme yapma, kapora gönderme; şüpheli durumları bize bildir.
- İş ilanları iş mevzuatına ve ayrımcılık yasağına uygun olmalıdır. [Hukuki inceleme: iş ilanlarına ilişkin mevzuat]

## 5. Hizmet talepleri

- Hizmet talebin, kategorisine ve mahallene uygun işletmelere iletilir (varsayılan en fazla 5 işletme). Talebi kabul eden işletmeler seninle iletişime geçebilir.
- "Numaram gizli kalsın" seçeneğiyle numaranı gizleyebilir, işletmeleri kendin arayabilirsin.
- Teklifler işletmelere aittir. İş, fiyat ve ödeme konusundaki anlaşma sen ile işletme arasında yapılır.

## 6. İşletme hesapları

- İşletme hesabı açan kişi, işletmeyi temsil yetkisi olduğunu ve verdiği bilgilerin (unvan, adres, iletişim, belgeler, fotoğraflar, fiyatlar, menü) doğru ve güncel olduğunu kabul eder.
- İşletme başvuruları incelenir; Gebzem bir başvuruyu reddedebilir.
- İşletmeler, talepler üzerinden eriştikleri müşteri bilgilerini yalnızca o talebi karşılamak için kullanabilir; başka amaçla kullanamaz, saklayamaz ve paylaşamaz. Bu bilgiler bakımından işletme ayrıca veri sorumlusudur.
- İşletme, sunduğu hizmetin mevzuata uygunluğundan (ruhsat, fatura, tüketici hakları) kendisi sorumludur.

## 7. Değerlendirmeler

- İşletmeler hakkındaki puan ve yorumlar gerçek bir deneyime dayanmalıdır. Kendi işletmen için yorum yazamaz, yorum karşılığında menfaat sağlayamazsın.
- Yorumlar kısaltılmış adınla herkese açık yayımlanır; işletmeler yorumlara cevap yazabilir.
- Kurallara aykırı yorumlar kaldırılabilir.

## 8. İçeriklerin

- Paylaştığın içeriklerin (metin, fotoğraf) hakları sende kalır. Gebzem'e bu içerikleri uygulamada yayımlamak, çoğaltmak, boyutlandırmak ve Gebzem'in tanıtımında göstermek için, içerik yayında kaldığı süreyle sınırlı, ücretsiz ve münhasır olmayan bir kullanım izni verirsin.
- Paylaştığın içeriğin başkalarının haklarını ihlal etmemesinden sen sorumlusun.

## 9. Moderasyon ve yaptırımlar

Gebzem, bu Koşullara veya yasalara aykırı olduğunu değerlendirdiği içerikleri yayından kaldırabilir, ilanları reddedebilir, hesapları geçici olarak kısıtlayabilir ya da kapatabilir. Aykırı içerikleri uygulamadaki "Şikayet et" seçeneğiyle bildirebilirsin. Yetkili makamların kararları yerine getirilir.

## 10. Bilgilerin doğruluğu

Nöbetçi eczane, ulaşım, cami, gezilecek yerler ve benzeri bilgiler kamuya açık kaynaklardan ve işletmelerden derlenir ve değişmiş olabilir. Özellikle acil durumlarda bilgiyi resmi kaynaktan doğrula; hayati tehlikede 112'yi ara. Veri kaynakları ve lisansları Kaynaklar sayfasında yer alır.

## 11. Fikri mülkiyet

Gebzem adı, logosu, tasarımı ve yazılımı [Şirket unvanı]'na aittir ve izinsiz kullanılamaz. Harita verileri © OpenStreetMap katkıcıları; açık veri kaynakları kendi lisanslarıyla kullanılır.

## 12. Sorumluluğun sınırı

Gebzem "olduğu gibi" sunulur; hizmetin kesintisiz ve hatasız olacağını garanti etmeyiz. Kasıt veya ağır ihmalimiz olmadıkça; kullanıcılar ve işletmeler arasındaki anlaşmalardan, ilan ve talep konusu ürün ve hizmetlerden ve kullanıcı içeriklerinden doğan zararlardan sorumlu değiliz. Tüketici mevzuatından doğan emredici hakların saklıdır.

## 13. Değişiklikler ve sona erme

Bu Koşulları güncelleyebiliriz. Yeni sürüm, sürüm numarası ve yürürlük tarihiyle bu sayfada yayımlanır; önemli değişiklikleri uygulama içinden duyururuz. Değişiklikten sonra Gebzem'i kullanmaya devam etmen yeni sürümü kabul ettiğin anlamına gelir. Hesabını dilediğin zaman silebilirsin; Koşullara aykırılık halinde hesabını kapatabiliriz.

## 14. Uygulanacak hukuk

Bu Koşullar Türkiye Cumhuriyeti hukukuna tabidir. Tüketici işlemlerinden doğan uyuşmazlıklarda, parasal sınırlar içinde tüketici hakem heyetleri ve tüketici mahkemeleri yetkilidir. Diğer uyuşmazlıklarda [Gebze] mahkemeleri ve icra daireleri yetkilidir.

## 15. İletişim

[Şirket unvanı]
Adres: [Adres]
MERSİS No: [MERSİS No]
KEP / e-posta: [KEP/e-posta]
Uygulama içinden: Profil > Yardım ve destek
$kosul$, true, now()),

('gizlilik', '0.1', 'Gizlilik Politikası', $gizlilik$
Bu politika, Gebzem'in hangi bilgileri neden topladığını, neleri toplamadığını ve verilerini nasıl koruduğunu sade bir dille özetler. Hukuki ayrıntılar KVKK Aydınlatma Metni'nde yer alır.

## Kısaca

- Verilerini satmayız, reklam ağlarıyla paylaşmayız.
- Reklam veya takip çerezi kullanmayız; kullanım ölçümümüz çerezsizdir.
- Konumun cihazında kalır, sunucularımıza gönderilmez.
- Yalnızca uygulamanın çalışması için gereken bilgileri isteriz.
- Hesabını istediğin zaman uygulamadan kendin silebilirsin.

## Topladığımız bilgiler

- Hesap: telefon numaran, adın ve soyadın, mahallen; isteğe bağlı e-posta adresin ve profil fotoğrafın.
- Paylaştıkların: ilanlar, hizmet talepleri ve fotoğrafları, yorumlar, favoriler, şikâyetler ve destek mesajları.
- İşletme hesabı açarsan: işletme bilgileri, fotoğraflar ve başvuru belgeleri.
- Bildirimler: bildirimlere izin verirsen tarayıcının bildirim abonelik bilgisi.
- Kullanım: hangi sayfaların ne kadar süre görüntülendiği, cihaz türü, işletim sistemi, tarayıcı ve yönlendiren sitenin alan adı. Sayfa adreslerindeki arama ifadelerini kaydetmeyiz.
- Güvenlik: kötüye kullanımı engellemek için IP adresinin geri döndürülemeyen özeti (hash) ve önemli işlemlerin kayıtları.

## Toplamadıklarımız

- Rehberin, mesajların, arama geçmişin ve diğer uygulamaların hakkında bilgi.
- Konumunun kendisi: konum izni verirsen konumun yaklaşık 100 metreye yuvarlanır ve yalnızca cihazında, yakındaki yerleri sıralamak için kullanılır.
- Ödeme ve kart bilgileri: Gebzem'de ödeme alınmaz.

## Kim neyi görür?

- Herkes: yayındaki ilanların, yorumların (kısaltılmış adınla) ve işletme sayfaları.
- İlanınla ilgilenen kullanıcılar: "Numarayı göster"e dokunduklarında telefon numaran ve kısaltılmış adın.
- İşletmeler: talebine uygun işletmeler hizmet talebini görür; talebini kabul eden işletme ayrıca ad soyadını, adres notunu ve "Numaram gizli kalsın" demediysen telefon numaranı görür.
- Gebzem ekibi: destek, içerik denetimi ve güvenlik için gerektiği kadarını görür; yönetim işlemleri kayıt altına alınır.

## Verilerin nerede ve nasıl korunur?

Veriler Türkiye dışında, Japonya'nın Tokyo bölgesindeki Supabase veri merkezlerinde saklanır; uygulamanın sunucu işlemleri de aynı bölgedeki Vercel altyapısında çalışır ve uygulama Vercel'in dünya genelindeki sunucuları üzerinden sunulur. Bağlantılar şifrelidir (HTTPS). Veritabanında satır düzeyinde erişim kuralları uygulanır; her kullanıcı yalnızca görmeye yetkili olduğu kayıtlara erişebilir. İşletme belgeleri herkese kapalı, ayrı bir alanda tutulur.

## Ne kadar süre saklarız?

- Hesap verilerini hesabın açık olduğu sürece saklarız.
- Kullanım istatistikleri en fazla 180 gün sonra otomatik silinir.
- Hesabını sildiğinde profilin ve hesabına bağlı içeriklerin silinir; yasal olarak saklamamız gereken kayıtlar, kişisel değerleri maskelenmiş olarak ilgili süre boyunca tutulur.

## Bildirimler

Anlık bildirimler yalnızca izin verirsen gönderilir; izni tarayıcı veya cihaz ayarlarından istediğin zaman kapatabilirsin. Kampanya ve duyuru iletileri ayrıca açık rızana bağlıdır (bkz. Açık Rıza Metni).

## Çocuklar

Gebzem 18 yaşından küçükler için tasarlanmamıştır; çocuklardan bilerek kişisel veri toplamayız.

## Değişiklikler ve iletişim

Bu politikayı güncellediğimizde yeni sürümü bu sayfada yayımlarız. Soruların için Profil > Yardım ve destek bölümünden ya da [KEP/e-posta] adresinden bize ulaşabilirsin.
[Şirket unvanı], [Adres]
$gizlilik$, true, now()),

('cerez', '0.1', 'Çerez Politikası', $cerez$
Bu politika, Gebzem'in tarayıcında hangi çerezleri ve benzeri teknolojileri kullandığını açıklar. Kısaca: yalnızca uygulamanın çalışması için zorunlu olanları kullanırız. Reklam, pazarlama veya üçüncü taraf takip çerezi kullanmayız.

## Çerez nedir?

Çerezler, ziyaret ettiğin sitenin tarayıcına kaydettiği küçük metin dosyalarıdır. Tarayıcının yerel depolama alanı (localStorage) ve uygulama önbelleği de benzer şekilde cihazında bilgi saklar; bu politikada hepsini birlikte anlatıyoruz.

## Kullandığımız çerezler

- Oturum çerezleri (sb-...-auth-token): giriş yaptığında oturumunu açık tutar ve isteklerin sana ait olduğunu doğrular. Supabase kimlik doğrulama altyapısına aittir; oturumun açık kaldıkça yenilenir, çıkış yaptığında silinir.
- İşletme seçimi çerezi (gbz_biz): birden fazla işletmen varsa işletme panelinde hangisini yönettiğini hatırlar. Yalnızca işletme sahiplerinde oluşur, 1 yıl saklanır ve sayfadaki komut dosyalarıyla okunamaz.

Bu çerezler hizmetin sunulması için zorunludur; bu nedenle ayrıca izin istenmez.

## Tarayıcında sakladığımız diğer bilgiler

- Tema tercihin (açık ya da koyu).
- Tanıtım ekranlarını ve ipuçlarını gördüğün, ziyaret sayın ve ana ekrana ekleme önerisini kapattığın (öneriyi doğru zamanda göstermek için).
- Seçtiğin mahalle ve izin verdiysen yaklaşık konumun (yaklaşık 100 metreye yuvarlanır, sunucuya gönderilmez).
- Giriş ekranında işaretlediğin kampanya izni (profilini tamamlayana kadar, geçici olarak).
- Yarım kalan form taslakları (örneğin hizmet talebi).
- Kullanım ölçümü için rastgele bir oturum kimliği: 30 dakika hareketsizlikten sonra yenilenir.
- Uygulamanın hızlı açılması ve bağlantın yokken çalışabilmesi için bazı sayfa ve dosyaların önbellek kopyaları (service worker).

## Üçüncü taraf içerikler

Haritalar OpenFreeMap sunucularından yüklenir; harita görüntülenirken bu sunucular IP adresini ve tarayıcı bilgini görebilir. Gebzem sayfalarında reklam, sosyal medya eklentisi veya üçüncü taraf analiz aracı bulunmaz.

## Nasıl yönetebilirsin?

Çerezleri ve site verilerini tarayıcı ayarlarından görebilir ve silebilirsin. Oturum çerezlerini silersen oturumun kapanır; yerel verileri silersen tercihlerin ve taslakların sıfırlanır. Zorunlu çerezleri engellersen giriş gerektiren özellikler çalışmaz.

## Değişiklikler ve iletişim

Yeni bir çerez veya benzeri teknoloji kullanmaya başlarsak bu politikayı güncelleriz; zorunlu olmayan bir çerez için önce iznini isteriz. Soruların için: [KEP/e-posta]
[Şirket unvanı], [Adres]
$cerez$, true, now())
) as s (slug, version, title, body_md, pending_review, published_at)
where true
on conflict (slug, version) do nothing;

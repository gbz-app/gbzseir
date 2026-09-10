/**
 * Turkish labels and badge tones for every status/enum the admin panel shows (pure TS).
 */

export type Tone = "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "outline";
export type LabelMap = Record<string, { label: string; tone: Tone }>;

/** Label of a value from a map (falls back to the raw value). */
export function labelOf(map: LabelMap, value: string | null | undefined): string {
  if (!value) return "";
  return map[value]?.label ?? value;
}

export const LISTING_STATUS: LabelMap = {
  draft: { label: "Taslak", tone: "secondary" },
  pending_review: { label: "Onay bekliyor", tone: "warning" },
  active: { label: "Yayında", tone: "success" },
  rejected: { label: "Reddedildi", tone: "destructive" },
  expired: { label: "Süresi doldu", tone: "secondary" },
  sold: { label: "Satıldı", tone: "info" },
  filled: { label: "Pozisyon doldu", tone: "info" },
  paused: { label: "Durduruldu", tone: "secondary" },
  deleted: { label: "Silindi", tone: "outline" },
};

export const LISTING_TYPE: LabelMap = {
  classified: { label: "2. el", tone: "secondary" },
  job: { label: "İş ilanı", tone: "info" },
};

/** Moderation flags set by the DB trigger (private.listing_flags). */
export const LISTING_FLAGS: Record<string, { label: string; description: string }> = {
  iban: { label: "IBAN", description: "Metinde IBAN numarası var." },
  odeme: { label: "Kapora / ön ödeme", description: "Kapora, ön ödeme ya da kargo ile ödeme ifadesi var." },
  telefon: { label: "Telefon", description: "Açıklamada telefon numarası yazılmış." },
  url: { label: "Bağlantı", description: "Metinde web adresi / bağlantı var." },
  emlak_vasita: { label: "Emlak / vasıta", description: "Yasaklı kategoriye (emlak, vasıta) benziyor." },
  ayrimcilik: { label: "Ayrımcı ifade", description: "Cinsiyet ya da yaş sınırı gibi ayrımcı ifade var." },
};

export const LISTING_REJECT_REASONS = [
  "Yasaklı kategori",
  "Yanıltıcı içerik",
  "Eksik bilgi",
  "Dolandırıcılık şüphesi",
  "Diğer",
] as const;

export const BUSINESS_STATUS: LabelMap = {
  pending: { label: "Başvuru bekliyor", tone: "warning" },
  approved: { label: "Onaylı", tone: "success" },
  rejected: { label: "Reddedildi", tone: "destructive" },
  suspended: { label: "Askıda", tone: "outline" },
};

export const BUSINESS_KINDS: Record<string, string> = {
  service: "Hizmet veren",
  shop: "Mağaza",
  employer: "İşveren",
};

export const BUSINESS_DOC_KINDS: Record<string, string> = {
  vergi_levhasi: "Vergi levhası",
  kimlik: "Kimlik",
  meslek_belgesi: "Meslek belgesi",
  diger: "Diğer belge",
};

export const BUSINESS_REJECT_REASONS = [
  "Eksik bilgi",
  "Belgeler doğrulanamadı",
  "Telefon numarasına ulaşılamadı",
  "Yasaklı faaliyet alanı",
  "Diğer",
] as const;

export const VERIFICATION_LEVELS: Array<{ value: number; label: string; description: string }> = [
  { value: 0, label: "0 - Doğrulanmadı", description: "Rozet gösterilmez." },
  { value: 1, label: "1 - Onaylı", description: "Başvuru onaylandı; 'Onaylı' rozeti." },
  { value: 2, label: "2 - Belgeli", description: "Vergi levhası / belgeler kontrol edildi." },
  { value: 3, label: "3 - Yerinde doğrulandı", description: "Adres ve kimlik yerinde doğrulandı." },
];

export const REPORT_STATUS: LabelMap = {
  open: { label: "Açık", tone: "warning" },
  resolved: { label: "Çözüldü", tone: "success" },
  dismissed: { label: "Yoksayıldı", tone: "secondary" },
};

export const REPORT_REASONS: Record<string, string> = {
  dolandiricilik: "Dolandırıcılık",
  yanlis_kategori: "Yanlış kategori",
  uygunsuz: "Uygunsuz içerik",
  yaniltici: "Yanıltıcı bilgi",
  diger: "Diğer",
};

export const REPORT_TARGETS: Record<string, string> = {
  listing: "İlan",
  business: "İşletme",
  review: "Yorum",
  user: "Kullanıcı",
};

export const REQUEST_STATUS: LabelMap = {
  admin_review: { label: "İnceleme bekliyor", tone: "warning" },
  open: { label: "Açık", tone: "info" },
  filled: { label: "Kontenjan doldu", tone: "success" },
  closed_hired: { label: "Anlaşıldı", tone: "success" },
  closed_cancelled: { label: "İptal edildi", tone: "secondary" },
  expired: { label: "Süresi doldu", tone: "secondary" },
  no_match: { label: "Eşleşme yok", tone: "destructive" },
};

export const WHEN_TYPES: Record<string, string> = {
  acil: "Acil",
  bu_hafta: "Bu hafta",
  tarih: "Belirli bir tarihte",
  esnek: "Esnek",
};

export const LEAD_STATUS: LabelMap = {
  sent: { label: "Gönderildi", tone: "secondary" },
  seen: { label: "Görüldü", tone: "info" },
  accepted: { label: "Kabul etti", tone: "success" },
  declined: { label: "Reddetti", tone: "destructive" },
  closed_full: { label: "Kontenjan doldu", tone: "outline" },
  removed_by_customer: { label: "Müşteri kaldırdı", tone: "outline" },
};

export const PROFILE_STATUS: LabelMap = {
  active: { label: "Aktif", tone: "success" },
  restricted: { label: "Kısıtlı", tone: "warning" },
  banned: { label: "Engelli", tone: "destructive" },
};

export const PROFILE_STATUS_HELP: Record<string, string> = {
  active: "Hesap normal çalışır.",
  restricted: "Yeni ilanları her zaman onaya düşer.",
  banned: "Yeni ilan ve hizmet talebi oluşturamaz.",
};

export const ANNOUNCEMENT_KINDS: LabelMap = {
  su_kesintisi: { label: "Su kesintisi", tone: "info" },
  elektrik_kesintisi: { label: "Elektrik kesintisi", tone: "warning" },
  belediye: { label: "Belediye", tone: "success" },
  genel: { label: "Genel", tone: "secondary" },
};

export const PLACE_CATEGORIES: Record<string, string> = {
  tarihi: "Tarihi yer",
  muze: "Müze",
  park: "Park",
  doga: "Doğa",
  avm: "AVM",
  diger: "Diğer",
};

export const POI_KINDS: Record<string, string> = {
  pharmacy: "Eczane",
  mosque: "Cami",
  bus_stop: "Durak",
  place: "Gezilecek yer",
};

export const POI_SOURCES: Record<string, string> = {
  kbb: "KBB Açık Veri",
  osm: "OpenStreetMap",
  manual: "Elle girildi",
  demo: "Örnek veri",
};

/** Demo cleanup scopes (admin_clear_demo_data). */
export const DEMO_SCOPES: Array<{ value: string; label: string; note?: string }> = [
  { value: "listings", label: "Örnek ilanlar" },
  { value: "reviews", label: "Örnek yorumlar" },
  { value: "announcements", label: "Örnek duyurular" },
  { value: "requests", label: "Örnek hizmet talepleri" },
  { value: "businesses", label: "Örnek işletmeler", note: "İşletmelerin ilanları, fotoğrafları ve teklifleri de silinir." },
  { value: "duty", label: "Örnek nöbet kayıtları", note: "Günlük cron görevi (roll_demo_duty) çalıştıkça yeniden oluşur." },
  { value: "poi", label: "Örnek yerler (kaynak: demo)" },
  { value: "users", label: "Örnek kullanıcı hesapları", note: "Yönetici hesapları ve senin hesabın hiçbir zaman silinmez." },
];

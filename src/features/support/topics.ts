/** Destek merkezi konuları (contact_messages.topic). Pure TS + lucide icons. */
import { Flag, Lightbulb, MapPinned, Megaphone, MessageCircleQuestion, Store, Wrench, type LucideIcon } from "lucide-react";

/** Topics the /yardim picker offers. */
export const SUPPORT_TOPICS = ["sikayet", "teknik_destek", "reklam", "isletme", "oneri", "diger"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** Every contact_messages.topic, incl. ones sent from elsewhere (place corrections from the place pages). */
export const MESSAGE_TOPICS = [...SUPPORT_TOPICS, "bilgi_duzeltme"] as const;
export type MessageTopic = (typeof MESSAGE_TOPICS)[number];

export type TopicInfo = {
  label: string;
  text: string;
  icon: LucideIcon;
  tone: string;
  subjectPlaceholder: string;
  messagePlaceholder: string;
  /** Ask for the business name */
  business?: boolean;
  hint?: string;
};

export const TOPIC_INFO: Record<MessageTopic, TopicInfo> = {
  sikayet: {
    label: "Şikayet bildir",
    text: "Bir işletme, ilan, kullanıcı ya da hizmet hakkında",
    icon: Flag,
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    subjectPlaceholder: "Neyi şikayet ediyorsun?",
    messagePlaceholder: "Ne oldu? Tarih, işletme ya da ilan adı gibi ayrıntıları yaz.",
    hint: "Belirli bir ilan ya da işletme için o sayfadaki ⋯ menüsünden de şikayet edebilirsin.",
  },
  teknik_destek: {
    label: "Teknik destek",
    text: "Uygulamada hata, giriş ya da yükleme sorunu",
    icon: Wrench,
    tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    subjectPlaceholder: "Sorun ne?",
    messagePlaceholder: "Hangi sayfada, ne yaparken oldu? Ekranda bir hata yazısı çıktıysa onu da yaz.",
    hint: "Cihaz ve tarayıcı bilgin sorunu çözebilmemiz için mesaja otomatik eklenir.",
  },
  reklam: {
    label: "Reklam ve iş birliği",
    text: "İşletmeni öne çıkar, vitrinde yer al",
    icon: Megaphone,
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    subjectPlaceholder: "ör. Ana sayfa vitrini, kategori öne çıkarma",
    messagePlaceholder: "Hangi reklam alanıyla ilgileniyorsun? Bütçe ve tarih aralığını yazarsan hızlı dönüş yaparız.",
    business: true,
  },
  isletme: {
    label: "İşletmemi ekletmek istiyorum",
    text: "İşletmeni listelemek ya da bilgilerini düzeltmek için",
    icon: Store,
    tone: "bg-brand-soft text-primary",
    subjectPlaceholder: "ör. Kafemi listelemek istiyorum",
    messagePlaceholder: "İşletmenin türü, adresi ve telefonu.",
    business: true,
  },
  oneri: {
    label: "Öneri",
    text: "Uygulamayı daha iyi yapacak fikirler",
    icon: Lightbulb,
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    subjectPlaceholder: "Önerin ne hakkında?",
    messagePlaceholder: "Fikrini anlat.",
  },
  diger: {
    label: "Diğer",
    text: "Diğer soru ve talepler",
    icon: MessageCircleQuestion,
    tone: "bg-muted text-muted-foreground",
    subjectPlaceholder: "Konu",
    messagePlaceholder: "Mesajın",
  },
  // Not in the /yardim picker: sent from the "Bilgi hatalı mı? Bildir" sheet on place pages.
  bilgi_duzeltme: {
    label: "Yer bilgisi düzeltme",
    text: "Eczane, cami, durak ya da gezilecek yer bilgisi hatası",
    icon: MapPinned,
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    subjectPlaceholder: "Yer",
    messagePlaceholder: "Ne yanlış?",
  },
};

export function parseTopic(v: unknown): SupportTopic | null {
  return typeof v === "string" && (SUPPORT_TOPICS as readonly string[]).includes(v) ? (v as SupportTopic) : null;
}

export const MESSAGE_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  new: { label: "Alındı", tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  in_progress: { label: "İnceleniyor", tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  resolved: { label: "Çözüldü", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  spam: { label: "Kapatıldı", tone: "bg-muted text-muted-foreground" },
};

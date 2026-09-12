"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, MessageSquareReply, PenLine, Send, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";

type Status = "cozuldu" | "yanitlandi" | "bekliyor";
type Complaint = {
  id: string;
  category: string;
  title: string;
  text: string;
  who: string;
  district: string;
  ago: string;
  status: Status;
  /** The business' or the office's answer. */
  reply?: { from: string; text: string };
};

/**
 * Example complaints and their answers, shown as examples ("Örnek şikayet ve çözümler"): generic kinds of businesses,
 * no real business names. Written complaints go to the support form (topic "sikayet") until a public complaint board
 * with moderation exists.
 */
const EXAMPLES: readonly Complaint[] = [
  {
    id: "kargo",
    category: "Kargo",
    title: "Paketim 5 gündür şubede bekliyor",
    text: "Şubeye gelen paketim dağıtıma çıkmadı, telefonla da ulaşamadım.",
    who: "Ayşe K.",
    district: "Gebze",
    ago: "2 gün önce",
    status: "cozuldu",
    reply: { from: "Kargo şubesi", text: "Paketiniz ertesi gün adresinize teslim edildi. Gecikme için özür dileriz." },
  },
  {
    id: "market",
    category: "Market",
    title: "Rafta yazan fiyat kasada farklı çıktı",
    text: "İndirimli görünen ürün kasada tam fiyattan okundu.",
    who: "Mehmet D.",
    district: "Darıca",
    ago: "4 gün önce",
    status: "cozuldu",
    reply: { from: "Market", text: "Aradaki fark iade edildi, raf etiketleri güncellendi. Bildiriminiz için teşekkürler." },
  },
  {
    id: "usta",
    category: "Usta ve servis",
    title: "Kombi servisi randevuya gelmedi",
    text: "Randevu verildi ama kimse gelmedi, haber de verilmedi.",
    who: "Fatma Y.",
    district: "Körfez",
    ago: "3 gün önce",
    status: "cozuldu",
    reply: { from: "Kombi servisi", text: "Aynı gün yeni randevu verdik, arıza giderildi." },
  },
  {
    id: "kafe",
    category: "Kafe ve restoran",
    title: "Siparişimiz 40 dakikada geldi",
    text: "Yoğun olmayan bir saatte siparişimiz çok geç geldi.",
    who: "Zeynep A.",
    district: "İzmit",
    ago: "1 hafta önce",
    status: "yanitlandi",
    reply: { from: "Kafe", text: "Mutfakta yaşanan bir aksaklık yüzünden gecikme oldu. Bir sonraki ziyaretinizde ikramımız olsun." },
  },
  {
    id: "internet",
    category: "İnternet",
    title: "Akşamları bağlantı sürekli kopuyor",
    text: "Üç gündür akşam saatlerinde internet kesilip geliyor.",
    who: "Emre T.",
    district: "Çayırova",
    ago: "Dün",
    status: "bekliyor",
  },
];

const STATUS: Record<Status, { label: string; tone: string }> = {
  cozuldu: { label: "Çözüldü", tone: "bg-emerald-100 text-emerald-700" },
  yanitlandi: { label: "Yanıtlandı", tone: "bg-sky-100 text-sky-700" },
  bekliyor: { label: "Yanıt bekleniyor", tone: "bg-amber-100 text-amber-800" },
};

const FILTERS: ReadonlyArray<{ value: Status | "tumu"; label: string }> = [
  { value: "tumu", label: "Tümü" },
  { value: "cozuldu", label: "Çözüldü" },
  { value: "yanitlandi", label: "Yanıtlandı" },
  { value: "bekliyor", label: "Bekliyor" },
];

const STEPS = [
  { icon: PenLine, title: "Yaz", text: "Sorunu anlat" },
  { icon: Send, title: "İletilir", text: "İşletmeye ve kuruma" },
  { icon: CircleCheck, title: "Çözülür", text: "Yanıtı takip et" },
] as const;

function ComplaintCard({ c }: { c: Complaint }) {
  const status = STATUS[c.status];
  return (
    <article className="rounded-[1.75rem] bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <UserRound className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{c.who}</p>
          <p className="truncate text-xs text-muted-foreground">
            {c.district} · {c.ago}
          </p>
        </div>
        <span className={cn("inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-xs font-bold", status.tone)}>{status.label}</span>
      </div>
      <span className="mt-3 inline-flex h-6 items-center rounded-full bg-orange-100 px-2.5 text-xs font-semibold text-orange-700">{c.category}</span>
      <h3 className="mt-2 text-[17px] leading-snug font-semibold">{c.title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{c.text}</p>
      {c.reply ? (
        <div className={cn("mt-3 rounded-[1.25rem] p-3.5", c.status === "cozuldu" ? "bg-emerald-50" : "bg-muted/70")}>
          <p className={cn("flex items-center gap-1.5 text-xs font-bold", c.status === "cozuldu" ? "text-emerald-700" : "text-muted-foreground")}>
            <MessageSquareReply className="size-4" aria-hidden />
            {c.reply.from} yanıtladı
          </p>
          <p className="mt-1 text-sm leading-relaxed">{c.reply.text}</p>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Şikayetler (a complaint board in the style of the big Turkish complaint sites): a black "Şikayet yaz" card (the
 * support form's "sikayet" topic), how it works in three steps, then example complaints with their answers, filtered
 * by status.
 */
export function ComplaintsBrowser() {
  const [filter, setFilter] = React.useState<Status | "tumu">("tumu");
  const shown = filter === "tumu" ? EXAMPLES : EXAMPLES.filter((c) => c.status === filter);
  const solved = EXAMPLES.filter((c) => c.status === "cozuldu").length;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[1.75rem] bg-foreground p-5 text-background">
        <h2 className="text-xl leading-tight font-semibold">Bir şikayetin mi var?</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-background/75">Yaşadığın sorunu anlat; ilgili işletmeye ve kuruma iletelim, çözülene kadar takip et.</p>
        <Link
          href={routes.content.help("sikayet")}
          className="mt-4 inline-flex h-12 items-center gap-2 rounded-2xl bg-background px-5 text-base font-semibold text-foreground outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <PenLine className="size-5" aria-hidden /> Şikayet yaz
        </Link>
      </section>

      <section aria-labelledby="nasil-isler">
        <h2 id="nasil-isler" className="text-xl font-semibold">
          Nasıl işliyor?
        </h2>
        <ol className="mt-3 grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col items-center rounded-[1.25rem] bg-card px-2 py-3.5 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
                <s.icon className="size-5" strokeWidth={2} />
              </span>
              <span className="mt-2 text-[15px] font-semibold">
                {i + 1}. {s.title}
              </span>
              <span className="mt-0.5 text-xs text-muted-foreground">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ornek-sikayetler">
        <div className="flex items-end justify-between gap-3">
          <h2 id="ornek-sikayetler" className="text-xl font-semibold">
            Örnek şikayet ve çözümler
          </h2>
          <span className="shrink-0 pb-0.5 text-sm font-semibold text-emerald-700">{solved} çözüldü</span>
        </div>
        <div role="radiogroup" aria-label="Duruma göre" className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {FILTERS.map((f) => {
            const on = f.value === filter;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center rounded-2xl px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {shown.map((c) => (
            <li key={c.id}>
              <ComplaintCard c={c} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import Link from "next/link";
import { BadgeCheck, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatNumber, initials } from "@/core/format";
import { routes } from "@/core/routes";
import type { Tone } from "../labels";

/** Small, server-safe building blocks shared by the services screens. */

export function StatusBadge({ label, tone, className }: { label: string; tone: Tone; className?: string }) {
  return (
    <Badge variant={tone} className={cn("h-6 px-2.5", className)}>
      {label}
    </Badge>
  );
}

/** "★ 4,8 (12)" or "Henüz yorum yok". */
export function RatingText({ avg, count, className }: { avg: number | string | null | undefined; count: number | null | undefined; className?: string }) {
  const n = Number(avg ?? 0);
  if (!count || !Number.isFinite(n) || n <= 0) {
    return <span className={cn("text-xs font-medium text-muted-foreground", className)}>Henüz yorum yok</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-bold tabular-nums", className)} aria-label={`5 üzerinden ${formatNumber(n, 1)} puan, ${count} değerlendirme`}>
      <Star className="size-4 fill-highlight text-highlight" aria-hidden />
      {n.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      <span className="font-medium text-muted-foreground">({count})</span>
    </span>
  );
}

/** Business logo or initials in a rounded square. */
export function FirmLogo({ name, logoUrl, size = "md", className }: { name: string; logoUrl?: string | null; size?: "md" | "lg"; className?: string }) {
  const box = size === "lg" ? "size-14 rounded-2xl text-lg" : "size-12 rounded-xl text-base";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" loading="lazy" decoding="async" className={cn("shrink-0 bg-muted object-cover ring-1 ring-foreground/[0.06]", box, className)} />
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-brand-soft font-extrabold text-primary", box, className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export type FirmCardData = {
  slug: string;
  name: string;
  logo_url: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  verification_level: number;
  category_label: string | null;
  neighbourhood_name?: string | null;
};

/** Compact firm row linking to /firma/[slug]. */
export function FirmCard({ firm, className }: { firm: FirmCardData; className?: string }) {
  const meta = [firm.category_label, firm.neighbourhood_name].filter(Boolean).join(" · ");
  return (
    <Link
      href={routes.businesses.detail(firm.slug)}
      className={cn(
        "flex min-h-18 items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-foreground/[0.06] transition-[box-shadow,transform] outline-none hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]",
        className,
      )}
    >
      <FirmLogo name={firm.name} logoUrl={firm.logo_url} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-bold">{firm.name}</span>
          {firm.verification_level >= 1 ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Onaylı firma" /> : null}
        </span>
        {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
        <RatingText avg={firm.rating_avg} count={firm.rating_count} className="mt-0.5" />
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** The 3 steps; `maxProviders` (the category's max_providers) names the limit, otherwise the copy stays neutral. */
function howItWorksSteps(maxProviders?: number) {
  const reach = maxProviders && maxProviders > 0 ? `en fazla ${maxProviders} uygun firmaya` : "uygun firmalara";
  return [
    { title: "Soruları cevapla", text: "İhtiyacını birkaç kısa soruyla anlat. 2 dakika sürer, ücretsizdir." },
    { title: "Firmalar ilgilensin", text: `Talebin ${reach} iletilir. İlgilenen her firma için bildirim alırsın.` },
    { title: "Profillere bak, ara", text: "Puanlara, yorumlara ve fiyat tahminlerine bak; dilediğin firmayı tek dokunuşla ara." },
  ];
}

/** "Nasıl çalışır?" card (3 steps). */
export function HowItWorks({ maxProviders, className }: { maxProviders?: number; className?: string }) {
  return (
    <section aria-labelledby="nasil-calisir" className={cn("rounded-3xl bg-card p-5 shadow-soft ring-1 ring-foreground/[0.06]", className)}>
      <h2 id="nasil-calisir" className="text-lg font-bold">
        Nasıl çalışır?
      </h2>
      <ol className="mt-4 flex flex-col gap-4">
        {howItWorksSteps(maxProviders).map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block font-semibold">{s.title}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-xl bg-muted px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        Uygulama içi mesajlaşma yok: firmalarla telefonla görüşürsün. Numaran yalnızca talebinle ilgilenen firmalarla paylaşılır, istersen gizli
        tutabilirsin.
      </p>
    </section>
  );
}

/** Request photos: /api/talep-foto URLs (private bucket, the route redirects to a short-lived signed URL); each opens the full image. */
export function PhotoGrid({ photos, className }: { photos: string[]; className?: string }) {
  if (!photos.length) return null;
  return (
    <ul className={cn("grid grid-cols-3 gap-2", className)}>
      {photos.map((url, i) => (
        <li key={url} className="aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/[0.06]">
          <a href={url} target="_blank" rel="noopener noreferrer" className="block size-full" aria-label={`Fotoğraf ${i + 1}: büyük aç`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Fotoğraf ${i + 1}`} loading="lazy" decoding="async" className="size-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Label / value rows (answers, request facts). */
export function FactList({ items, className }: { items: Array<{ label: string; value: React.ReactNode }>; className?: string }) {
  if (!items.length) return null;
  return (
    <dl className={cn("divide-y", className)}>
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-xs font-medium text-muted-foreground">{it.label}</dt>
          <dd className="text-[15px] font-semibold break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

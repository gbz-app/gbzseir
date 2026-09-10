import { cn } from "@/lib/utils";
import { formatPrice } from "@/core/format";
import type { MenuItem, MenuSection } from "../lib/vertical-queries";
import { MENU_TAGS } from "../lib/verticals";

/** One menu row: photo, name, tags, description, price. "Tükendi" when unavailable. Server-safe. */
export function MenuItemRow({ item }: { item: MenuItem }) {
  const tags = item.tags.filter((t) => MENU_TAGS[t]);
  return (
    <li className={cn("flex gap-3 p-3.5", !item.is_available && "opacity-55")}>
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt="" loading="lazy" decoding="async" className="size-[4.5rem] shrink-0 rounded-2xl object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="leading-snug font-semibold">{item.name}</p>
          {item.price_try != null ? <p className="shrink-0 font-semibold tabular-nums">{formatPrice(item.price_try)}</p> : null}
        </div>
        {item.description ? <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">{item.description}</p> : null}
        {tags.length || !item.is_available ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {!item.is_available ? <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-[11px] font-semibold">Tükendi</span> : null}
            {tags.map((t) => {
              const tag = MENU_TAGS[t];
              return (
                <span key={t} className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold", tag.tone)}>
                  <tag.icon className="size-3" aria-hidden />
                  {tag.label}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Menu sections as cards. `itemLimit` shows only the first N items per section (preview). */
export function MenuSections({ sections, itemLimit, anchorPrefix }: { sections: MenuSection[]; itemLimit?: number; anchorPrefix?: string }) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => (
        <section key={s.id} id={anchorPrefix ? `${anchorPrefix}${s.id}` : undefined} className="scroll-mt-36">
          <h3 className="mb-2 flex items-baseline gap-1.5 text-base font-semibold">
            {s.name} <span className="text-sm font-normal text-muted-foreground">({s.items.length})</span>
          </h3>
          {s.items.length ? (
            <ul className="divide-y rounded-3xl bg-card shadow-soft ring-1 ring-foreground/[0.05]">
              {(itemLimit ? s.items.slice(0, itemLimit) : s.items).map((it) => (
                <MenuItemRow key={it.id} item={it} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Bu bölümde henüz ürün yok.</p>
          )}
        </section>
      ))}
    </div>
  );
}

export function menuItemCount(sections: MenuSection[]): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}

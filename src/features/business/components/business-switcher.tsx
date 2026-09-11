import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import type { OwnerBusinessBrief } from "../lib/owner-queries";
import { VERTICAL_INFO } from "../lib/verticals";

/**
 * Business panel switcher: one pill per owned business (the active one filled) and "+ Yeni işletme".
 * Switching goes through /isletme/sec (sets the active-business cookie), so plain <a> links are used on purpose.
 */
export function BusinessSwitcher({ businesses, activeId, canAdd, className }: { businesses: OwnerBusinessBrief[]; activeId: string; canAdd: boolean; className?: string }) {
  if (businesses.length < 2 && !canAdd) return null;
  return (
    <nav aria-label="İşletmelerim" className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {businesses.map((b) => {
        const info = VERTICAL_INFO[b.vertical];
        const active = b.id === activeId;
        const body = (
          <>
            <span className={cn("flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full", active ? "bg-primary-foreground/15" : info.tone)}>
              {b.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logo_url} alt="" className="size-full object-cover" />
              ) : (
                <info.icon className="size-4" aria-hidden />
              )}
            </span>
            <span className="max-w-40 truncate">{b.name}</span>
            {b.status !== "approved" ? <span className={cn("text-xs font-medium", active ? "opacity-80" : "text-muted-foreground")}>· yayında değil</span> : null}
          </>
        );
        const cls = "flex h-11 shrink-0 items-center gap-2 rounded-full pr-4 pl-1.5 text-sm font-semibold ring-1 transition-colors";
        return active ? (
          <span key={b.id} aria-current="true" className={cn(cls, "bg-primary text-primary-foreground ring-primary")}>
            {body}
          </span>
        ) : (
          <a key={b.id} href={routes.business.select(b.id)} className={cn(cls, "bg-card ring-foreground/10 hover:bg-muted")} aria-label={`${b.name} işletmesine geç`}>
            {body}
          </a>
        );
      })}
      {canAdd ? (
        <Link
          href={routes.business.apply()}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-4 text-sm font-semibold text-primary transition-colors hover:bg-brand-soft"
        >
          <Plus className="size-4" aria-hidden /> Yeni işletme
        </Link>
      ) : null}
    </nav>
  );
}

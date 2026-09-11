import Link from "next/link";
import { BadgeCheck, ExternalLink, EyeOff, Lock, MapPinOff, MapPinned, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routes, type QueryRecord } from "@/core/routes";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import type { GuideRowItem } from "../lib/guide-admin";
import { AdminThumb } from "./admin-ui";

/**
 * Guide record rows (server-safe): cover photo or kind icon, badges, "Konumla" for rows without a pin (opens the editor
 * with the map; `pinQuery` adds the queue params), public link and edit.
 */
export function GuideRowList({ items, pinQuery }: { items: readonly GuideRowItem[]; pinQuery?: QueryRecord }) {
  return (
    <ul className="divide-y divide-muted overflow-hidden rounded-2xl bg-card">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-3 px-4 py-3">
          {it.thumb ? <AdminThumb src={it.thumb} size={40} /> : <KindIcon kind={it.kind} size="sm" />}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 font-semibold">
              <Link href={routes.admin.guideItem(it.id)} className="break-words hover:underline">
                {it.name}
              </Link>
              {it.verified ? (
                <Badge variant="success" className="gap-1">
                  <BadgeCheck className="size-3" aria-hidden /> Doğrulandı
                </Badge>
              ) : null}
              {!it.hasPin ? (
                <Badge variant="warning" className="gap-1">
                  <MapPinOff className="size-3" aria-hidden /> Konum yok
                </Badge>
              ) : null}
              {it.hidden ? (
                <Badge variant="secondary" className="gap-1">
                  <EyeOff className="size-3" aria-hidden /> Gizli
                </Badge>
              ) : null}
              {it.locked ? (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="size-3" aria-hidden /> Kilitli
                </Badge>
              ) : null}
            </p>
            <p className="text-xs break-words text-muted-foreground">{it.subtitle}</p>
            {it.address ? <p className="text-xs break-words text-muted-foreground">{it.address}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!it.hasPin ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={routes.admin.guideItem(it.id, { ...pinQuery, konum: 1 })} aria-label={`${it.name}: haritada işaretle`}>
                  <MapPinned aria-hidden />
                  <span className="hidden sm:inline">Konumla</span>
                </Link>
              </Button>
            ) : null}
            {it.publicHref ? (
              <a
                href={it.publicHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${it.name}: uygulamada aç`}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={routes.admin.guideItem(it.id)} aria-label={`${it.name}: düzenle`}>
                <Pencil />
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

import { Clock, Wrench } from "lucide-react";
import type { BusinessService } from "../lib/service-catalog";
import { formatServicePrice } from "../lib/verticals";

/** Public "Hizmetler ve fiyatlar" list of a service firm. Server-safe. */
export function ServiceList({ services }: { services: BusinessService[] }) {
  return (
    <ul className="divide-y rounded-3xl bg-card">
      {services.map((s) => (
        <li key={s.id} className="flex gap-3 p-3.5">
          {s.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.photo_url} alt="" loading="lazy" decoding="async" className="size-[4.5rem] shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
              <Wrench className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="leading-snug font-semibold">{s.name}</p>
            <p className="mt-0.5 text-sm font-semibold text-primary tabular-nums">{formatServicePrice(s.price_try, s.price_max_try, s.price_unit)}</p>
            {s.description ? <p className="mt-1 line-clamp-3 text-sm leading-snug text-muted-foreground">{s.description}</p> : null}
            {s.duration_text ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden /> {s.duration_text}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

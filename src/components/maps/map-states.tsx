import type { ReactNode } from "react";
import { MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import "./maps.css";

export const MAP_UNAVAILABLE_TITLE = "Harita şu an kullanılamıyor";

/** Black pill that opens a map after a tap (the "Harita" button of list pages). No shadow. */
export const MAP_OPEN_BUTTON =
  "pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background transition-transform outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:active:scale-100";

/** Map-like CSS background (streets, a park, a grid; light and dark): before a map loads, or instead of one. */
export function MapPattern({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("gz-map-pattern relative overflow-hidden", className)} aria-hidden={children ? undefined : true}>
      {children}
    </div>
  );
}

/** Calm notice over a map area: no key, key refused, or the map could not load. */
export function MapNotice({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-muted/85 px-6 text-center", className)} role="status">
      <MapPinOff className="mb-1.5 size-7 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}

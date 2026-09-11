import { BedDouble, ChevronRight, Ruler, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/core/format";
import type { Room } from "../lib/vertical-queries";
import { roomAmenityList } from "../lib/verticals";

/**
 * Hotel room card: swipeable photos, capacity / bed / size, features and nightly price. Server-safe.
 * `interactive` adds a "Detayları gör" hint (the parent opens the room sheet on tap).
 */
export function RoomCard({ room, name, interactive }: { room: Room; name: string; interactive?: boolean }) {
  const features = roomAmenityList(room.amenities);
  return (
    <article className={cn("overflow-hidden rounded-3xl bg-card", !room.is_available && "opacity-70")}>
      {room.photos.length ? (
        <div className="relative">
          <div className="no-scrollbar flex aspect-[16/9] snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
            {room.photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src + i} src={src} alt={`${name} - ${room.name} fotoğraf ${i + 1}`} loading="lazy" decoding="async" className="h-full w-full shrink-0 snap-center object-cover" />
            ))}
          </div>
          {room.photos.length > 1 ? (
            <span className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">{room.photos.length} fotoğraf</span>
          ) : null}
          {!room.is_available ? <span className="absolute top-3 left-3 rounded-full bg-card px-3 py-1 text-xs font-semibold">Şu an müsait değil</span> : null}
        </div>
      ) : null}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base leading-snug font-semibold">{room.name}</h3>
          {room.price_try != null ? (
            <p className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums">{formatPrice(room.price_try)}</span>
              <span className="text-xs text-muted-foreground">gecelik</span>
            </p>
          ) : null}
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-4" aria-hidden /> {room.capacity} kişi
          </span>
          {room.bed_info ? (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="size-4" aria-hidden /> {room.bed_info}
            </span>
          ) : null}
          {room.size_m2 ? (
            <span className="inline-flex items-center gap-1">
              <Ruler className="size-4" aria-hidden /> {room.size_m2} m²
            </span>
          ) : null}
        </p>
        {room.description ? <p className={cn("mt-2 text-sm leading-relaxed", interactive && "line-clamp-2")}>{room.description}</p> : null}
        {features.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {features.map((f) => (
              <li key={f.key} className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-medium">
                <f.icon className="size-3.5" aria-hidden />
                {f.label}
              </li>
            ))}
          </ul>
        ) : null}
        {interactive ? (
          <p className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-primary">
            Detayları gör <ChevronRight className="size-4" aria-hidden />
          </p>
        ) : null}
      </div>
    </article>
  );
}

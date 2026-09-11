"use client";

import * as React from "react";
import { BedDouble, CircleCheck, CircleSlash, Ruler, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/core/format";
import { CallButton } from "@/components/shared/call-button";
import { PRIMARY_CTA } from "@/components/shared/detail-hero";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { Room } from "../../lib/vertical-queries";
import { roomAmenityList } from "../../lib/verticals";
import { RoomCard } from "../room-card";

export type RoomListProps = {
  rooms: Room[];
  businessId: string;
  businessName: string;
  phone: string | null;
};

/** Hotel rooms; tapping a room opens a bottom sheet with all photos, details and "Rezervasyon için ara". */
export function RoomList({ rooms, businessId, businessName, phone }: RoomListProps) {
  const [open, setOpen] = React.useState(false);
  // Kept while the sheet animates closed.
  const [room, setRoom] = React.useState<Room | null>(null);

  const show = (r: Room) => {
    setRoom(r);
    setOpen(true);
  };

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rooms.map((r) => (
          <li key={r.id}>
            <div
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-label={`${r.name}: detayları gör`}
              onClick={() => show(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  show(r);
                }
              }}
              className="rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <RoomCard room={r} name={businessName} interactive />
            </div>
          </li>
        ))}
      </ul>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-w-2xl border-0 bg-background data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[1.75rem]">
          {room ? <RoomDetail key={room.id} room={room} businessId={businessId} businessName={businessName} phone={phone} /> : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function RoomDetail({ room, businessId, businessName, phone }: { room: Room; businessId: string; businessName: string; phone: string | null }) {
  const features = roomAmenityList(room.amenities);
  const facts = [
    { icon: Users, label: "Kapasite", value: `${room.capacity} kişi` },
    room.bed_info ? { icon: BedDouble, label: "Yatak", value: room.bed_info } : null,
    room.size_m2 ? { icon: Ruler, label: "Büyüklük", value: `${room.size_m2} m²` } : null,
  ].filter((f): f is { icon: typeof Users; label: string; value: string } => !!f);

  return (
    <>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
        {room.photos.length ? <RoomPhotos photos={room.photos} alt={`${businessName} - ${room.name}`} /> : null}

        <DrawerHeader className="px-0 pt-4 pb-0 text-left md:text-left">
          <div className="flex items-start justify-between gap-3">
            <DrawerTitle className="text-xl leading-tight font-semibold">{room.name}</DrawerTitle>
            {room.price_try != null ? (
              <p className="shrink-0 text-right">
                <span className="block text-lg leading-tight font-semibold tabular-nums">{formatPrice(room.price_try)}</span>
                <span className="text-xs text-muted-foreground">gecelik</span>
              </p>
            ) : null}
          </div>
          <DrawerDescription
            className={cn(
              "mt-1 inline-flex items-center gap-1.5 text-sm font-semibold",
              room.is_available ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {room.is_available ? <CircleCheck className="size-4" aria-hidden /> : <CircleSlash className="size-4" aria-hidden />}
            {room.is_available ? "Müsait" : "Şu an müsait değil"}
          </DrawerDescription>
        </DrawerHeader>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          {facts.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col items-center rounded-2xl bg-card px-2 py-3 text-center">
              <f.icon className="size-5 text-muted-foreground" aria-hidden />
              <dt className="order-last text-xs text-muted-foreground">{f.label}</dt>
              <dd className="mt-1.5 max-w-full truncate text-sm font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>

        {room.description ? <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{room.description}</p> : null}

        {features.length ? (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">Oda olanakları</h3>
            <ul className="flex flex-wrap gap-1.5">
              {features.map((f) => (
                <li key={f.key} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-medium">
                  <f.icon className="size-4 text-primary" aria-hidden />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Fiyat işletme tarafından girilir; müsaitlik ve rezervasyon için oteli ara.</p>
      </div>

      {phone ? (
        <div className="px-5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <CallButton phone={phone} subjectType="business" subjectId={businessId} label="Rezervasyon için ara" variant="default" size="lg" className={cn(PRIMARY_CTA, "w-full")} />
        </div>
      ) : null}
    </>
  );
}

/** Swipeable room photos with a counter and dots. */
function RoomPhotos({ photos, alt }: { photos: string[]; alt: string }) {
  const [index, setIndex] = React.useState(0);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-muted">
      <div
        data-vaul-no-drag
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="no-scrollbar flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {photos.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src + i} src={src} alt={`${alt} fotoğraf ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" className="h-full w-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      {photos.length > 1 ? (
        <>
          <span className="absolute top-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur-md">
            {index + 1} / {photos.length}
          </span>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {photos.map((src, i) => (
              <span key={src + i} className={cn("h-1.5 rounded-full bg-white/70 transition-all", i === index ? "w-5 bg-white" : "w-1.5")} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

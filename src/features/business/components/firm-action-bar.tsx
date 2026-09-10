"use client";

import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { ShareButton } from "@/components/shared/share-button";
import { APP_NAME } from "@/config/site";

export type FirmActionBarProps = {
  businessId: string;
  name: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
};

/** Sticky bottom actions of a firm page: Ara (logged call_click) · Yol tarifi · Paylaş. No messaging. */
export function FirmActionBar({ businessId, name, phone, lat, lng }: FirmActionBarProps) {
  const hasLocation = typeof lat === "number" && typeof lng === "number";
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-float backdrop-blur-md">
      <div className="flex items-center gap-2">
        {phone ? <CallButton phone={phone} subjectType="business" subjectId={businessId} label="Ara" size="lg" className="flex-1" /> : null}
        {hasLocation ? (
          <DirectionsButton
            lat={lat}
            lng={lng}
            name={name}
            size="lg"
            subjectType="business"
            subjectId={businessId}
            className={phone ? "shrink-0" : "flex-1"}
          />
        ) : null}
        <ShareButton title={name} text={`${name} | ${APP_NAME}`} iconOnly variant="secondary" size="lg" label="Paylaş" className="size-12 shrink-0" />
      </div>
    </div>
  );
}

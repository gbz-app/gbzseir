"use client";

import * as React from "react";
import Link from "next/link";
import { EllipsisVertical, Flag, ListChecks, Pencil, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CallButton } from "@/components/shared/call-button";
import { ReportSheet } from "@/components/shared/report-sheet";
import { RevealPhoneButton } from "@/components/shared/reveal-phone-button";
import { useAuth } from "@/lib/auth/auth-provider";
import { useRequireAuth } from "@/lib/auth/hooks";
import { createClient } from "@/lib/supabase/client";
import { readString, writeString } from "@/lib/storage";
import type { DisplayState } from "../view-models";

type OwnerLinks = { editHref: string | null; manageHref: string };

/** Header "⋯" menu: Şikayet et (others) or Düzenle / İlanlarım (owner). */
export function ListingDetailMenu({ listingId, ownerId, editHref, manageHref }: { listingId: string; ownerId: string } & OwnerLinks) {
  const { user } = useAuth();
  const ensureAuth = useRequireAuth();
  const [reportOpen, setReportOpen] = React.useState(false);
  const isOwner = !!user && user.id === ownerId;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Diğer seçenekler">
            <EllipsisVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {isOwner ? (
            <>
              {editHref ? (
                <DropdownMenuItem asChild className="min-h-11 px-3 text-[15px]">
                  <Link href={editHref}>
                    <Pencil /> İlanı düzenle
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild className="min-h-11 px-3 text-[15px]">
                <Link href={manageHref}>
                  <ListChecks /> İlanlarım
                </Link>
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              className="min-h-11 px-3 text-[15px]"
              onSelect={() => {
                if (!ensureAuth()) return;
                window.requestAnimationFrame(() => setReportOpen(true));
              }}
            >
              <Flag /> Şikayet et
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportSheet targetType="listing" targetId={listingId} open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}

/** "Şikayet et" link at the end of the detail page (hidden for the owner). */
export function ReportFooter({ listingId, ownerId }: { listingId: string; ownerId: string }) {
  const { user } = useAuth();
  if (user && user.id === ownerId) return null;
  return (
    <div className="flex justify-center">
      <ReportSheet targetType="listing" targetId={listingId} />
    </div>
  );
}

const barClass =
  "fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-float backdrop-blur-md";

/** Space at the end of the page so the fixed action bar never covers content. */
export function ActionBarSpacer() {
  return <div aria-hidden className="h-[calc(5.25rem+env(safe-area-inset-bottom,0px))] shrink-0" />;
}

/** Shown instead of the phone button on sample (is_demo) listings: their numbers are not real. */
function DemoNoCall() {
  return (
    <p className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-muted px-3 text-sm font-semibold text-muted-foreground">
      <PhoneOff className="size-5 shrink-0" aria-hidden />
      <span className="truncate">Örnek kayıt - aranamaz</span>
    </p>
  );
}

function OwnerBar({ editHref, manageHref }: OwnerLinks) {
  return (
    <div className={barClass}>
      <div className="flex gap-2">
        {editHref ? (
          <Button asChild variant="outline" size="lg" className="flex-1">
            <Link href={editHref}>
              <Pencil /> Düzenle
            </Link>
          </Button>
        ) : null}
        <Button asChild size="lg" className="flex-1">
          <Link href={manageHref}>
            <ListChecks /> İlanlarım
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** E3 sticky bottom bar: price + "Numarayı göster" (then number + Ara). Owner sees management buttons. Demo: not callable. */
export function ClassifiedActionBar({
  listingId,
  ownerId,
  priceText,
  state,
  similarHref,
  editHref,
  manageHref,
  isDemo,
}: {
  listingId: string;
  ownerId: string;
  priceText: string;
  state: DisplayState;
  similarHref: string;
  isDemo?: boolean;
} & OwnerLinks) {
  const { user } = useAuth();
  const [revealed, setRevealed] = React.useState(false);
  if (user && user.id === ownerId) return <OwnerBar editHref={editHref} manageHref={manageHref} />;
  if (state !== "live") {
    return (
      <div className={barClass}>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href={similarHref}>Benzer ilanlara göz at</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className={barClass}>
      <div className="flex items-center gap-3">
        {revealed ? null : (
          <div className="min-w-0 shrink-0">
            <p className="text-xs text-muted-foreground">Fiyat</p>
            <p className="max-w-[9rem] truncate text-lg leading-tight font-extrabold tabular-nums">{priceText}</p>
          </div>
        )}
        {isDemo ? (
          <DemoNoCall />
        ) : (
          <RevealPhoneButton listingId={listingId} fullWidth className="h-12 flex-1 text-base" onRevealed={() => setRevealed(true)} />
        )}
      </div>
    </div>
  );
}

/** E4 sticky bottom bar: phone visible without login (İŞKUR rule), CallButton logs call_click. Demo: not callable. */
export function JobActionBar({
  listingId,
  ownerId,
  phone,
  state,
  similarHref,
  editHref,
  manageHref,
  isDemo,
}: {
  listingId: string;
  ownerId: string;
  phone: string | null;
  state: DisplayState;
  similarHref: string;
  isDemo?: boolean;
} & OwnerLinks) {
  const { user } = useAuth();
  if (user && user.id === ownerId) return <OwnerBar editHref={editHref} manageHref={manageHref} />;
  if (state !== "live" || !phone) {
    return (
      <div className={barClass}>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href={similarHref}>Diğer iş ilanlarına göz at</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className={barClass}>
      {isDemo ? <DemoNoCall /> : <CallButton phone={phone} subjectType="job" subjectId={listingId} showNumber fullWidth size="lg" className="h-12 text-base" />}
    </div>
  );
}

/** Counts one view per listing per browser session (the RPC ignores the owner's own views). */
export function ViewTracker({ listingId }: { listingId: string }) {
  React.useEffect(() => {
    const key = `gebzem.viewed.${listingId}`;
    if (readString(key, "session")) return;
    writeString(key, "1", "session");
    createClient()
      .rpc("increment_listing_view", { p_listing_id: listingId })
      .then(
        () => undefined,
        () => undefined,
      );
  }, [listingId]);
  return null;
}

"use client";

import * as React from "react";
import Link from "next/link";
import { EllipsisVertical, Flag, ListChecks, Pencil, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhoneTR } from "@/core/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CallButton } from "@/components/shared/call-button";
import { DetailActions, PRIMARY_CTA } from "@/components/shared/detail-hero";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { ReportSheet } from "@/components/shared/report-sheet";
import { RevealPhoneButton } from "@/components/shared/reveal-phone-button";
import { useAuth } from "@/lib/auth/auth-provider";
import { useRequireAuth } from "@/lib/auth/hooks";
import { createClient } from "@/lib/supabase/client";
import { readString, writeString } from "@/lib/storage";
import type { DisplayState } from "../view-models";

type OwnerLinks = { editHref: string | null; manageHref: string };

/** Big black CTA of the bottom bar (the firm page "Ara"); the Button's default shadow is removed. */
const CTA = cn(PRIMARY_CTA, "shadow-none");
/** White pill next to the CTA. */
const LIGHT_CTA = "h-14 flex-1 rounded-full bg-card text-base font-semibold text-foreground shadow-none hover:bg-muted [&_svg]:size-5";

/** "⋯" menu: Şikayet et (others) or Düzenle / İlanlarım (owner). */
export function ListingDetailMenu({ listingId, ownerId, editHref, manageHref, className }: { listingId: string; ownerId: string; className?: string } & OwnerLinks) {
  const { user } = useAuth();
  const ensureAuth = useRequireAuth();
  const [reportOpen, setReportOpen] = React.useState(false);
  const isOwner = !!user && user.id === ownerId;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={cn("rounded-full", className)} aria-label="Diğer seçenekler">
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

/** Shown instead of the phone button on sample (is_demo) listings: their numbers are not real. */
function DemoNoCall() {
  return (
    <p className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-muted px-4 text-[15px] font-semibold text-muted-foreground">
      <PhoneOff className="size-5 shrink-0" aria-hidden />
      <span className="truncate">Örnek kayıt - aranamaz</span>
    </p>
  );
}

/** Small label + value on the left of the bar (price, phone number). */
function BarInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 shrink-0 pl-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="max-w-[10rem] truncate text-lg leading-tight font-bold tabular-nums">{value}</p>
    </div>
  );
}

function OwnerBar({ editHref, manageHref }: OwnerLinks) {
  return (
    <DetailActions>
      {editHref ? (
        <Button asChild variant="secondary" size="lg" className={LIGHT_CTA}>
          <Link href={editHref}>
            <Pencil /> Düzenle
          </Link>
        </Button>
      ) : null}
      <Button asChild size="lg" className={CTA}>
        <Link href={manageHref}>
          <ListChecks /> İlanlarım
        </Link>
      </Button>
    </DetailActions>
  );
}

function BrowseBar({ href, label }: { href: string; label: string }) {
  return (
    <DetailActions>
      <Button asChild size="lg" className={CTA}>
        <Link href={href}>{label}</Link>
      </Button>
    </DetailActions>
  );
}

/** E3 bottom bar: price + black "Numarayı göster", then the number + black "Ara". Owner: management buttons. Demo: not callable. */
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
  const [phone, setPhone] = React.useState<string | null>(null);
  if (user && user.id === ownerId) return <OwnerBar editHref={editHref} manageHref={manageHref} />;
  if (state !== "live") return <BrowseBar href={similarHref} label="Benzer ilanlara göz at" />;
  return (
    <DetailActions>
      {phone ? <BarInfo label="Satıcının numarası" value={formatPhoneTR(phone)} /> : <BarInfo label="Fiyat" value={priceText} />}
      {isDemo ? (
        <DemoNoCall />
      ) : phone ? (
        <CallButton phone={phone} subjectType="listing" subjectId={listingId} label="Ara" variant="default" size="lg" className={CTA} />
      ) : (
        <RevealPhoneButton listingId={listingId} className={CTA} onRevealed={(p) => setPhone(p)} />
      )}
    </DetailActions>
  );
}

/** Round white heart next to the job CTA (the job hero has no heart). */
const ROUND_FAVORITE = "size-14 bg-card text-foreground hover:bg-muted";

/**
 * E4 bottom bar: round heart + black "Ara ve başvur" (CallButton logs call_click; the number itself is shown without
 * login in the "Başvurmadan önce" card). Closed ads / no phone: heart + "Diğer iş ilanlarına göz at". Demo: not callable.
 * Owner: management buttons.
 */
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
  const heart = <FavoriteButton targetType="listing" targetId={listingId} variant="ghost" className={ROUND_FAVORITE} />;
  // Sample ads get no phone from the page (it is kept out of the payload), but still show the "aranamaz" pill.
  if (state === "live" && isDemo) {
    return (
      <DetailActions>
        {heart}
        <DemoNoCall />
      </DetailActions>
    );
  }
  if (state !== "live" || !phone) {
    return (
      <DetailActions>
        {heart}
        <Button asChild size="lg" className={CTA}>
          <Link href={similarHref}>Diğer iş ilanlarına göz at</Link>
        </Button>
      </DetailActions>
    );
  }
  return (
    <DetailActions>
      {heart}
      <CallButton phone={phone} subjectType="job" subjectId={listingId} label="Ara ve başvur" variant="default" size="lg" className={CTA} />
    </DetailActions>
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

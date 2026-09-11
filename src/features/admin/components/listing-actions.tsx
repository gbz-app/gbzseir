"use client";

import { Check, ExternalLink, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewListingAction, removeListingAction } from "../actions/listings";
import { LISTING_REJECT_REASONS } from "../lib/labels";
import { ConfirmDialog } from "./confirm-dialog";
import { ReasonDialog } from "./reason-dialog";
import { useAdminAction } from "./use-admin-action";

export function ListingActions({
  listingId,
  status,
  title,
  publicHref,
}: {
  listingId: string;
  status: string;
  title: string;
  publicHref: string | null;
}) {
  const { pending, run } = useAdminAction();
  const canApprove = status !== "active" && status !== "deleted" && status !== "sold" && status !== "filled";
  const canReject = status === "pending_review" || status === "active" || status === "paused";
  const canRemove = status !== "deleted";

  return (
    <div className="flex flex-wrap gap-2">
      {canApprove ? (
        <Button variant="success" disabled={pending} onClick={() => run(() => reviewListingAction({ listingId, approve: true }))}>
          <Check aria-hidden /> Onayla
        </Button>
      ) : null}
      {canReject ? (
        <ReasonDialog
          title="İlanı reddet"
          description={`"${title}" yayından alınır ve sahibine gerekçeyle birlikte bildirilir.`}
          reasons={LISTING_REJECT_REASONS}
          trigger={
            <Button variant="destructive" disabled={pending}>
              <X aria-hidden /> Reddet
            </Button>
          }
          onSubmit={async (reason) => {
            const r = await run(() => reviewListingAction({ listingId, approve: false, reason }));
            return !!r?.ok;
          }}
        />
      ) : null}
      {canRemove ? (
        <ConfirmDialog
          title="İlan kaldırılsın mı?"
          description={`"${title}" silindi olarak işaretlenir ve hiçbir yerde görünmez. İlan sahibine bildirim gitmez.`}
          confirmLabel="Kaldır"
          destructive
          trigger={
            <Button variant="ghost" disabled={pending}>
              <Trash2 aria-hidden /> Kaldır
            </Button>
          }
          onConfirm={async () => !!(await run(() => removeListingAction({ listingId })))?.ok}
        />
      ) : null}
      {publicHref ? (
        <Button asChild variant="outline">
          {/* Public app page (a separate site): plain link, no client routing. */}
          <a href={publicHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden /> Sayfayı aç
          </a>
        </Button>
      ) : null}
    </div>
  );
}

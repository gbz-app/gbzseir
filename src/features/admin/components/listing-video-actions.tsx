"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeListingVideoAction } from "../actions/listings";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

/** "Videoyu kaldır" on the admin listing card (the listing itself stays live). */
export function ListingVideoActions({ listingId, title }: { listingId: string; title: string }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Video kaldırılsın mı?"
      description={`"${title}" ilanındaki video silinir, ilan yayında kalır. İlan sahibine bildirim gider.`}
      confirmLabel="Videoyu kaldır"
      destructive
      trigger={
        <Button variant="ghost" disabled={pending}>
          <Trash2 aria-hidden /> Videoyu kaldır
        </Button>
      }
      onConfirm={async () => !!(await run(() => removeListingVideoAction({ listingId })))?.ok}
    />
  );
}

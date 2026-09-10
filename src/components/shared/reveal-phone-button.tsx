"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { RPC, rpcArgs, type RevealPhoneResult } from "@/lib/db-contract";
import { routes } from "@/core/routes";
import { formatPhoneTR } from "@/core/format";
import { CallButton } from "./call-button";

export type RevealPhoneButtonProps = {
  /** Listing uuid (2. el). */
  listingId: string;
  label?: string;
  /** contact_event subject type for the follow-up call: 'listing' (default) or 'job'. */
  subjectType?: "listing" | "job";
  /** Called with the revealed phone (E.164). */
  onRevealed?: (phone: string, displayName?: string | null) => void;
  fullWidth?: boolean;
  className?: string;
};

const REASON_MESSAGES: Record<string, string> = {
  rate_limited: "Bugün çok fazla numara görüntüledin. Lütfen daha sonra tekrar dene.",
  not_found: "Bu ilan artık yayında değil.",
  no_phone: "Bu ilan için numara bulunamadı.",
};

/**
 * "Numarayı göster" for 2. el listings: rpc('reveal_listing_phone') (logged + rate limited in the DB:
 * guests 5/day per IP, members 30/day), then shows the number with a CallButton.
 * When the guest limit is reached the user is sent to login and returns here.
 */
export function RevealPhoneButton({ listingId, label = "Numarayı göster", subjectType = "listing", onRevealed, fullWidth, className }: RevealPhoneButtonProps) {
  const router = useRouter();
  const [phone, setPhone] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reveal = async () => {
    setBusy(true);
    const { data, error } = await createClient().rpc(RPC.revealListingPhone, rpcArgs.revealListingPhone(listingId));
    setBusy(false);
    const result = data as RevealPhoneResult | null;
    if (error || !result) {
      toast.error("Numara şu an gösterilemiyor. Lütfen tekrar dene.");
      return;
    }
    if (!result.ok) {
      if (result.reason === "login_required") {
        toast.message("Numarayı görmek için giriş yap.");
        router.push(routes.auth.login(`${window.location.pathname}${window.location.search}`));
        return;
      }
      toast.error(REASON_MESSAGES[result.reason] ?? "Numara şu an gösterilemiyor.");
      return;
    }
    setPhone(result.phone);
    onRevealed?.(result.phone, result.display_name);
  };

  if (phone) {
    return (
      <div className={cn("flex items-center gap-2", fullWidth && "w-full", className)}>
        <a href={`tel:${phone}`} className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3.5 py-2.5 text-lg font-extrabold tabular-nums">
          {formatPhoneTR(phone)}
        </a>
        <CallButton phone={phone} subjectType={subjectType} subjectId={listingId} />
      </div>
    );
  }

  return (
    <Button type="button" variant="default" onClick={reveal} disabled={busy} className={cn(fullWidth && "w-full", className)}>
      {busy ? <Loader2 className="animate-spin" /> : <Eye />}
      {label}
    </Button>
  );
}

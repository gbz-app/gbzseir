"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { CallButton } from "@/components/shared/call-button";
import { useAuth } from "@/lib/auth/auth-provider";
import { RPC, type RevealPhoneResult } from "@/lib/db-contract";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/client";

const REASONS: Record<string, string> = {
  rate_limited: "Bugün çok fazla numara görüntüledin. Yarın tekrar dene.",
  not_found: "Bu etkinlik artık yayında değil.",
  no_phone: "Bu etkinlik için numara eklenmemiş.",
  demo: "Bu etkinlik için numara paylaşılmıyor.",
};

/**
 * "Numarayı göster" for an event created by a normal user: signed-in users only (guests go to login and come back).
 * rpc reveal_event_phone logs the reveal and applies the daily cap; then a call button with the number is shown.
 * `demo` (sample event): renders nothing, like CallButton; if the RPC still answers "demo", the control disappears.
 */
export function EventPhoneReveal({
  eventId,
  size = "lg",
  className,
  demo,
}: {
  eventId: string;
  size?: "default" | "lg";
  className?: string;
  demo?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [phone, setPhone] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  const toLogin = () => {
    notify.info("Numarayı görmek için giriş yap");
    router.push(routes.auth.login(`${window.location.pathname}${window.location.search}`));
  };

  const reveal = async () => {
    if (!user) return toLogin();
    setBusy(true);
    const { data, error } = await createClient().rpc(RPC.revealEventPhone, { p_event: eventId });
    setBusy(false);
    const res = data as RevealPhoneResult | null;
    if (error || !res) return notify.error("Numara şu an gösterilemiyor. Tekrar dene.");
    if (!res.ok) {
      if (res.reason === "login_required") return toLogin();
      if (res.reason === "demo") {
        setHidden(true);
        return notify.info(REASONS.demo);
      }
      return notify.error(REASONS[res.reason] ?? "Numara şu an gösterilemiyor.");
    }
    setPhone(res.phone);
  };

  if (demo || hidden) return null;
  if (phone) {
    return <CallButton phone={phone} subjectType="event" subjectId={eventId} showNumber variant="default" size={size} className={className} />;
  }
  return (
    <Button type="button" size={size} onClick={reveal} disabled={busy} className={cn(className)}>
      {busy ? <Loader2 className="animate-spin" /> : <Eye />}
      Numarayı göster
    </Button>
  );
}

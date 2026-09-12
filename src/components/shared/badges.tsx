import { BadgeCheck, Briefcase, FlaskConical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { Badge } from "@/components/ui/badge";

type BadgeProps = { className?: string; label?: string };

/** Solid red "Nöbetçi" pill (duty pharmacy) with a small pulsing white dot: minimal and easy to spot. */
export function DutyBadge({ className, label = "Nöbetçi" }: BadgeProps) {
  return (
    <Badge variant="duty" className={cn("h-6 gap-1.5 px-2.5", className)}>
      <span className="relative flex size-1.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80 motion-reduce:hidden" />
        <span className="relative inline-flex size-1.5 rounded-full bg-white" />
      </span>
      {label}
    </Badge>
  );
}

/** Teal "Onaylı" badge for admin-approved businesses. */
export function VerifiedBadge({ className, label = "Onaylı" }: BadgeProps) {
  return (
    <Badge variant="verified" className={cn("h-6 px-2.5", className)}>
      <BadgeCheck aria-hidden />
      {label}
    </Badge>
  );
}

/**
 * Sample-data marker. The public app shows sample rows like real ones (owner: no "Örnek" labels anywhere), so it
 * renders nothing there. Only the admin site still marks them, so demo rows can be found and cleaned up.
 */
export function DemoBadge({ className, label = "Örnek veri" }: BadgeProps) {
  if (!IS_ADMIN_SITE) return null;
  return (
    <Badge variant="demo" className={cn("h-6 px-2.5", className)}>
      <FlaskConical aria-hidden />
      {label}
    </Badge>
  );
}

/** "İşletme" badge shown next to business accounts. */
export function BusinessBadge({ className, label = "İşletme" }: BadgeProps) {
  return (
    <Badge variant="secondary" className={cn("h-6 px-2.5", className)}>
      <Briefcase aria-hidden />
      {label}
    </Badge>
  );
}

/** Green "Açık" / gray "Kapalı" badge. */
export function OpenStatusBadge({ open, className, openLabel = "Açık", closedLabel = "Kapalı" }: { open: boolean; className?: string; openLabel?: string; closedLabel?: string }) {
  return (
    <Badge variant={open ? "success" : "secondary"} className={cn("h-6 px-2.5", className)}>
      <span className={cn("size-1.5 rounded-full", open ? "bg-success" : "bg-muted-foreground")} aria-hidden />
      {open ? openLabel : closedLabel}
    </Badge>
  );
}

/** Neutral "İnceleniyor" style badge for pending moderation states. */
export function PendingBadge({ className, label = "İnceleniyor" }: BadgeProps) {
  return (
    <Badge variant="warning" className={cn("h-6 px-2.5", className)}>
      <Clock aria-hidden />
      {label}
    </Badge>
  );
}

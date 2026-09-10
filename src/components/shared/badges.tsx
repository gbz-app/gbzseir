import { BadgeCheck, Briefcase, Cross, FlaskConical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type BadgeProps = { className?: string; label?: string };

/** Amber "Nöbetçi" badge (duty pharmacy). */
export function DutyBadge({ className, label = "Nöbetçi" }: BadgeProps) {
  return (
    <Badge variant="duty" className={cn("h-6 px-2.5", className)}>
      <Cross aria-hidden />
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

/** Dashed "Örnek veri" badge for demo/prototype data. */
export function DemoBadge({ className, label = "Örnek veri" }: BadgeProps) {
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

"use client";

import * as React from "react";
import { Copy, Phone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { formatPhoneTR } from "@/core/format";
import { telHref } from "@/core/phone";
import { logContactEvent, type ContactSubjectType } from "@/lib/contact";
import { isMobileDevice } from "@/lib/platform";

export type CallButtonProps = {
  /** Phone in any TR notation (stored as E.164). */
  phone: string;
  /** What is being contacted (log_contact_event): 'listing' | 'job' | 'business' | 'poi' (pharmacy, mosque, place) | 'lead'. */
  subjectType: ContactSubjectType;
  /** uuid of the subject. */
  subjectId: string;
  /** Button text (default "Ara"). */
  label?: string;
  /** Show the formatted number as the label ("0532 123 45 67"). */
  showNumber?: boolean;
  iconOnly?: boolean;
  variant?: "success" | "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  fullWidth?: boolean;
  className?: string;
  /** Called after the call was started (mobile) or the number was shown (desktop). */
  onCall?: () => void;
  /** Sample (is_demo) record: its number is a placeholder, so no call button is rendered at all. */
  demo?: boolean;
};

/**
 * The ONLY contact channel in the app (no messaging). Logs a contact_event (fire-and-forget, keepalive)
 * and opens tel:+90... On desktop it shows the formatted number with a copy button instead.
 */
export function CallButton({
  phone,
  subjectType,
  subjectId,
  label = "Ara",
  showNumber,
  iconOnly,
  variant = "success",
  size = "default",
  fullWidth,
  className,
  onCall,
  demo,
}: CallButtonProps) {
  const [desktopOpen, setDesktopOpen] = React.useState(false);
  if (demo) return null;
  const formatted = formatPhoneTR(phone);
  const href = telHref(phone);

  const onClick = () => {
    logContactEvent({ subjectType, subjectId, event: "call_click" });
    onCall?.();
    if (isMobileDevice()) {
      window.location.href = href;
    } else {
      setDesktopOpen(true);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success("Numara kopyalandı");
    } catch {
      toast.message(formatted);
    }
  };

  return (
    <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant={variant}
          size={iconOnly ? "icon" : size}
          onClick={onClick}
          aria-label={iconOnly ? `${label}: ${formatted}` : undefined}
          className={cn(fullWidth && "w-full", iconOnly && "rounded-full", className)}
        >
          <Phone />
          {iconOnly ? null : showNumber ? formatted : label}
        </Button>
      </PopoverAnchor>
      <PopoverContent align="center" className="w-72 rounded-2xl p-4">
        <p className="text-xs font-semibold text-muted-foreground">Telefon numarası</p>
        <a href={href} className="mt-1 block text-2xl font-extrabold tracking-tight tabular-nums hover:underline">
          {formatted}
        </a>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={copy}>
            <Copy /> Kopyala
          </Button>
          <Button asChild variant="success" size="sm" className="flex-1">
            <a href={href}>
              <Phone /> Ara
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

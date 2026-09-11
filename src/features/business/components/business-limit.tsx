"use client";

import Link from "next/link";
import { LifeBuoy, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { businessLimitText, newBusinessHelpHref } from "../lib/business-quota";

/** Black primary CTA. */
const BLACK = "bg-foreground text-background hover:bg-foreground/90";

/** Icon, title and the "one business per account" text. */
function LimitMessage({ limit, className }: { limit: number; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <span className="flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-primary">
        <Store className="size-8" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-balance">Yeni işletme için bize yaz</h2>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">{businessLimitText(limit)}</p>
    </div>
  );
}

/**
 * Shown instead of the apply wizard once the account has reached its business limit. `unfinishedHref` offers to finish
 * a business that is not live yet instead.
 */
export function BusinessLimitNotice({ limit, unfinishedHref }: { limit: number; unfinishedHref?: string | null }) {
  return (
    <div className="flex flex-col items-center px-4 pt-10 pb-16">
      <LimitMessage limit={limit} />
      <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
        <Button asChild size="lg" className={BLACK}>
          <Link href={newBusinessHelpHref()}>
            <LifeBuoy aria-hidden /> Destek ekibine yaz
          </Link>
        </Button>
        {unfinishedHref ? (
          <Button asChild size="lg" variant="ghost">
            <Link href={unfinishedHref}>Yarım kalan işletmeni tamamla</Link>
          </Button>
        ) : (
          <Button asChild size="lg" variant="ghost">
            <Link href={routes.business.root()}>İşletme paneline dön</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Same message as a bottom sheet (profile screen "Yeni işletme ekle"). */
export function BusinessLimitSheet({ open, onOpenChange, limit }: { open: boolean; onOpenChange: (open: boolean) => void; limit: number }) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Yeni işletme ekle"
      hideHeader
      footer={
        <Button asChild size="lg" className={cn("w-full", BLACK)}>
          <Link href={newBusinessHelpHref()} onClick={() => onOpenChange(false)}>
            <LifeBuoy aria-hidden /> Destek ekibine yaz
          </Link>
        </Button>
      }
    >
      <LimitMessage limit={limit} className="pt-4 pb-2" />
    </BottomSheet>
  );
}

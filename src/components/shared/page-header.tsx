"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { canGoBack } from "@/lib/navigation-history";
import { useScrolled } from "@/components/layout/nav-visibility";

export type PageHeaderProps = {
  /** Page title (h1). */
  title: React.ReactNode;
  /** Small line under the title. */
  subtitle?: React.ReactNode;
  /** Where "Geri" goes when there is no in-app history (deep link). Default "/". */
  backHref?: string;
  /** Hide the back button (e.g. first step of a flow with its own close button). */
  hideBack?: boolean;
  /** Custom back handler (overrides history/backHref). */
  onBack?: () => void;
  /** Right-side actions (icon buttons: ShareButton iconOnly, FavoriteButton...). */
  actions?: React.ReactNode;
  /** Extra row under the title bar (tabs, search, chips). */
  children?: React.ReactNode;
  /** Sticky at the top (default true). */
  sticky?: boolean;
  /** Transparent until scrolled (for pages with a hero image). */
  transparent?: boolean;
  /** Hide the bottom nav while this page is mounted (detail pages with their own action bar). */
  hideBottomNav?: boolean;
  className?: string;
};

/** Header for every non-tab page: back button, title, right actions. Handles safe-area insets. */
export function PageHeader({
  title,
  subtitle,
  backHref = "/",
  hideBack,
  onBack,
  actions,
  children,
  sticky = true,
  transparent,
  hideBottomNav,
  className,
}: PageHeaderProps) {
  const router = useRouter();
  const scrolled = useScrolled(4);

  const goBack = React.useCallback(() => {
    if (onBack) return onBack();
    if (canGoBack()) router.back();
    else router.push(backHref);
  }, [onBack, router, backHref]);

  const solid = !transparent || scrolled;

  return (
    <header
      className={cn(
        "z-40 pt-safe transition-[background-color,box-shadow,border-color] duration-200",
        sticky && "sticky top-0",
        solid ? "border-b bg-background/90 backdrop-blur-md" : "border-b border-transparent bg-transparent",
        solid && scrolled && "shadow-soft",
        className,
      )}
    >
      {hideBottomNav ? <HideBottomNav /> : null}
      <div className="flex h-(--topbar-h) items-center gap-1 px-2">
        {hideBack ? (
          <span className="w-2" aria-hidden />
        ) : (
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={goBack} aria-label="Geri">
            <ChevronLeft className="size-6" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] leading-tight font-bold">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-0.5 pr-1">{actions}</div> : null}
      </div>
      {children ? <div className="px-4 pb-3">{children}</div> : null}
    </header>
  );
}

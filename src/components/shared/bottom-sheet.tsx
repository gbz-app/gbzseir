"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

export type BottomSheetProps = {
  /** Controlled open state (omit both open/onOpenChange + pass `trigger` for uncontrolled). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the sheet (rendered with asChild). */
  trigger?: React.ReactNode;
  /** Required for accessibility; use hideHeader to keep it screen-reader only. */
  title: React.ReactNode;
  description?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
  /** Sticky footer (buttons). Safe-area padding is added. */
  footer?: React.ReactNode;
  /** Take ~92% of the viewport height (lists with search). */
  fullHeight?: boolean;
  /** Allow closing by swipe/overlay (default true). */
  dismissible?: boolean;
  /** Pass false when the sheet contains inputs that should not be moved above the keyboard. */
  repositionInputs?: boolean;
  className?: string;
  bodyClassName?: string;
};

/** Mobile bottom sheet (vaul drawer) with header, scrollable body and optional sticky footer. */
export function BottomSheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  hideHeader,
  children,
  footer,
  fullHeight,
  dismissible = true,
  repositionInputs,
  className,
  bodyClassName,
}: BottomSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={dismissible} repositionInputs={repositionInputs}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent
        className={cn(
          "mx-auto w-full max-w-2xl rounded-t-card data-[vaul-drawer-direction=bottom]:rounded-t-card",
          fullHeight
            ? "h-[92dvh] data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
            : "data-[vaul-drawer-direction=bottom]:max-h-[88dvh]",
          className,
        )}
      >
        <DrawerHeader className={cn("px-5 pt-3 pb-2 text-left md:text-left", hideHeader && "sr-only")}>
          <DrawerTitle className="text-lg font-bold">{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5",
            footer ? "pb-3" : "pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <DrawerFooter className="px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">{footer}</DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

/** Wrap a button with this to close the surrounding BottomSheet. */
export const BottomSheetClose = DrawerClose;

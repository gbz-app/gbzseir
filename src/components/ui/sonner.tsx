"use client"

import type { CSSProperties, ReactNode } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, CircleHelpIcon, CircleXIcon, LoaderCircleIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { TOAST_DURATION } from "@/lib/notify"

/*
 * One toast look for the whole app (public and admin), minimalist (owner, 12.09): a white rounded card with a 36px
 * soft-coloured icon chip per type (tick for success, X for errors, question mark for info, "!" for warnings), shown at
 * the bottom, just above the bottom menu. A soft shadow is the only thing that lifts it off the white cards under it.
 * Sonner runs `unstyled`, so every visual rule lives in the classes below.
 *
 * Sonner still injects a small unlayered stylesheet (position, `outline: 0`, a focus box-shadow, mobile width, a
 * transition on every direct child). Unlayered CSS beats Tailwind's layered utilities whatever the specificity, so
 * the few classes that fight those rules carry `!`.
 */

const ICON = "size-5"

// `default` is only used by toast.promise() resolving to a React element. toast() and toast.message() have no type at
// all and sonner renders no icon slot for them; their chip is drawn by `classNames.default` below.
const TOAST_ICONS: NonNullable<ToasterProps["icons"]> & { default: ReactNode } = {
  success: <CircleCheckIcon className={ICON} strokeWidth={2.2} aria-hidden />,
  error: <CircleXIcon className={ICON} strokeWidth={2.2} aria-hidden />,
  info: <CircleHelpIcon className={ICON} strokeWidth={2.2} aria-hidden />,
  warning: <TriangleAlertIcon className={ICON} strokeWidth={2.2} aria-hidden />,
  loading: <LoaderCircleIcon className={`${ICON} animate-spin`} aria-hidden />,
  close: <XIcon className="size-4" aria-hidden />,
  default: <CircleHelpIcon className={ICON} strokeWidth={2.2} aria-hidden />,
}

// Lucide "circle-help" in near-black, for the chip of type-less toasts (drawn as a background: no element to put it in).
const PLAIN_ICON_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#171717' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><path d='M12 17h.01'/></svg>"

const TOAST_CLASS_NAMES: NonNullable<NonNullable<ToasterProps["toastOptions"]>["classNames"]> = {
  toast: [
    "mx-auto flex min-h-15 w-(--width)! items-center gap-3 rounded-2xl bg-white px-3.5 py-3 font-sans text-neutral-950",
    "shadow-[0_10px_32px_-10px_rgb(30_16_60/0.28)]!",
    "focus-visible:outline-2! focus-visible:outline-offset-2 focus-visible:outline-primary!",
    // Collapsed stack: the cards behind the front one peek out a shade darker, their content hidden.
    "data-[expanded=false]:data-[front=false]:bg-neutral-100",
    "data-[expanded=false]:data-[front=false]:*:opacity-0",
  ].join(" "),
  // toast() / toast.message(): the same grey chip as a ::before of the text column (unless the call passed an icon).
  default: [
    "[&:not(:has(>[data-icon]))>[data-content]]:relative [&:not(:has(>[data-icon]))>[data-content]]:min-h-9",
    "[&:not(:has(>[data-icon]))>[data-content]]:justify-center [&:not(:has(>[data-icon]))>[data-content]]:ps-12",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:absolute [&:not(:has(>[data-icon]))>[data-content]]:before:start-0",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:top-1/2 [&:not(:has(>[data-icon]))>[data-content]]:before:size-9",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:-translate-y-1/2 [&:not(:has(>[data-icon]))>[data-content]]:before:rounded-full",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:[background:var(--toast-plain-chip)]",
  ].join(" "),
  icon: [
    "relative flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 empty:hidden",
    "in-data-[type=success]:bg-emerald-100 in-data-[type=success]:text-emerald-600",
    "in-data-[type=error]:bg-red-100 in-data-[type=error]:text-red-600",
    "in-data-[type=info]:bg-violet-100 in-data-[type=info]:text-violet-600",
    "in-data-[type=warning]:bg-amber-100 in-data-[type=warning]:text-amber-600",
  ].join(" "),
  content: "flex min-w-0 flex-1 flex-col gap-0.5",
  title: "text-[15px] leading-snug font-semibold",
  description: "text-[13px] leading-snug text-neutral-500",
  // No transition classes on the buttons: sonner's `[data-sonner-toast] > * { transition: opacity }` replaces them.
  actionButton:
    "inline-flex h-9 shrink-0 items-center rounded-full bg-neutral-950 px-4 text-sm font-semibold text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:active:scale-95",
  cancelButton:
    "inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-neutral-500 outline-none hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-primary",
  // Only rendered where closeButton is on (admin site, or a toast that asks for it); sits at the end of the row.
  closeButton:
    "order-last -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-400 outline-none hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-primary",
}

const TOASTER_STYLE = {
  "--width": "min(92vw, 26rem)",
  "--toast-plain-chip": `url("data:image/svg+xml,${encodeURIComponent(PLAIN_ICON_SVG)}") center / 1.25rem no-repeat, rgb(245 245 245)`,
} as CSSProperties

/**
 * Just above the bottom menu (62 px + the phone's safe area): a toast right at 50 px would cover the menu's top edge.
 * A screen with its own bottom bar (GebzemAI's composer) moves it up by setting --toast-bottom on <html>.
 */
const BOTTOM = "var(--toast-bottom, calc(var(--bottomnav-h) + env(safe-area-inset-bottom, 0px) + 12px))"

const Toaster = ({ toastOptions, ...props }: ToasterProps) => (
  <Sonner
    // The toast carries its own colours. Pinning sonner to "light" keeps its dark-theme description and close-button
    // colours (which ignore `unstyled`) out of the way.
    theme="light"
    position="bottom-center"
    offset={{ bottom: BOTTOM }}
    // left/right 0: the list spans the screen and each toast centres itself at --width (92vw on phones).
    mobileOffset={{ bottom: BOTTOM, left: 0, right: 0 }}
    gap={10}
    visibleToasts={3}
    duration={TOAST_DURATION.default}
    swipeDirections={["bottom", "left", "right"]}
    containerAriaLabel="Bildirimler"
    icons={TOAST_ICONS}
    style={TOASTER_STYLE}
    {...props}
    toastOptions={{
      unstyled: true,
      closeButtonAriaLabel: "Kapat",
      ...toastOptions,
      classNames: { ...TOAST_CLASS_NAMES, ...toastOptions?.classNames },
    }}
  />
)

export { Toaster }

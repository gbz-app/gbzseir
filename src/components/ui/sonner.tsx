"use client"

import type { CSSProperties, ReactNode } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, CircleXIcon, InfoIcon, LoaderCircleIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { TOAST_DURATION } from "@/lib/notify"

/*
 * One toast look for the whole app (public and admin): a black rounded card with a 36px coloured icon chip per type.
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
  success: <CircleCheckIcon className={ICON} aria-hidden />,
  error: <CircleXIcon className={ICON} aria-hidden />,
  info: <InfoIcon className={ICON} aria-hidden />,
  warning: <TriangleAlertIcon className={ICON} aria-hidden />,
  loading: <LoaderCircleIcon className={`${ICON} animate-spin`} aria-hidden />,
  close: <XIcon className="size-4" aria-hidden />,
  default: <InfoIcon className={ICON} aria-hidden />,
}

// Lucide "info" in white, for the chip of type-less toasts (drawn as a background, as there is no element to put it in).
const PLAIN_ICON_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M12 16v-4'/><path d='M12 8h.01'/></svg>"

const TOAST_CLASS_NAMES: NonNullable<NonNullable<ToasterProps["toastOptions"]>["classNames"]> = {
  toast: [
    // Dark mode lifts the card to neutral-800: neutral-950 would vanish into the near-black app background.
    "mx-auto flex min-h-15 w-(--width)! items-center gap-3 rounded-2xl bg-neutral-950 px-3.5 py-3 font-sans text-white dark:bg-neutral-800",
    "focus-visible:shadow-none! focus-visible:outline-2! focus-visible:outline-offset-2 focus-visible:outline-primary!",
    // Collapsed stack: the cards behind the front one peek out a shade lighter, their content hidden.
    "data-[expanded=false]:data-[front=false]:bg-neutral-800 dark:data-[expanded=false]:data-[front=false]:bg-neutral-700",
    "data-[expanded=false]:data-[front=false]:*:opacity-0",
  ].join(" "),
  // toast() / toast.message(): the same neutral chip as a ::before of the text column (unless the call passed an icon).
  default: [
    "[&:not(:has(>[data-icon]))>[data-content]]:relative [&:not(:has(>[data-icon]))>[data-content]]:min-h-9",
    "[&:not(:has(>[data-icon]))>[data-content]]:justify-center [&:not(:has(>[data-icon]))>[data-content]]:ps-12",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:absolute [&:not(:has(>[data-icon]))>[data-content]]:before:start-0",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:top-1/2 [&:not(:has(>[data-icon]))>[data-content]]:before:size-9",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:-translate-y-1/2 [&:not(:has(>[data-icon]))>[data-content]]:before:rounded-full",
    "[&:not(:has(>[data-icon]))>[data-content]]:before:[background:var(--toast-plain-chip)]",
  ].join(" "),
  icon: [
    "relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 empty:hidden",
    "in-data-[type=success]:bg-emerald-500/20 in-data-[type=success]:text-emerald-400",
    "in-data-[type=error]:bg-red-500/20 in-data-[type=error]:text-red-400",
    "in-data-[type=info]:bg-primary/25 in-data-[type=info]:text-primary",
    "in-data-[type=warning]:bg-amber-400/20 in-data-[type=warning]:text-amber-300",
  ].join(" "),
  content: "flex min-w-0 flex-1 flex-col gap-0.5",
  title: "text-[15px] leading-snug font-semibold",
  description: "text-[13px] leading-snug text-white/70",
  // No transition classes on the buttons: sonner's `[data-sonner-toast] > * { transition: opacity }` replaces them.
  actionButton:
    "inline-flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-safe:active:scale-95",
  cancelButton:
    "inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-white/75 outline-none hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white",
  // Only rendered where closeButton is on (admin site, or a toast that asks for it); sits at the end of the row.
  closeButton:
    "order-last -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white",
}

const TOASTER_STYLE = {
  "--width": "min(92vw, 26rem)",
  "--toast-plain-chip": `url("data:image/svg+xml,${encodeURIComponent(PLAIN_ICON_SVG)}") center / 1.25rem no-repeat, rgb(255 255 255 / 0.1)`,
} as CSSProperties

const SAFE_TOP = "env(safe-area-inset-top, 0px)"

const Toaster = ({ toastOptions, ...props }: ToasterProps) => (
  <Sonner
    // The toast carries its own colours in both app themes. Pinning sonner to "light" keeps its dark-theme
    // description and close-button colours (which ignore `unstyled`) out of the way.
    theme="light"
    position="top-center"
    offset={{ top: `calc(${SAFE_TOP} + 12px)` }}
    // left/right 0: the list spans the screen and each toast centres itself at --width (92vw on phones).
    mobileOffset={{ top: `calc(${SAFE_TOP} + 10px)`, left: 0, right: 0 }}
    gap={10}
    visibleToasts={3}
    duration={TOAST_DURATION.default}
    swipeDirections={["top", "left", "right"]}
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

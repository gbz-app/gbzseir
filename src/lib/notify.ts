import { toast, type ExternalToast } from "sonner";

/** House toast durations (ms). The Toaster uses `default`; errors and warnings stay a little longer. */
export const TOAST_DURATION = { default: 3500, error: 5000 } as const;

export type NotifyOptions = Omit<ExternalToast, "description">;

/**
 * Every key is set so that reusing an `id` fully replaces the visible toast: sonner merges updates into the
 * existing toast, so an omitted `description` or `action` would otherwise carry over from the previous one.
 */
function build(description: string | undefined, duration: number, options?: NotifyOptions): ExternalToast {
  return { description, duration, action: undefined, cancel: undefined, icon: undefined, ...options };
}

/**
 * Toasts with the house defaults, for new code. The look itself comes from the global <Toaster />.
 * @example notify.success("Favorilere eklendi", "Favorilerim'den ulaşabilirsin", { action: { label: "Gör", onClick } })
 */
export const notify = {
  success: (title: string, description?: string, options?: NotifyOptions) =>
    toast.success(title, build(description, TOAST_DURATION.default, options)),
  info: (title: string, description?: string, options?: NotifyOptions) =>
    toast.info(title, build(description, TOAST_DURATION.default, options)),
  warning: (title: string, description?: string, options?: NotifyOptions) =>
    toast.warning(title, build(description, TOAST_DURATION.error, options)),
  error: (title: string, description?: string, options?: NotifyOptions) =>
    toast.error(title, build(description, TOAST_DURATION.error, options)),
  dismiss: (id?: string | number) => toast.dismiss(id),
};

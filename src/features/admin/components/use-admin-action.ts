"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "../lib/action-result";

type RunOptions<T> = {
  /** Toast on success (default: the action's message or "Kaydedildi"). Pass false for no toast. */
  success?: string | false;
  onSuccess?: (data: T) => void;
  onError?: (error: string, hint?: string) => void;
  /** router.refresh() after success (only needed when the action does not revalidate the current path). */
  refresh?: boolean;
};

/**
 * Runs an admin Server Action inside a transition: pending state, Turkish toasts, optional refresh.
 * Resolves with the result (null on network failure) so callers can close dialogs etc.
 */
export function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = React.useCallback(
    <T>(action: () => Promise<ActionResult<T>>, opts: RunOptions<T> = {}): Promise<ActionResult<T> | null> =>
      new Promise((resolve) => {
        startTransition(async () => {
          try {
            const res = await action();
            if (res.ok) {
              if (opts.success !== false) toast.success(opts.success ?? res.message ?? "Kaydedildi");
              // Saved, but e.g. the public app could not be refreshed: always shown, also with success: false.
              if (res.warning) toast.warning(res.warning, { duration: 8000 });
              opts.onSuccess?.(res.data);
              if (opts.refresh) router.refresh();
            } else {
              toast.error(res.error);
              opts.onError?.(res.error, res.hint);
            }
            resolve(res);
          } catch {
            toast.error("Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.");
            resolve(null);
          }
        });
      }),
    [router],
  );

  return { pending, run };
}

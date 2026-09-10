"use client";

import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  /** Next 16 passes `retry`; older builds passed `reset`. */
  retry?: () => void;
  reset?: () => void;
};

/** Shared body of the services error.tsx boundaries (Turkish copy, retry, offline hint). */
export function RouteError({ error, retry, reset, title, description }: RouteErrorProps & { title?: string; description?: string }) {
  const [offline, setOffline] = React.useState(false);
  React.useEffect(() => {
    console.error(error);
    const id = window.setTimeout(() => setOffline(typeof navigator !== "undefined" && navigator.onLine === false), 0);
    return () => window.clearTimeout(id);
  }, [error]);
  return (
    <div className="px-4 pt-6 pb-nav">
      <ErrorState offline={offline} title={offline ? undefined : title} description={offline ? undefined : description} onRetry={retry ?? reset} />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { APP_NAME } from "@/config/site";

/**
 * Fallback for every (main) page without its own error.tsx (detail pages whose query throws on a DB error, unexpected
 * client render errors). It renders inside the (main) layout, so the bottom nav stays; retry re-fetches the segment.
 */
export default function MainError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <>
      <PageHeader title={APP_NAME} backHref="/" />
      <ErrorState description="Bu sayfa şu an yüklenemedi. Bağlantını kontrol edip tekrar dene." onRetry={retry} className="flex-1 justify-center" />
    </>
  );
}

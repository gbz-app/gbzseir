"use client";

import { useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { routes } from "@/core/routes";

export default function FirmError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <>
      <PageHeader title="Firma" backHref={routes.businesses.root()} />
      <ErrorState description="Firma bilgileri şu an yüklenemedi. Bağlantını kontrol edip tekrar dene." onRetry={retry} className="flex-1 justify-center" />
    </>
  );
}

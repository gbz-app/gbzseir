"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

/** Error boundary for the admin content area (the sidebar stays usable). */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);
  return (
    <div className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
      <ErrorState
        title="Bu yönetim ekranı yüklenemedi"
        description="Veriler alınırken bir sorun oluştu. Tekrar dene; sorun sürerse bağlantını kontrol et."
        onRetry={() => retry()}
      />
    </div>
  );
}

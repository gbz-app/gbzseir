import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Root 404: unmatched URLs and notFound() outside (main). Rendered by the root layout only, on both deployments, so it
 * stays neutral: no app shell, one link to "/" (the admin site's proxy sends "/" on to /admin).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 pt-safe pb-safe">
      <EmptyState
        icon={SearchX}
        title="Sayfa bulunamadı"
        description="Aradığın sayfa kaldırılmış ya da adresi değişmiş olabilir."
        actionLabel="Ana sayfa"
        actionHref="/"
      />
    </main>
  );
}

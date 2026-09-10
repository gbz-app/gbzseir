import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { routes } from "@/core/routes";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";

export type ComingSoonProps = {
  /** Page title (header + document title are set by the page). */
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Back fallback for deep links. */
  backHref?: string;
  /** Tab root pages already have the TopBar: render without PageHeader. */
  withHeader?: boolean;
};

/** Temporary "Yakında" page used by route placeholders until the feature agent implements them. */
export function ComingSoon({ title, description, icon = Sparkles, backHref = routes.home(), withHeader = true }: ComingSoonProps) {
  return (
    <>
      {withHeader ? <PageHeader title={title} backHref={backHref} /> : <h1 className="sr-only">{title}</h1>}
      <EmptyState
        icon={icon}
        title="Yakında"
        description={description ?? `"${title}" bölümü hazırlanıyor. Çok yakında burada olacak.`}
        actionLabel="Ana sayfaya dön"
        actionHref={routes.home()}
        className="flex-1 justify-center"
      />
    </>
  );
}

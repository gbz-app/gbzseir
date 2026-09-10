"use client";

import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";

/** Content of an error.tsx boundary: header + ErrorState with retry. */
export function RouteError({ title, backHref, retry, withHeader = true }: { title: string; backHref?: string; retry?: () => void; withHeader?: boolean }) {
  return (
    <>
      {withHeader ? <PageHeader title={title} backHref={backHref} /> : null}
      <ErrorState onRetry={retry} description="Bu sayfa şu an yüklenemedi. İnternet bağlantını kontrol edip tekrar dene." />
    </>
  );
}

/** Content of a not-found.tsx for poi detail pages. */
export function PoiNotFound({
  title,
  description,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <>
      <PageHeader title={title} backHref={backHref} />
      <EmptyState icon={MapPin} title={title} description={description} actionHref={backHref} actionLabel={backLabel} />
    </>
  );
}

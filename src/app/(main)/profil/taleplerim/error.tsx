"use client";

import { RouteError, type RouteErrorProps } from "@/features/services/components/route-error";

export default function Error(props: RouteErrorProps) {
  return <RouteError {...props} title="Taleplerin yüklenemedi" description="Bağlantında bir sorun olabilir. Biraz sonra tekrar dene." />;
}

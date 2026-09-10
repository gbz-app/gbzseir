"use client";

import { RouteError, type RouteErrorProps } from "@/features/services/components/route-error";

export default function Error(props: RouteErrorProps) {
  return <RouteError {...props} title="Talep ekranı açılamadı" description="Cevapların bu cihazda kayıtlı. Biraz sonra tekrar dene." />;
}

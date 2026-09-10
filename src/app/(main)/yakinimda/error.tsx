"use client";

import { RouteError } from "@/features/nearby/components/route-states";

export default function NearbyError({ retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <RouteError title="Yakınımda" withHeader={false} retry={retry ?? reset} />;
}

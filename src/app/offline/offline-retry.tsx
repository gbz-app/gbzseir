"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Reloads when the connection returns; manual retry button. */
export function OfflineRetry() {
  React.useEffect(() => {
    const onOnline = () => window.location.reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return (
    <Button className="mt-6" size="lg" onClick={() => window.location.reload()}>
      <RotateCw /> Tekrar dene
    </Button>
  );
}

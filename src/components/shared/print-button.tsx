"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Yazdır", className }: { label?: string; className?: string }) {
  return (
    <Button type="button" size="lg" className={className} onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}

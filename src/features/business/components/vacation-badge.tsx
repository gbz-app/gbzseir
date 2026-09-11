import { TreePalm } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Calm amber "Tatilde" chip for tatil modu (firm header, QR menu, search, cards). Server-safe. */
export function VacationBadge({ className, label = "Tatilde" }: { className?: string; label?: string }) {
  return (
    <Badge variant="warning" className={cn("h-6 px-2.5", className)}>
      <TreePalm aria-hidden />
      {label}
    </Badge>
  );
}

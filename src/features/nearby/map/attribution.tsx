import { cn } from "@/lib/utils";

/** Required map attribution: "© OpenStreetMap katkıcıları · OpenFreeMap". Server-safe. */
export function MapAttribution({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "pointer-events-auto rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground shadow-sm backdrop-blur",
        className,
      )}
    >
      ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
        OpenStreetMap katkıcıları
      </a>{" "}
      ·{" "}
      <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
        OpenFreeMap
      </a>
    </p>
  );
}

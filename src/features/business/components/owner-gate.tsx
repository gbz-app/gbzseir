import Link from "next/link";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/core/routes";

/** Shown on an owner tool that does not fit the business type (e.g. rooms for a cafe). */
export function WrongVerticalNote({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-card px-5 py-8 text-center shadow-soft ring-1 ring-foreground/[0.05]">
      <Info className="size-9 text-primary/60" strokeWidth={1.5} aria-hidden />
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed">{text}</p>
      <Button asChild variant="outline" className="mt-5">
        <Link href={routes.business.edit()}>İşletme türünü değiştir</Link>
      </Button>
    </div>
  );
}

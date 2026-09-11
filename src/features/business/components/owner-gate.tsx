import Link from "next/link";
import { ArrowLeftRight, Info, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/core/routes";

/**
 * Shown on an owner tool that does not fit the active business type (e.g. rooms for a cafe). When the owner has
 * another business the tool fits, offers switching to it first. The type itself is locked: changes go through support.
 */
export function WrongVerticalNote({ text, alternatives = [], next }: { text: string; alternatives?: Array<{ id: string; name: string }>; next?: string }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-card px-5 py-8 text-center">
      <Info className="size-9 text-primary/60" strokeWidth={1.5} aria-hidden />
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed">{text}</p>
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        {alternatives.map((b) => (
          <Button key={b.id} asChild>
            <a href={routes.business.select(b.id, next)}>
              <ArrowLeftRight /> {b.name} işletmesine geç
            </a>
          </Button>
        ))}
        <Button asChild variant="secondary">
          <Link href={routes.content.help("isletme")}>
            <MessageCircle /> İşletme türü için destek ekibine yaz
          </Link>
        </Button>
      </div>
    </div>
  );
}

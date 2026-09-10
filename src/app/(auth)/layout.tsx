import Link from "next/link";
import { X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { routes } from "@/core/routes";

/** Auth screens: no bottom nav, centered narrow column. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-safe pb-safe">
      <header className="flex h-(--topbar-h) items-center justify-between">
        <Link href={routes.home()} className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <Link
          href={routes.home()}
          aria-label="Kapat ve ana sayfaya dön"
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-5" />
        </Link>
      </header>
      <main className="flex flex-1 flex-col pb-6">{children}</main>
    </div>
  );
}

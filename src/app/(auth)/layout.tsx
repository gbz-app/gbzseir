import Link from "next/link";
import { X } from "lucide-react";
import { APP_NAME } from "@/config/site";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { routes } from "@/core/routes";

/** Auth screens: no bottom nav, centered narrow column. On the separate admin site there is nothing to "close" to. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-safe pb-safe">
      <header className="flex h-(--topbar-h) items-center justify-between">
        <Link
          href={IS_ADMIN_SITE ? routes.admin.root() : routes.home()}
          className="rounded-lg font-heading text-lg font-bold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {APP_NAME}
          {IS_ADMIN_SITE ? <span className="ml-1.5 text-muted-foreground">Yönetim</span> : null}
        </Link>
        {IS_ADMIN_SITE ? null : (
          <Link
            href={routes.home()}
            aria-label="Kapat ve ana sayfaya dön"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </Link>
        )}
      </header>
      <main className="flex flex-1 flex-col pb-6">{children}</main>
    </div>
  );
}

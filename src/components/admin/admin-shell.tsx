"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardList,
  Database,
  Flag,
  FolderTree,
  Home,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  Megaphone,
  Menu,
  Newspaper,
  Settings,
  Store,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/site";
import { routes, isRouteActive } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type AdminNavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: routes.admin.root(), label: "Genel bakış", icon: LayoutDashboard, exact: true },
  { href: routes.admin.analytics(), label: "Canlı ve analitik", icon: Activity },
  { href: routes.admin.listings(), label: "İlanlar", icon: Tag },
  { href: routes.admin.reports(), label: "Şikayetler", icon: Flag },
  { href: routes.admin.businesses(), label: "İşletmeler", icon: Store },
  { href: routes.admin.serviceCategories(), label: "Hizmet kategorileri", icon: FolderTree },
  { href: routes.admin.requests(), label: "Hizmet talepleri", icon: ClipboardList },
  { href: routes.admin.users(), label: "Kullanıcılar", icon: Users },
  { href: routes.admin.support(), label: "Destek mesajları", icon: LifeBuoy },
  { href: routes.admin.finance(), label: "Muhasebe", icon: Wallet },
  { href: routes.admin.news(), label: "Haberler", icon: Newspaper },
  { href: routes.admin.announcements(), label: "Duyurular", icon: Megaphone },
  { href: routes.admin.places(), label: "Yerler", icon: MapPinned },
  { href: routes.admin.data(), label: "Veri sağlığı", icon: Database },
  { href: routes.admin.settings(), label: "Ayarlar", icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Yönetim menüsü" className="flex flex-col gap-0.5">
      {ADMIN_NAV.map((item) => {
        const active = item.exact ? pathname === item.href : isRouteActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href={routes.admin.root()} className="flex items-center gap-2 px-3 font-heading text-base font-bold">
      {APP_NAME} <span className="rounded-md bg-highlight-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-highlight-foreground uppercase">Yönetim</span>
    </Link>
  );
}

/** Desktop-friendly admin layout: fixed sidebar (lg+), sheet menu on small screens. */
export function AdminShell({ adminName, children }: { adminName: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="min-h-dvh bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar py-4 lg:flex">
        <Brand />
        <div className="mt-6 flex-1 overflow-y-auto px-3">
          <NavList />
        </div>
        <div className="border-t px-4 pt-3 text-xs text-muted-foreground">
          <p className="truncate font-semibold text-foreground">{adminName}</p>
          <Link href={routes.home()} className="mt-1 inline-flex items-center gap-1.5 hover:underline">
            <Home className="size-3.5" /> Uygulamaya dön
          </Link>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-3 pt-safe backdrop-blur lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menüyü aç">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-4 pt-safe">
            <SheetTitle className="sr-only">Yönetim menüsü</SheetTitle>
            <div className="py-3">
              <Brand />
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <Brand />
      </header>

      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

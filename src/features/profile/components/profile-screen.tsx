"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Briefcase,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock,
  FileText,
  Heart,
  LogOut,
  Megaphone,
  Plus,
  Settings,
  Store,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { APP_NAME, CITY } from "@/config/site";
import { initials } from "@/core/format";
import { routes } from "@/core/routes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-provider";
import { useMyBusinesses } from "@/lib/auth/hooks";
import { useUnreadNotifications } from "@/lib/notifications/use-unread-notifications";
import { readString, writeString } from "@/lib/storage";

const PROMO_DISMISSED_KEY = "gebzem.profile.businessPromoDismissed";

type RowProps = { icon: LucideIcon; label: string; href?: string; onClick?: () => void; badge?: number; destructive?: boolean };

/** Full-width list row: line icon, label, optional badge, chevron. */
function Row({ icon: Icon, label, href, onClick, badge, destructive }: RowProps) {
  const body = (
    <>
      <Icon className="size-6 shrink-0" strokeWidth={1.6} aria-hidden />
      <span className="flex-1 text-base">{label}</span>
      {badge ? (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground tabular-nums">{badge > 99 ? "99+" : badge}</span>
      ) : null}
      {!destructive ? <ChevronRight className="size-5 shrink-0 text-foreground/60" aria-hidden /> : null}
    </>
  );
  const cls = cn(
    "flex min-h-16 w-full items-center gap-4 rounded-lg py-4 text-left outline-none transition-opacity hover:opacity-75 focus-visible:ring-3 focus-visible:ring-ring/50",
    destructive && "text-destructive",
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      )}
    </li>
  );
}

type Promo = { title: string; text: string; cta: string; href: string; icon: LucideIcon; dismissible?: boolean };

/** Dark brand banner with a white pill button and a tilted icon tile. */
function PromoCard({ promo, onDismiss }: { promo: Promo; onDismiss?: () => void }) {
  const Icon = promo.icon;
  return (
    <section
      className="relative overflow-hidden rounded-3xl p-6 text-white shadow-card"
      style={{
        backgroundImage:
          "linear-gradient(135deg, color-mix(in oklch, var(--primary) 38%, black) 0%, color-mix(in oklch, var(--primary) 80%, black) 58%, var(--primary) 100%)",
      }}
    >
      <span aria-hidden className="pointer-events-none absolute -right-12 -bottom-20 size-60 rounded-full border-[30px] border-white/10" />
      <span aria-hidden className="pointer-events-none absolute top-5 right-24 size-20 rounded-full border-[10px] border-white/10" />
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Kapat"
          className="absolute top-3 right-3 z-10 flex size-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
        >
          <X className="size-5" aria-hidden />
        </button>
      ) : null}
      <div className="relative flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="pr-8 text-2xl leading-tight font-semibold text-balance">{promo.title}</h2>
          <p className="mt-1.5 text-[15px] leading-snug text-white/75">{promo.text}</p>
          <Link
            href={promo.href}
            className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-neutral-900 transition-transform outline-none active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-white/50"
          >
            {promo.cta}
          </Link>
        </div>
        <span aria-hidden className="flex size-20 shrink-0 rotate-6 items-center justify-center rounded-2xl bg-white/85 text-primary">
          <Icon className="size-10" strokeWidth={1.75} />
        </span>
      </div>
    </section>
  );
}

/** G1/G2 - Profil: header, user row, context banner (business / join) and settings-style rows. */
export function ProfileScreen({ applicationsOpen }: { applicationsOpen: boolean }) {
  const router = useRouter();
  const { user, loading, profile, signOut } = useAuth();
  const { businesses, approved } = useMyBusinesses();
  const { count } = useUnreadNotifications();
  const [promoDismissed, setPromoDismissed] = React.useState(() => readString(PROMO_DISMISSED_KEY) === "1");

  const header = (
    <div className="flex h-14 items-center justify-end gap-1">
      <Link
        href={routes.content.help()}
        aria-label="Yardım"
        className="flex size-11 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CircleHelp className="size-6" strokeWidth={1.6} aria-hidden />
      </Link>
      <Link
        href={routes.profile.settings()}
        aria-label="Ayarlar"
        className="flex size-11 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Settings className="size-6" strokeWidth={1.6} aria-hidden />
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col px-4 pt-safe pb-6">
        {header}
        <Skeleton className="h-8 w-28 rounded-lg" />
        <div className="mt-5 flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
        </div>
        <Skeleton className="mt-6 h-44 w-full rounded-3xl" />
        <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const first = profile?.full_name?.trim().split(/\s+/)[0];
  const liveCount = businesses.filter((b) => b.status === "approved").length;
  const unfinished = businesses.find((b) => b.status === "pending" || b.status === "rejected");

  let promo: Promo | null = null;
  if (!user) {
    promo = {
      title: `${APP_NAME}'e katıl`,
      text: "İlan ver, usta bul, favorilerini tek yerde topla.",
      cta: "Giriş yap",
      href: routes.auth.login(routes.profile.root()),
      icon: UserRound,
    };
  } else if (approved) {
    promo = {
      title: "İşletme paneli",
      text: liveCount > 1 ? `${liveCount} işletme · talepler ve istatistikler` : `${approved.name} · talepler ve istatistikler`,
      cta: "Panele git",
      href: routes.business.root(),
      icon: Store,
    };
  } else if (unfinished) {
    promo = {
      title: "İşletmen henüz yayında değil",
      text: "Bilgilerini tamamla, işletme sayfan hemen yayına girsin.",
      cta: "Tamamla",
      href: routes.business.applyEdit(unfinished.id),
      icon: Clock,
    };
  } else if (!promoDismissed && applicationsOpen) {
    promo = {
      title: "İşletmen mi var?",
      text: `Ücretsiz işletme hesabı aç, ${CITY.name}lilere ulaş.`,
      cta: "Hemen başla",
      href: routes.business.intro(),
      icon: Store,
      dismissible: true,
    };
  }

  const dismissPromo = () => {
    writeString(PROMO_DISMISSED_KEY, "1");
    setPromoDismissed(true);
  };

  const logout = async () => {
    await signOut();
    toast.success("Çıkış yapıldı");
    router.replace(routes.home());
    router.refresh();
  };

  return (
    <div className="flex flex-col px-4 pt-safe pb-6">
      {header}
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Profil</h1>

      <Link
        href={user ? routes.profile.edit() : routes.auth.login(routes.profile.root())}
        className="mt-4 flex items-center gap-4 rounded-2xl py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar className="size-16">
          {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-brand-soft text-lg font-semibold text-primary">
            {user && profile?.full_name ? initials(profile.full_name) : <UserRound className="size-7" strokeWidth={1.6} aria-hidden />}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xl font-medium">{user ? (first ? `Merhaba, ${first}` : "Merhaba") : "Hesabına giriş yap"}</span>
          <span className="block text-[15px] text-muted-foreground">{user ? "Profilini görüntüle" : "Giriş yap veya kayıt ol"}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-foreground/60" aria-hidden />
      </Link>

      {user && profile && !profile.onboarded ? (
        <Link href={routes.auth.profile(routes.profile.root())} className="mt-3 rounded-2xl bg-highlight-soft px-4 py-3 text-sm font-semibold">
          Profilini tamamla: adını ve mahalleni ekle.
        </Link>
      ) : null}

      {promo ? (
        <div className="mt-5">
          <PromoCard promo={promo} onDismiss={promo.dismissible ? dismissPromo : undefined} />
        </div>
      ) : null}

      {user ? (
        <ul className="mt-3 divide-y">
          <Row icon={UserRound} label="Kişisel bilgiler" href={routes.profile.edit()} />
          <Row icon={Tag} label="İlanlarım" href={routes.profile.listings()} />
          {approved ? <Row icon={Briefcase} label="İş ilanlarım" href={routes.profile.jobs()} /> : null}
          {businesses.length > 0 && applicationsOpen && !businesses.some((b) => b.status === "suspended") ? <Row icon={Plus} label="Yeni işletme ekle" href={routes.business.apply()} /> : null}
          <Row icon={ClipboardList} label="Hizmet taleplerim" href={routes.profile.requests()} />
          <Row icon={Heart} label="Favorilerim" href={routes.profile.favorites()} />
          <Row icon={Bell} label="Bildirimler" href={routes.profile.notifications()} badge={count} />
        </ul>
      ) : null}

      <p className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Uygulama</p>
      <ul className="divide-y">
        <Row icon={Settings} label="Ayarlar" href={routes.profile.settings()} />
        <Row icon={CircleHelp} label="Yardım ve destek" href={routes.content.help()} />
        <Row icon={Megaphone} label="Reklam ve iş birliği" href={routes.content.help("reklam")} />
        <Row icon={FileText} label="Yasal metinler" href={routes.legal.kvkk()} />
      </ul>

      {user ? (
        <ul className="mt-2 border-t">
          <Row icon={LogOut} label="Çıkış yap" onClick={logout} destructive />
        </ul>
      ) : null}
    </div>
  );
}

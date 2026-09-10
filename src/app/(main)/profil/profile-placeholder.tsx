"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Briefcase, ChevronRight, ClipboardList, Heart, LogOut, Settings, Store, Tag, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-provider";
import { useMyBusinesses } from "@/lib/auth/hooks";
import { BusinessBadge } from "@/components/shared/badges";
import { formatPhoneTR, initials } from "@/core/format";
import { fromSupabasePhone } from "@/core/phone";
import { routes } from "@/core/routes";

function Row({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-13 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function ProfilePlaceholder() {
  const { user, loading, profile, signOut } = useAuth();
  const { isOwner, approved } = useMyBusinesses();
  const router = useRouter();

  if (loading) {
    return (
      <div className="px-4 py-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const phone = fromSupabasePhone(user?.phone ?? profile?.phone ?? null);

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <h1 className="sr-only">Profil</h1>
      {user ? (
        <section className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <Avatar className="size-16">
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-brand-soft text-lg font-bold text-primary">{initials(profile?.full_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">{profile?.full_name || "İsimsiz kullanıcı"}</p>
            {phone ? <p className="text-sm text-muted-foreground tabular-nums">{formatPhoneTR(phone)}</p> : null}
            {approved ? <BusinessBadge className="mt-1.5" /> : null}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-card p-5 text-center shadow-soft ring-1 ring-foreground/[0.06]">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <UserRound className="size-7" aria-hidden />
          </div>
          <p className="mt-3 text-lg font-extrabold">Hesabına giriş yap</p>
          <p className="mt-1 text-sm text-muted-foreground">İlan vermek, usta bulmak ve favorilerini kaydetmek için.</p>
          <Button asChild size="lg" className="mt-4 w-full">
            <Link href={routes.auth.login(routes.profile.root())}>Giriş yap / Kayıt ol</Link>
          </Button>
        </section>
      )}

      {user && profile && !profile.onboarded ? (
        <Link href={routes.auth.profile(routes.profile.root())} className="rounded-2xl bg-highlight-soft px-4 py-3 text-sm font-semibold">
          Profilini tamamla: adını ve mahalleni ekle.
        </Link>
      ) : null}

      {user ? (
        <>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
            <Row href={routes.profile.listings()} icon={Tag} label="İlanlarım" />
            {approved ? <Row href={routes.profile.jobs()} icon={Briefcase} label="İş ilanlarım" /> : null}
            <Row href={routes.profile.requests()} icon={ClipboardList} label="Hizmet taleplerim" />
            <Row href={routes.profile.favorites()} icon={Heart} label="Favorilerim" />
            <Row href={routes.profile.notifications()} icon={Bell} label="Bildirimler" />
            <Row href={routes.profile.edit()} icon={UserRound} label="Profili düzenle" />
          </ul>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
            {approved ? (
              <Row href={routes.business.root()} icon={Store} label="İşletme paneli" />
            ) : (
              <Row href={routes.business.intro()} icon={Store} label={isOwner ? "İşletme başvurum" : "İşletme hesabına geç"} />
            )}
          </ul>
        </>
      ) : null}

      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
        <Row href={routes.profile.settings()} icon={Settings} label="Ayarlar" />
      </ul>

      {user ? (
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={async () => {
            await signOut();
            toast.success("Çıkış yapıldı");
            router.replace(routes.home());
            router.refresh();
          }}
        >
          <LogOut /> Çıkış yap
        </Button>
      ) : null}
    </div>
  );
}

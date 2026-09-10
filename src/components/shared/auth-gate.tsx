"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import { useCurrentPath } from "@/lib/auth/hooks";
import { routes } from "@/core/routes";
import { EmptyState } from "./empty-state";
import { PageSkeleton } from "./skeletons";

export type AuthGateProps = {
  children: React.ReactNode;
  /** Where to return after login (default: current path + query). */
  next?: string;
  /** Redirect to /giris immediately instead of showing the prompt card. */
  redirect?: boolean;
  /** Also require a completed profile (onboarded). Sends to /giris/profil otherwise. */
  requireProfile?: boolean;
  title?: string;
  description?: string;
  /** Shown while the session is being read. */
  fallback?: React.ReactNode;
};

/**
 * Client-side guard for pages/sections that need an account. Prefer the server helper requireAuth()
 * in Server Components; use this inside client-only screens.
 */
export function AuthGate({
  children,
  next,
  redirect,
  requireProfile,
  title = "Devam etmek için giriş yap",
  description = "Telefon numaranla saniyeler içinde giriş yapabilir ya da hesap oluşturabilirsin.",
  fallback,
}: AuthGateProps) {
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const currentPath = useCurrentPath();
  const target = next ?? currentPath;
  const needsProfile = !!requireProfile && !!user && !profileLoading && !!profile && !profile.onboarded;

  React.useEffect(() => {
    if (loading) return;
    if (!user && redirect) router.replace(routes.auth.login(target));
    else if (needsProfile) router.replace(routes.auth.profile(target));
  }, [loading, user, redirect, needsProfile, router, target]);

  if (loading || (requireProfile && user && profileLoading)) return <>{fallback ?? <PageSkeleton />}</>;
  if (!user) {
    if (redirect) return <>{fallback ?? <PageSkeleton />}</>;
    return (
      <EmptyState
        icon={LogIn}
        title={title}
        description={description}
        action={
          <Button asChild size="lg">
            <Link href={routes.auth.login(target)}>Giriş yap / Kayıt ol</Link>
          </Button>
        }
      />
    );
  }
  if (needsProfile) return <>{fallback ?? <PageSkeleton />}</>;
  return <>{children}</>;
}

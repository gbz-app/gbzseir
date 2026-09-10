"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { listingsHref, type ListingsQuery } from "../filters";

type NavState = {
  /** Navigate to /ilanlar with the given filters inside a transition (old results stay visible, dimmed). */
  navigate: (q: ListingsQuery, opts?: { push?: boolean }) => void;
  pending: boolean;
};

const NavContext = React.createContext<NavState | null>(null);

export function ListingsNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const navigate = React.useCallback(
    (q: ListingsQuery, opts?: { push?: boolean }) => {
      const href = listingsHref(q);
      startTransition(() => {
        if (opts?.push) router.push(href, { scroll: false });
        else router.replace(href, { scroll: false });
      });
    },
    [router],
  );

  const value = React.useMemo(() => ({ navigate, pending }), [navigate, pending]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useListingsNav(): NavState {
  const ctx = React.useContext(NavContext);
  if (!ctx) throw new Error("useListingsNav must be used inside <ListingsNavProvider>");
  return ctx;
}

/** Wraps the result list: dims it while a filter navigation is pending. */
export function ListingsResults({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useListingsNav();
  return (
    <div aria-busy={pending || undefined} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50", className)}>
      {children}
    </div>
  );
}

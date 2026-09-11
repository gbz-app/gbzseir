"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { routes } from "@/core/routes";
import { useMyBusinesses } from "@/lib/auth/hooks";
import type { ListingType } from "../constants";

/** Floating black pill above the bottom nav (like the "Harita" pill of /kesfet), safe-area aware. */
function Fab({ href, label }: { href: string; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+1.25rem)] z-30 mx-auto flex w-full max-w-2xl justify-center px-4">
      <Link
        href={href}
        className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-foreground pr-5 pl-4 text-[15px] font-semibold text-background transition-transform outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-5" aria-hidden />
        {label}
      </Link>
    </div>
  );
}

/** Owners of an approved business only (normal users cannot post job ads). */
function JobPostFab() {
  const { approved } = useMyBusinesses();
  if (!approved) return null;
  return <Fab href={routes.listings.postJob()} label="İş ilanı ver" />;
}

/** "İlan ver" on İkinci El (every user; guests log in first), "İş ilanı ver" on İş İlanları (business owners). */
export function PostListingFab({ type }: { type: ListingType }) {
  if (type === "job") return <JobPostFab />;
  return <Fab href={routes.listings.postClassified()} label="İlan ver" />;
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { TABLES, type FavoriteTargetType } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { routes } from "@/core/routes";

export type FavoriteButtonProps = {
  /** 'listing' (2. el + iş ilanı) | 'business' | 'poi'. */
  targetType: FavoriteTargetType;
  /** uuid of the target. */
  targetId: string;
  /** Known initial state (skips the lookup). */
  initialFavorited?: boolean;
  /** 'ghost' for headers, 'overlay' for white round button on top of images. */
  variant?: "ghost" | "overlay";
  className?: string;
  onChange?: (favorited: boolean) => void;
};

/** Heart toggle stored in `favorites` (user_id, target_type, target_id). Guests are sent to login and come back. */
export function FavoriteButton({ targetType, targetId, initialFavorited, variant = "ghost", className, onChange }: FavoriteButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [fav, setFav] = React.useState<boolean>(!!initialFavorited);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!user || initialFavorited !== undefined) return;
    let active = true;
    createClient()
      .from(TABLES.favorites)
      .select("target_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .then(({ count }) => {
        if (active) setFav((count ?? 0) > 0);
      });
    return () => {
      active = false;
    };
  }, [user, targetType, targetId, initialFavorited]);

  const toggle = async () => {
    if (!user) {
      router.push(routes.auth.login(`${window.location.pathname}${window.location.search}`));
      return;
    }
    if (busy) return;
    const next = !fav;
    setFav(next);
    setBusy(true);
    const supabase = createClient();
    const { error } = next
      ? await supabase.from(TABLES.favorites).insert({ user_id: user.id, target_type: targetType, target_id: targetId })
      : await supabase.from(TABLES.favorites).delete().eq("user_id", user.id).eq("target_type", targetType).eq("target_id", targetId);
    setBusy(false);
    // 23505 = already favorited (unique violation): treat as success.
    if (error && error.code !== "23505") {
      setFav(!next);
      toast.error("İşlem yapılamadı, lütfen tekrar dene.");
      return;
    }
    onChange?.(next);
    toast.success(next ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={fav}
      aria-label={fav ? "Favorilerden çıkar" : "Favorilere ekle"}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] outline-none active:scale-90 focus-visible:ring-3 focus-visible:ring-ring/50",
        variant === "overlay" ? "bg-white/90 text-foreground shadow-soft backdrop-blur hover:bg-white dark:bg-black/60 dark:hover:bg-black/70" : "hover:bg-muted",
        className,
      )}
    >
      <Heart className={cn("size-5 transition-colors", fav ? "fill-rose-500 text-rose-500" : "text-current")} aria-hidden />
    </button>
  );
}

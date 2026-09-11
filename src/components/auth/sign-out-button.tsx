"use client";

import * as React from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";

/** Sign out, then open `to` with a full navigation (fresh cookies on the server). */
export function SignOutButton({ to, label = "Çıkış yap", className }: { to: string; label?: string; className?: string }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      type="button"
      size="lg"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        window.location.assign(to);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <LogOut />} {label}
    </Button>
  );
}

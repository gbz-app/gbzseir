import { Smartphone } from "lucide-react";

/**
 * Portrait-only app: on phones held sideways (landscape + short viewport) this full-screen notice covers the UI.
 * Installed PWAs are also locked to portrait through the manifest `orientation`.
 */
export function LandscapeLock() {
  return (
    <div
      role="status"
      className="fixed inset-0 z-[200] hidden flex-col items-center justify-center gap-3 bg-background px-6 text-center [@media(orientation:landscape)_and_(max-height:540px)]:flex"
    >
      <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <Smartphone className="size-8" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-lg font-semibold">Telefonunu dik tut</p>
      <p className="max-w-xs text-sm text-muted-foreground">Uygulama dikey ekranda kullanılmak için tasarlandı.</p>
    </div>
  );
}

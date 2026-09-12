import { BottomNav } from "@/components/layout/bottom-nav";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";

/**
 * Main app shell: content + BottomNav + install prompt. No first-launch intro (owner, 12.09: the launch splash is the only
 * opening screen). The home header (TopBar) is rendered by the home page itself: a path-dependent header here made the
 * cached home HTML differ from the client (React hydration error 418).
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bg relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <a
        href="#icerik"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        İçeriğe geç
      </a>
      <AnnouncementBanner />
      <main id="icerik" className="flex flex-1 flex-col">
        {children}
      </main>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}

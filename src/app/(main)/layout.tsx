import { TopBar } from "@/components/layout/top-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";

/** Main app shell: TopBar (tab roots only) + content + BottomNav + onboarding + install prompt. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bg relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <a
        href="#icerik"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        İçeriğe geç
      </a>
      <TopBar />
      <AnnouncementBanner />
      <main id="icerik" className="flex flex-1 flex-col">
        {children}
      </main>
      <BottomNav />
      <OnboardingGate />
      <InstallPrompt />
    </div>
  );
}

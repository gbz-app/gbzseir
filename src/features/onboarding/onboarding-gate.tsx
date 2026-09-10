"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Loader2, LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE } from "@/config/site";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import {
  BusinessIllustration,
  ListingsIllustration,
  LocationIllustration,
  MapIllustration,
  ServiceRequestIllustration,
  SkylineIllustration,
} from "./illustrations";
import { getOnboardingPhase, isOnboardingForced, markOnboarded, setOnboardingPhase, useOnboardingPhase } from "./storage";

type Slide = {
  title: string;
  text: string;
  note?: string;
  /** Background tint mixed into the page background (works in light and dark). */
  tint: string;
  Illustration: (p: { active: boolean }) => React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    title: `${APP_TAGLINE}`,
    text: "Nöbetçi eczaneden iş ilanına, ustadan gezilecek yerlere; şehirle ilgili her şey tek uygulamada.",
    tint: "#14B8A6",
    Illustration: SkylineIllustration,
  },
  {
    title: "Yakınındakileri anında bul",
    text: "Nöbetçi eczane, en yakın cami, otobüs durakları ve gezilecek yerler haritada. Tek dokunuşla ara ya da yol tarifi al.",
    tint: "#3B82F6",
    Illustration: MapIllustration,
  },
  {
    title: "Gebze'nin esnafı burada",
    text: "Kuaförden tesisatçıya, restorandan oto servise. Onaylı işletmeleri keşfet, yorumlarına bak, tek tuşla ara.",
    note: "İşletmen mi var? Profilinden ücretsiz işletme hesabı aç.",
    tint: "#F59E0B",
    Illustration: BusinessIllustration,
  },
  {
    title: "Al, sat, iş bul",
    text: "İkinci el eşyanı sat, Gebze ve OSB'lerdeki iş ilanlarına göz at. Mesajlaşmayla uğraşma, doğrudan ara.",
    tint: "#10B981",
    Illustration: ListingsIllustration,
  },
  {
    title: "Ustayı sen arama, usta seni bulsun",
    text: "Birkaç soruyu cevapla, uygun firmalar talebini görsün. İlgilenenlerin profiline bak, istediğini seç.",
    tint: "#8B5CF6",
    Illustration: ServiceRequestIllustration,
  },
  {
    title: "Sana yakın olanları gösterelim",
    text: "Konumunu sadece yakınındaki eczane, cami ve işletmeleri göstermek için kullanırız. Kimseyle paylaşmayız.",
    tint: "#0F766E",
    Illustration: LocationIllustration,
  },
];

const SPLASH_MS = 1100;

/**
 * A1-A2: first-visit onboarding, only on "/" and only when the session started at "/" (deep links never see it).
 * Mounted in the (main) layout; the pre-paint script decides before hydration (no flash of the home page).
 */
export function OnboardingGate() {
  const pathname = usePathname();
  const phase = useOnboardingPhase();

  // Re-watch (resetOnboarding) while the app is open.
  React.useEffect(() => {
    const open = () => {
      if (window.location.pathname === "/" && isOnboardingForced()) setOnboardingPhase("slides");
    };
    window.addEventListener("gebzem:onboarding-reset", open);
    if (pathname === "/" && getOnboardingPhase() === "none" && isOnboardingForced()) setOnboardingPhase("slides");
    return () => window.removeEventListener("gebzem:onboarding-reset", open);
  }, [pathname]);

  // Splash -> slides.
  React.useEffect(() => {
    if (phase !== "splash") return;
    if (pathname !== "/") {
      setOnboardingPhase("none");
      return;
    }
    const t = window.setTimeout(() => setOnboardingPhase("slides"), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [phase, pathname]);

  return (
    <>
      {/* Pre-hydration splash (visible only while html[data-onboarding="pending"]). */}
      <div className="gz-onboarding-splash fixed inset-0 z-[100] items-center justify-center bg-background" aria-hidden>
        <SplashContent />
      </div>
      {phase === "splash" ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background" role="status" aria-label={`${APP_NAME} açılıyor`}>
          <SplashContent />
        </div>
      ) : null}
      {phase === "slides" ? <OnboardingSlides onDone={() => finish()} /> : null}
    </>
  );
}

function finish() {
  markOnboarded();
  setOnboardingPhase("none");
}

function SplashContent() {
  return (
    <div className="flex flex-col items-center gap-5">
      <LogoMark className="size-24 animate-pop" />
      <p className="font-heading text-3xl font-extrabold tracking-tight">{APP_NAME}</p>
      <span className="relative mt-2 block h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="absolute inset-y-0 left-0 w-1/2 animate-[gz-splash-bar_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
      </span>
    </div>
  );
}

function OnboardingSlides({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = React.useState(0);
  const [dragX, setDragX] = React.useState(0);
  const [closing, setClosing] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const drag = React.useRef<{ x: number; y: number; id: number; locked: "x" | "y" | null } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const location = useApproxLocation();
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  React.useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const go = React.useCallback((i: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, i))), []);

  const close = React.useCallback(() => {
    setClosing(true);
    window.setTimeout(onDone, 280);
  }, [onDone]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (pickerOpen) return;
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "Escape") close();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.locked === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.locked === "x") {
      const atEdge = (index === 0 && dx > 0) || (last && dx < 0);
      setDragX(atEdge ? dx * 0.3 : dx);
    }
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.locked !== "x") {
      setDragX(0);
      return;
    }
    const dx = e.clientX - d.x;
    const width = rootRef.current?.clientWidth ?? 360;
    if (dx < -Math.min(60, width * 0.18)) go(index + 1);
    else if (dx > Math.min(60, width * 0.18)) go(index - 1);
    setDragX(0);
  };

  const useLocation = async () => {
    const coords = await location.request();
    if (coords) {
      toast.success("Konumun alındı");
      close();
    } else {
      setPickerOpen(true);
    }
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${APP_NAME} tanıtımı`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col overflow-hidden outline-none transition-[background-color,opacity] duration-700 ease-out",
        closing ? "opacity-0 duration-300" : "animate-fade-in",
      )}
      style={{ backgroundColor: `color-mix(in oklch, var(--background) 86%, ${slide.tint})` }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col pt-safe pb-safe">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="flex items-center gap-2 font-heading text-base font-extrabold">
            <LogoMark className="size-7" /> {APP_NAME}
          </span>
          {!last ? (
            <Button variant="ghost" onClick={close} className="text-muted-foreground">
              Atla
            </Button>
          ) : null}
        </div>

        <div
          className="relative flex-1 touch-pan-y overflow-hidden select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div
            className={cn("flex h-full", dragX === 0 && "transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]")}
            style={{ transform: `translateX(calc(${-index * 100}% + ${dragX}px))` }}
          >
            {SLIDES.map((s, i) => {
              const active = i === index;
              return (
                <section
                  key={s.title}
                  aria-hidden={!active}
                  aria-roledescription="slayt"
                  aria-label={`${i + 1} / ${SLIDES.length}`}
                  className="flex h-full w-full shrink-0 flex-col items-center px-7"
                >
                  <div className="flex max-h-[44dvh] w-full flex-1 items-center justify-center py-2">
                    <div className="aspect-[320/260] h-full max-h-[300px] w-auto max-w-full" key={active ? "on" : "off"}>
                      {Math.abs(i - index) <= 1 ? <s.Illustration active={active} /> : null}
                    </div>
                  </div>
                  <div className={cn("w-full pb-4 text-center", active && "animate-slide-up")}>
                    <h2 className="text-[1.65rem] leading-tight font-extrabold text-balance">{s.title}</h2>
                    <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-balance text-muted-foreground">{s.text}</p>
                    {s.note ? <p className="mx-auto mt-3 max-w-sm text-sm font-semibold text-primary">{s.note}</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="px-6 pt-2 pb-5">
          <div className="mb-5 flex justify-center gap-2" role="tablist" aria-label="Slaytlar">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}. slayt`}
                onClick={() => go(i)}
                className="flex h-6 items-center"
              >
                <span className={cn("block h-2 rounded-full transition-all duration-300", i === index ? "w-6 bg-primary" : "w-2 bg-foreground/20")} />
              </button>
            ))}
          </div>

          {last ? (
            <div className="flex flex-col gap-2.5">
              <Button size="lg" className="h-13 text-base" onClick={useLocation} disabled={location.status === "locating"}>
                {location.status === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                Konumumu kullan
              </Button>
              <Button size="lg" variant="outline" className="h-13 text-base" onClick={() => setPickerOpen(true)}>
                <MapPin /> Mahallemi kendim seçeceğim
              </Button>
              {location.error ? <p className="text-center text-sm text-destructive">{location.error}</p> : null}
              <Button variant="link" className="text-muted-foreground" onClick={close}>
                Şimdilik geç
              </Button>
            </div>
          ) : (
            <Button size="lg" className="h-13 w-full text-base" onClick={() => go(index + 1)}>
              İleri <ArrowRight />
            </Button>
          )}
        </div>
      </div>

      <NeighbourhoodPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        showTrigger={false}
        title="Mahalleni seç"
        onChange={(n) => {
          if (n) {
            toast.success(`${n.name} seçildi`);
            close();
          }
        }}
      />
    </div>
  );
}

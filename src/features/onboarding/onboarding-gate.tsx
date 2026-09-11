"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE } from "@/config/site";
import { prefersReducedMotion } from "@/lib/platform";
import { DiscoverArt, FirmsArt, NearbyArt, PersonalizeArt, WelcomeArt } from "./illustrations";
import { enter } from "./motion";
import { PersonalizeStep } from "./personalize-step";
import { getOnboardingPhase, isOnboardingForced, markOnboarded, setOnboardingPhase, useOnboardingPhase } from "./storage";

type Step = {
  key: string;
  /** Short name for the progress segment and the slide label (screen readers). */
  label: string;
  kicker: string;
  title: string;
  text: string;
  /** Square illustration; the last step shows the personalisation rows instead. */
  Art?: () => React.ReactNode;
};

const STEPS: Step[] = [
  {
    key: "hosgeldin",
    label: "Hoş geldin",
    kicker: "Hoş geldin",
    title: APP_TAGLINE,
    text: "Nöbetçi eczaneden ustaya, ilandan etkinliğe; şehirle ilgili her şey tek uygulamada.",
    Art: WelcomeArt,
  },
  {
    key: "yakinimda",
    label: "Nöbetçi eczane ve Yakınımda",
    kicker: "Yakınımda",
    title: "Nöbetçi eczane bir dokunuş uzakta",
    text: "En yakın eczaneyi, camiyi ve durağı haritada gör. Tek dokunuşla ara ya da yol tarifi al.",
    Art: NearbyArt,
  },
  {
    key: "firmalar",
    label: "Firmalar ve ustalar",
    kicker: "Firmalar ve ustalar",
    title: "Esnafı bul, ustayı çağır",
    text: "Gebze'nin işletmelerini keşfet. Usta mı arıyorsun? Talebini bırak, uygun ustalar sana dönsün.",
    Art: FirmsArt,
  },
  {
    key: "kesfet",
    label: "İlanlar, etkinlikler ve rehber",
    kicker: "İlanlar ve şehir rehberi",
    title: "İlanlar, işler ve etkinlikler",
    text: "2. el ilanlara ve iş fırsatlarına göz at, şehirdeki etkinlikleri ve gezilecek yerleri keşfet.",
    Art: DiscoverArt,
  },
  {
    key: "ayarla",
    label: "Kişiselleştir",
    kicker: "Son adım",
    title: "Sana göre ayarlayalım",
    text: "Hepsi isteğe bağlı. İstersen sonra Ayarlar'dan değiştirebilirsin.",
  },
];

const LAST = STEPS.length - 1;
const SPLASH_MS = 700;
const CLOSE_MS = 320;

/** Lavender ground shared by the splash and the slides (theme tokens only, so dark mode follows). */
const GROUND = "bg-background bg-[linear-gradient(180deg,var(--bg-top)_0%,var(--background)_62%)]";

/** Page transition (track, parallax layers, progress fill): a gentle spring, instant while dragging or reduced motion. */
const GLIDE = "transition-[transform,opacity] duration-[650ms] ease-ob-spring group-data-[drag=1]/ob:transition-none motion-reduce:transition-none";

/**
 * --off = this slide's distance from the current position (0 = centred; fractions while dragging).
 * The illustration moves at about 0.7x the text and shrinks/fades with the distance (parallax depth).
 */
const DIST = "min(1, max(var(--off), var(--off) * -1))";
const PARALLAX: React.CSSProperties = {
  transform: `translate3d(calc(var(--off) * -30%), 0, 0) scale(calc(1 - ${DIST} * 0.12))`,
  opacity: `calc(1 - ${DIST} * 0.75)`,
};
const TEXT_FADE: React.CSSProperties = { opacity: `calc(1 - ${DIST} * 0.6)` };

/**
 * First-visit onboarding, only on "/" and only when the session started at "/" (deep links never see it).
 * Mounted in the (main) layout; the pre-paint script decides before hydration (no flash of the home page).
 * Phases: splash (CSS, visible from the first paint while html[data-onboarding="pending"]) -> slides -> none.
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
      {/* The splash is pure CSS: shown only while html[data-onboarding="pending"] (first paint until the slides). */}
      <div className={cn("gz-onboarding-splash fixed inset-0 z-[100] items-center justify-center", GROUND)} role="status" aria-label={`${APP_NAME} açılıyor`}>
        <SplashContent />
      </div>
      {phase === "slides" ? <OnboardingSlides onDone={finish} /> : null}
    </>
  );
}

function finish() {
  markOnboarded();
  setOnboardingPhase("none");
}

function SplashContent() {
  return (
    <div className="flex flex-col items-center">
      <span className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 rounded-media bg-primary/40 opacity-0 motion-safe:animate-ob-halo" aria-hidden />
        <span className="relative flex size-full items-center justify-center rounded-media bg-primary text-primary-foreground motion-safe:animate-ob-mark">
          <MapPin className="size-10" strokeWidth={2.25} aria-hidden />
        </span>
      </span>
      <p className="mt-5 font-heading text-[2rem] leading-none font-bold tracking-tight motion-safe:animate-ob-content" style={{ "--ob-d": "140ms" } as React.CSSProperties}>
        {APP_NAME}
      </p>
    </div>
  );
}

/** iOS-style rubber band: resistance grows with the distance (never passes the width). */
function rubberBand(dx: number, width: number) {
  return Math.sign(dx) * (1 - 1 / ((Math.abs(dx) * 0.55) / width + 1)) * width;
}

type Drag = { id: number; x: number; y: number; w: number; axis: "x" | "y" | null; lastX: number; lastT: number; v: number };

function OnboardingSlides({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = React.useState(0);
  /** How the current slide was reached: a swiped-in slide is already on screen, so it skips its entrance. */
  const [via, setVia] = React.useState<"tap" | "swipe">("tap");
  const [closing, setClosing] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const suppressClickUntil = React.useRef(0);
  const closingRef = React.useRef(false);
  const last = index === LAST;
  const step = STEPS[index];

  React.useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const go = React.useCallback((i: number, how: "tap" | "swipe" = "tap") => {
    setVia(how);
    setIndex(Math.max(0, Math.min(LAST, i)));
  }, []);

  const close = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onDone, prefersReducedMotion() ? 0 : CLOSE_MS);
  }, [onDone]);

  /** Drag offset as a fraction of the slide width, written straight to CSS (no re-render per pointer move). */
  const setDragFraction = (fraction: number | null) => {
    const root = rootRef.current;
    if (!root) return;
    if (fraction === null) {
      root.style.removeProperty("--dragf");
      delete root.dataset.drag;
    } else {
      root.style.setProperty("--dragf", String(fraction));
      root.dataset.drag = "1";
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys typed in the neighbourhood sheet (a portal) bubble here through React: ignore them.
    if (!rootRef.current?.contains(e.target as Node)) return;
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "Escape") close();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.target as Node)) return; // from the sheet portal
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, w: e.currentTarget.clientWidth || 360, axis: null, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.axis !== "x") return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = 0.8 * ((e.clientX - d.lastX) / dt) + 0.2 * d.v;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const atEdge = (index === 0 && dx > 0) || (index === LAST && dx < 0);
    setDragFraction((atEdge ? rubberBand(dx, d.w) : dx) / d.w);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.axis !== "x") return;
    suppressClickUntil.current = e.timeStamp + 400; // the drag must not also press a button under the finger
    const dx = e.clientX - d.x;
    const far = Math.min(72, d.w * 0.2);
    const flick = Math.abs(d.v) > 0.45 && Math.sign(d.v) === Math.sign(dx) && Math.abs(dx) > 12;
    setDragFraction(null);
    if (dx < 0 && index < LAST && (dx < -far || flick)) go(index + 1, "swipe");
    else if (dx > 0 && index > 0 && (dx > far || flick)) go(index - 1, "swipe");
  };

  const onPointerCancel = () => {
    drag.current = null;
    setDragFraction(null);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (e.timeStamp < suppressClickUntil.current) {
      e.preventDefault();
      e.stopPropagation();
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
        "group/ob fixed inset-0 z-[100] flex flex-col overflow-hidden outline-none transition-opacity duration-300 ease-out",
        GROUND,
        closing && "pointer-events-none opacity-0",
      )}
      style={{ "--idx": String(index) } as React.CSSProperties}
    >
      <Glow />

      <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col pr-safe pl-safe">
        {/* Story-style progress: one segment per step; the next one fills along with the finger while swiping. */}
        <div className="flex items-center gap-2 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] pr-2 pl-4 motion-safe:animate-ob-fade">
          <div role="group" aria-label="Tanıtım adımları" className="flex flex-1 gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1}. adım: ${s.label}`}
                aria-current={i === index ? "step" : undefined}
                className="flex h-11 flex-1 items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                <span className="relative block h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className={cn("absolute inset-0 origin-left rounded-full bg-primary", GLIDE)}
                    style={{ transform: `scaleX(clamp(0, calc(var(--idx) - var(--dragf, 0) - ${i} + 1), 1))` }}
                  />
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Tanıtımı atla"
            className={cn(
              "h-11 shrink-0 rounded-full px-4 text-[15px] font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60",
              last && "invisible",
            )}
          >
            Atla
          </button>
        </div>

        <div
          className="relative min-h-0 flex-1 touch-pan-y overflow-hidden select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClickCapture={onClickCapture}
        >
          <div className={cn("flex h-full", GLIDE)} style={{ transform: "translate3d(calc(var(--idx) * -100% + var(--dragf, 0) * 100%), 0, 0)" }}>
            {STEPS.map((s, i) => (
              <Slide key={s.key} step={s} i={i} active={i === index} entering={i === index && via === "tap"} near={Math.abs(i - index) <= 1} />
            ))}
          </div>
        </div>

        <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] motion-safe:animate-ob-content" style={{ "--ob-d": "180ms" } as React.CSSProperties}>
          <button
            type="button"
            onClick={last ? close : () => go(index + 1)}
            aria-label={last ? "Başla ve uygulamaya geç" : "Devam et, sonraki adım"}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground text-base font-semibold text-background outline-none transition-[background-color,scale] hover:bg-foreground/90 focus-visible:ring-4 focus-visible:ring-ring/60 active:scale-[0.985]"
          >
            <span key={last ? "start" : "next"} className="flex items-center gap-2 motion-safe:animate-ob-fade">
              {last ? "Başla" : "Devam"}
              <ArrowRight className="size-5" aria-hidden />
            </span>
          </button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {`Adım ${index + 1} / ${STEPS.length}. ${step.title}`}
      </p>
    </div>
  );
}

function Slide({ step, i, active, entering, near }: { step: Step; i: number; active: boolean; entering: boolean; near: boolean }) {
  const { Art } = step;
  const kicker = enter("fade", 40);
  const title = enter("content", 110);
  const text = enter("content", 180);
  const heading = (
    <div className={cn("text-center", GLIDE)} style={TEXT_FADE}>
      <p className={cn("text-[13px] font-bold tracking-[0.08em] text-primary uppercase", kicker.className)} style={kicker.style}>
        {step.kicker}
      </p>
      <h2 className={cn("mt-2 text-[1.75rem] leading-[1.12] font-extrabold text-balance", title.className)} style={title.style}>
        {step.title}
      </h2>
      <p className={cn("mx-auto mt-3 max-w-[22rem] text-[15px] leading-relaxed text-pretty text-muted-foreground", text.className)} style={text.style}>
        {step.text}
      </p>
    </div>
  );

  return (
    <section
      aria-roledescription="slayt"
      aria-label={`${i + 1} / ${STEPS.length}: ${step.label}`}
      inert={!active}
      data-on={active}
      data-enter={entering ? 1 : 0}
      className="group/s relative flex h-full w-full shrink-0 flex-col overflow-hidden px-6"
      style={{ "--off": `calc(${i} - var(--idx) + var(--dragf, 0))` } as React.CSSProperties}
    >
      {Art ? (
        <>
          {/* Size container, so the art is a true square (the largest that fits, at most 22rem) on any screen shape. */}
          <div className={cn("flex min-h-0 flex-1 items-center justify-center pt-1 [container-type:size]", GLIDE)} style={PARALLAX}>
            <div className="aspect-square w-[min(100cqw,100cqh,22rem)] shrink-0">{near ? <Art /> : null}</div>
          </div>
          <div className="shrink-0 pt-4 pb-1">{heading}</div>
        </>
      ) : (
        // touch-pan-y again: a scroll container re-enables horizontal panning for touches inside it (Chrome), which
        // would cancel the pointer stream and break the swipe back from this step.
        <div className="no-scrollbar -mx-6 flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain px-6">
          <div className="my-auto w-full py-2">
            <div className={GLIDE} style={PARALLAX}>
              {near ? <PersonalizeArt /> : <div className="h-24" />}
            </div>
            <div className="mt-3">{heading}</div>
            <PersonalizeStep className="mt-5" />
          </div>
        </div>
      )}
    </section>
  );
}

/** Two soft purple glows that drift slowly and move against the swipe (the deepest parallax layer). */
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={cn("absolute -top-[22%] -left-[35%] aspect-square w-[130%] max-w-[46rem]", GLIDE, "duration-[900ms]")}
        style={{ transform: "translate3d(calc((var(--idx) - var(--dragf, 0)) * 6%), 0, 0)" }}
      >
        <div
          className="size-full rounded-full motion-safe:animate-ob-drift"
          style={{ backgroundImage: "radial-gradient(closest-side, color-mix(in oklch, var(--primary) 24%, transparent), transparent)" }}
        />
      </div>
      <div
        className={cn("absolute -right-[40%] bottom-[4%] aspect-square w-[120%] max-w-[42rem]", GLIDE, "duration-[900ms]")}
        style={{ transform: "translate3d(calc((var(--idx) - var(--dragf, 0)) * -7%), 0, 0)" }}
      >
        <div
          className="size-full rounded-full motion-safe:animate-ob-drift"
          style={{
            backgroundImage: "radial-gradient(closest-side, color-mix(in oklch, var(--primary) 14%, transparent), transparent)",
            animationDelay: "-8s",
          }}
        />
      </div>
    </div>
  );
}

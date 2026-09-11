/**
 * Onboarding art: flat compositions made of Lucide icons and simple shapes (no photos, no emoji, no borders or
 * shadows). Colours come only from theme tokens (primary, card, foreground "ink", success, destructive), so the
 * same art works in light and dark mode. Positions are percentages of a square stage and sizes use cqw, so each
 * composition scales with the space it gets. Motion: see ./motion.tsx.
 */
import * as React from "react";
import {
  BadgeCheck,
  BellRing,
  Briefcase,
  BusFront,
  CalendarDays,
  Check,
  Compass,
  Cross,
  Hammer,
  LocateFixed,
  MapPin,
  MoonStar,
  Navigation,
  Phone,
  Scissors,
  Star,
  Store,
  Tag,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IDLE, M } from "./motion";

const vars = (v: Record<string, string>) => v as React.CSSProperties;

function Stage({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative size-full select-none @container">
      {children}
    </div>
  );
}

/** Soft concentric discs behind a composition (they breathe while the slide is on screen). */
function Halo() {
  return (
    <div aria-hidden className="absolute inset-[5%]">
      <M idle="breathe" className="size-full rounded-full bg-primary/[0.07]" />
      <div className="absolute inset-[16%] rounded-full bg-primary/[0.08]" />
    </div>
  );
}

type Dot = { x: number; y: number; s: number; i: number };

/** Small twinkling purple dots. */
function Sparkles({ dots }: { dots: Dot[] }) {
  return dots.map((p) => (
    <M
      key={`${p.x}-${p.y}`}
      idle="twinkle"
      i={p.i}
      className="absolute aspect-square rounded-full bg-primary"
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.s}%` }}
    />
  ));
}

/* ------------------------------------------------------------------ 1. Welcome */

const ORBIT = [Cross, Store, Wrench, Tag, Briefcase, CalendarDays].map((icon, k) => {
  const a = ((-90 + k * 60) * Math.PI) / 180;
  return { icon, left: `${(50 + 50 * Math.cos(a)).toFixed(2)}%`, top: `${(50 + 50 * Math.sin(a)).toFixed(2)}%` };
});

/** The brand pin in the middle, the city's services orbiting around it. */
export function WelcomeArt() {
  return (
    <Stage label="Eczane, işletmeler, ustalar, ilanlar, iş ilanları ve etkinlikler tek uygulamada">
      <Halo />
      <svg aria-hidden viewBox="0 0 100 100" className="absolute top-[14%] left-[14%] size-[72%] text-primary">
        <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.7" strokeLinecap="round" strokeDasharray="0.1 2.4" />
      </svg>
      <div className="absolute inset-[14%]">
        <M idle="orbit" className="size-full">
          {ORBIT.map(({ icon: Icon, left, top }, k) => (
            <div key={`${left}-${top}`} className="absolute w-[23%] -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
              <M idle="orbitRev">
                <M enter="pop" d={300 + k * 90}>
                  <span className="flex aspect-square items-center justify-center rounded-[32%] bg-card text-primary">
                    <Icon className="size-[46%]" strokeWidth={2} aria-hidden />
                  </span>
                </M>
              </M>
            </div>
          ))}
        </M>
      </div>
      <div className="absolute top-1/2 left-1/2 w-[30%] -translate-x-1/2 -translate-y-1/2">
        <M idle="ping" i={900} className="absolute inset-0 rounded-[32%] bg-primary/40" />
        <M enter="pop" d={60} idle="float" i={1300} className="relative">
          <span className="flex aspect-square items-center justify-center rounded-[32%] bg-primary text-primary-foreground">
            <MapPin className="size-[46%]" strokeWidth={2.25} aria-hidden />
          </span>
        </M>
      </div>
      <Sparkles
        dots={[
          { x: 9, y: 16, s: 2.4, i: 0 },
          { x: 88, y: 12, s: 1.8, i: 900 },
          { x: 91, y: 80, s: 2.6, i: 1700 },
          { x: 6, y: 84, s: 1.8, i: 600 },
        ]}
      />
    </Stage>
  );
}

/* ------------------------------------------------------------------ 2. Nöbetçi eczane + Yakınımda */

function Pin({ icon: Icon, x, y, w, featured, d }: { icon: LucideIcon; x: number; y: number; w: number; featured?: boolean; d: number }) {
  const fill = featured ? "bg-primary" : "bg-foreground";
  return (
    <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%` }}>
      <M enter="drop" d={d} idle="float" i={d + 900} style={vars({ "--ob-fy": "-3px" })}>
        <span className="flex flex-col items-center">
          <span className={cn("relative z-10 flex aspect-square w-full items-center justify-center rounded-full", fill, featured ? "text-primary-foreground" : "text-background")}>
            <Icon className="size-[50%]" strokeWidth={2.25} aria-hidden />
          </span>
          <span className={cn("-mt-[20%] aspect-square w-[34%] rotate-45 rounded-[25%]", fill)} />
        </span>
      </M>
    </div>
  );
}

/** A small city map: you, a dotted route to the duty pharmacy, a mosque and a stop, and the result card. */
export function NearbyArt() {
  return (
    <Stage label="Haritada konumun; yakındaki nöbetçi eczane, cami ve durak">
      <M enter="rise" className="absolute top-[2%] left-[8%] size-[84%]">
        <div aria-hidden className="relative size-full overflow-hidden rounded-[10%] bg-card">
          <div className="absolute top-[58%] -left-[5%] h-[7%] w-[110%] bg-primary/[0.08]" />
          <div className="absolute -top-[5%] left-[52%] h-[110%] w-[7%] bg-primary/[0.08]" />
          <div className="absolute top-[27%] -left-[5%] h-[6%] w-[64%] bg-primary/[0.08]" />
          <div className="absolute top-[82%] left-[42%] h-[5%] w-[80%] -rotate-[24deg] bg-primary/[0.06]" />
          <div className="absolute top-[6%] left-[66%] h-[40%] w-[26%] rounded-[18%] bg-primary/[0.05]" />
          <div className="absolute top-[40%] left-[8%] h-[12%] w-[34%] rounded-[20%] bg-primary/[0.05]" />
          <div className="absolute top-[70%] left-[8%] h-[22%] w-[36%] rounded-[16%] bg-primary/[0.05]" />
          <M enter="fade" d={650} className="absolute inset-0">
            <svg viewBox="0 0 100 100" className="size-full text-primary">
              <path
                d="M55.5 61.5 V30 H27"
                className={IDLE.march}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="0.1 3.4"
              />
            </svg>
          </M>
        </div>

        <Pin icon={Cross} x={27} y={30} w={15} featured d={380} />
        <Pin icon={MoonStar} x={79} y={30} w={11} d={520} />
        <Pin icon={BusFront} x={85} y={61.5} w={11} d={640} />

        <div className="absolute top-[15%] left-[36%]">
          <M enter="pop" d={760}>
            <span className="block rounded-full bg-primary/12 px-[2.8cqw] py-[1.1cqw] text-[3.2cqw] font-bold whitespace-nowrap text-primary">Nöbetçi</span>
          </M>
        </div>

        <div className="absolute top-[61.5%] left-[55.5%] w-[10%] -translate-x-1/2 -translate-y-1/2">
          <M idle="ping" i={0} className="absolute inset-0 rounded-full bg-primary/35" />
          <M idle="ping" i={1300} className="absolute inset-0 rounded-full bg-primary/35" />
          <M enter="pop" d={220} className="relative">
            <span className="block aspect-square rounded-full bg-primary/25 p-[14%]">
              <span className="block size-full rounded-full bg-card p-[16%]">
                <span className="block size-full rounded-full bg-primary" />
              </span>
            </span>
          </M>
        </div>
      </M>

      <div className="absolute top-[71%] right-[5%] left-[5%]">
        <M enter="rise" d={820}>
          <div className="flex items-center gap-[3cqw] rounded-[6cqw] bg-foreground p-[3cqw] text-background">
            <span className="flex size-[12cqw] shrink-0 items-center justify-center rounded-[3.6cqw] bg-primary text-primary-foreground">
              <Cross className="size-[55%]" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[4.3cqw] leading-tight font-bold">Nöbetçi eczane</span>
              <span className="mt-[0.8cqw] flex items-center gap-[1.5cqw] text-[3.3cqw] text-background/70">
                <span className="size-[1.8cqw] shrink-0 rounded-full bg-success" />
                650 m · Şimdi açık
              </span>
            </span>
            <span className="flex size-[10.5cqw] shrink-0 items-center justify-center rounded-full bg-background text-foreground">
              <Navigation className="size-[45%]" strokeWidth={2.25} aria-hidden />
            </span>
          </div>
        </M>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ 3. Firmalar, ustalar, hizmet talebi */

const FIRMS = [
  { icon: Scissors, name: "Kuaför", meta: "4,9 · 350 m", pos: "top-[19%] left-[13%]" },
  { icon: UtensilsCrossed, name: "Restoran", meta: "4,7 · 1,2 km", pos: "top-[40%] left-[6%]" },
  { icon: Wrench, name: "Tesisatçı", meta: "4,8 · 2,4 km", pos: "top-[61%] left-[15%]" },
] as const;

/** Business cards sliding in, the red "Usta mı arıyorsun?" pill and the answers to a service request. */
export function FirmsArt() {
  return (
    <Stage label="Onaylı işletme kartları; usta arayanlara hizmet talebi ve gelen teklifler">
      <Halo />
      {FIRMS.map(({ icon: Icon, name, meta, pos }, k) => (
        <div key={name} className={cn("absolute w-[79%]", pos)}>
          <M enter="slide" d={140 + k * 130} idle="float" i={1300 + k * 700} style={vars({ "--ob-fy": "-4px" })}>
            <div className="flex items-center gap-[3cqw] rounded-[5.5cqw] bg-card p-[2.8cqw] pr-[3.2cqw]">
              <span className="flex size-[12cqw] shrink-0 items-center justify-center rounded-[3.6cqw] bg-primary/10 text-primary">
                <Icon className="size-[50%]" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-[1.2cqw] text-[4.1cqw] leading-tight font-bold">
                  <span className="truncate">{name}</span>
                  <BadgeCheck className="size-[4.2cqw] shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
                </span>
                <span className="mt-[0.8cqw] flex items-center gap-[1cqw] text-[3.2cqw] text-muted-foreground">
                  <Star className="size-[3.2cqw] shrink-0 fill-current text-primary" strokeWidth={2} aria-hidden />
                  {meta}
                </span>
              </span>
              <span className="flex size-[9.5cqw] shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <Phone className="size-[45%]" strokeWidth={2.25} aria-hidden />
              </span>
            </div>
          </M>
        </div>
      ))}

      <div className="absolute top-[4%] left-[5%] -rotate-[5deg]">
        <M enter="pop" d={650} idle="float" i={1500}>
          <span className="flex items-center gap-[1.6cqw] rounded-full bg-destructive px-[3.8cqw] py-[2.2cqw] text-[3.9cqw] font-bold whitespace-nowrap text-white">
            <Hammer className="size-[4.4cqw]" strokeWidth={2.25} aria-hidden />
            Usta mı arıyorsun?
          </span>
        </M>
      </div>

      <div className="absolute right-[5%] bottom-[3%]">
        <M enter="pop" d={1050} idle="float" i={2100}>
          <span className="flex items-center gap-[1.8cqw] rounded-full bg-card py-[2cqw] pr-[3.4cqw] pl-[2cqw] text-[3.4cqw] font-semibold whitespace-nowrap">
            <span className="flex size-[5.6cqw] items-center justify-center rounded-full bg-success text-success-foreground">
              <Check className="size-[65%]" strokeWidth={3} aria-hidden />
            </span>
            3 usta ilgileniyor
          </span>
        </M>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ 4. İlanlar, iş ilanları, etkinlikler, rehber */

type Tone = "primary" | "card" | "ink";
/** Neighbouring cards alternate tones, so overlapping cards stay readable without borders or shadows. */
const TONES: Record<Tone, { card: string; soft: string }> = {
  primary: { card: "bg-primary text-primary-foreground", soft: "bg-primary-foreground/15" },
  card: { card: "bg-card text-card-foreground", soft: "bg-primary/10 text-primary" },
  ink: { card: "bg-foreground text-background", soft: "bg-background/15" },
};

const FAN: { icon: LucideIcon; label: string; chip: string; r: number; x: number; tone: Tone }[] = [
  { icon: Tag, label: "2. el", chip: "2.750 TL", r: -26, x: -16, tone: "primary" },
  { icon: Briefcase, label: "İş ilanı", chip: "Servisli", r: -9, x: -5, tone: "card" },
  { icon: CalendarDays, label: "Etkinlik", chip: "Cumartesi", r: 9, x: 5, tone: "ink" },
  { icon: Compass, label: "Şehir rehberi", chip: "Gezilecek yer", r: 26, x: 16, tone: "card" },
];

/** Four cards fanning out like a hand: second-hand, job, event and city guide. */
export function DiscoverArt() {
  return (
    <Stage label="İkinci el ilan, iş ilanı, etkinlik ve şehir rehberi kartları">
      <Halo />
      <M idle="sway" i={1400} className="absolute inset-0 origin-[50%_100%]">
        {FAN.map(({ icon: Icon, label, chip, r, x, tone }, k) => {
          const t = TONES[tone];
          return (
            <div
              key={label}
              className="absolute top-[24%] left-[33.5%] h-[54%] w-[33%] origin-[50%_150%]"
              style={{ transform: `translate(${x}%, 0) rotate(${r}deg)`, ...vars({ "--ob-r": `${r}deg`, "--ob-x": `${x}%` }) }}
            >
              <M enter="fan" d={120 + k * 110} className="size-full origin-[50%_150%]">
                <div className={cn("flex size-full flex-col rounded-[6cqw] p-[2.6cqw]", t.card)}>
                  <span className={cn("flex min-h-0 flex-1 items-center justify-center rounded-[4cqw]", t.soft)}>
                    <Icon className="size-[11cqw]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="mt-[2.4cqw] px-[1cqw] text-[3.4cqw] leading-tight font-bold">{label}</span>
                  <span className={cn("mt-[1.4cqw] mb-[0.8cqw] ml-[0.6cqw] w-fit rounded-full px-[2.2cqw] py-[0.9cqw] text-[2.9cqw] font-semibold whitespace-nowrap", t.soft)}>
                    {chip}
                  </span>
                </div>
              </M>
            </div>
          );
        })}
      </M>
      <Sparkles
        dots={[
          { x: 14, y: 12, s: 2.2, i: 300 },
          { x: 82, y: 9, s: 2.8, i: 1200 },
          { x: 50, y: 5, s: 1.6, i: 2000 },
          { x: 90, y: 42, s: 1.8, i: 700 },
        ]}
      />
    </Stage>
  );
}

/* ------------------------------------------------------------------ 5. Kişiselleştir (compact header art) */

/** Neighbourhood pin, a ringing bell and the locate glyph: a short visual header for the settings step. */
export function PersonalizeArt() {
  return (
    <div role="img" aria-label="Mahalle, konum ve bildirim ayarları" className="relative mx-auto flex h-24 w-full items-center justify-center">
      <M idle="breathe" className="absolute top-1/2 left-1/2 -mt-16 -ml-16 size-32 rounded-full bg-primary/[0.08]" />
      <div className="relative flex items-center">
        <M enter="pop" d={140} idle="float" i={900} style={vars({ "--ob-fy": "-4px" })}>
          <span className="flex size-14 -rotate-6 items-center justify-center rounded-[1.1rem] bg-card text-primary">
            <MapPin className="size-6" strokeWidth={2} aria-hidden />
          </span>
        </M>
        <M enter="pop" d={40} className="relative z-10 -mx-2">
          <span className="flex size-[4.5rem] items-center justify-center rounded-[1.4rem] bg-primary text-primary-foreground">
            <M idle="ring" i={800} className="origin-[50%_12%]">
              <BellRing className="size-8" strokeWidth={2} aria-hidden />
            </M>
          </span>
        </M>
        <M enter="pop" d={220} idle="float" i={1500} style={vars({ "--ob-fy": "-4px" })}>
          <span className="flex size-14 rotate-6 items-center justify-center rounded-[1.1rem] bg-card text-primary">
            <LocateFixed className="size-6" strokeWidth={2} aria-hidden />
          </span>
        </M>
      </div>
    </div>
  );
}

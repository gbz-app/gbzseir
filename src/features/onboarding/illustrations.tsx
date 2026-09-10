/**
 * Onboarding slide illustrations: flat 2D compositions made only of Lucide icons and simple shapes
 * (no custom drawings, gradients or shadows). Animations use the gz-* keyframes from globals.css, run only
 * while the slide is active (the slide remounts via `key`), and are disabled by prefers-reduced-motion.
 * Positions are percentages of the 320x260 illustration box, so the compositions scale with it.
 */
import * as React from "react";
import {
  BadgeCheck,
  Bike,
  Briefcase,
  Bus,
  CircleCheck,
  Cross,
  Landmark,
  Lock,
  MapPin,
  PaintRoller,
  Phone,
  Send,
  ShieldCheck,
  Star,
  Store,
  Truck,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type IlluProps = { active: boolean };
type Motion = { className?: string; style?: React.CSSProperties };

/** Animation class + delay, applied only while the slide is active. */
function anim(active: boolean, cls: string, delayMs = 0): Motion {
  if (!active) return {};
  return { className: cls, style: { animationDelay: `${delayMs}ms` } };
}

type Tone = "brand" | "primary" | "success" | "successSolid" | "highlight" | "info" | "card";
const TONES: Record<Tone, string> = {
  brand: "bg-brand-soft text-primary",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success-soft text-success",
  successSolid: "bg-success text-success-foreground",
  highlight: "bg-highlight-soft text-highlight-foreground",
  info: "bg-info-soft text-info",
  card: "bg-card text-primary ring-1 ring-border",
};

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative h-full w-full select-none">
      {children}
    </div>
  );
}

/** Icon inside a flat rounded box (in-flow). */
function IconBox({ icon: Icon, tone = "brand", round, className, motion }: { icon: LucideIcon; tone?: Tone; round?: boolean; className?: string; motion?: Motion }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", round ? "rounded-full" : "rounded-[28%]", TONES[tone], className, motion?.className)}
      style={motion?.style}
    >
      <Icon className="size-[54%]" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

/** Absolutely positioned IconBox. `className` sets position and width (square via aspect ratio). */
function Tile({ className, ...box }: React.ComponentProps<typeof IconBox>) {
  return (
    <div className={cn("absolute aspect-square", className)}>
      <IconBox {...box} className="h-full w-full" />
    </div>
  );
}

function Bar({ w, tone = "ink", className }: { w: string; tone?: "ink" | "muted"; className?: string }) {
  return <span className={cn("block h-2 rounded-full", tone === "ink" ? "bg-foreground/70" : "bg-muted-foreground/35", className)} style={{ width: w }} />;
}

function Backdrop() {
  return <div className="absolute top-[3%] left-[18.5%] aspect-square w-[63%] rounded-full bg-brand-soft" />;
}

/** 1. Everything in the city in one place: a landmark with pharmacy, bus, job, service and map icons around it. */
export function SkylineIllustration({ active }: IlluProps) {
  return (
    <Frame label="Eczane, ulaşım, iş ilanları, ustalar ve gezilecek yerler tek uygulamada">
      <Backdrop />
      <Tile icon={Landmark} tone="primary" className="top-[31%] left-[37.5%] w-[25%]" motion={anim(active, "animate-pop")} />
      <Tile icon={Cross} tone="success" round className="top-[9%] left-[21%] w-[14%]" motion={anim(active, "animate-float", 0)} />
      <Tile icon={Bus} tone="info" round className="top-[5%] left-[63%] w-[14%]" motion={anim(active, "animate-float", 500)} />
      <Tile icon={Briefcase} tone="highlight" round className="top-[52%] left-[12%] w-[14%]" motion={anim(active, "animate-float", 1000)} />
      <Tile icon={Wrench} tone="card" round className="top-[55%] left-[73%] w-[14%]" motion={anim(active, "animate-float", 1500)} />
      <Tile icon={MapPin} tone="card" round className="top-[78%] left-[43%] w-[14%]" motion={anim(active, "animate-float", 2000)} />
    </Frame>
  );
}

/** 2. Flat map with the user's location, nearby places dropping in and a "Nöbetçi" card sliding up. */
export function MapIllustration({ active }: IlluProps) {
  return (
    <Frame label="Harita üzerinde konumun ve yakındaki yerler">
      <div className="absolute inset-x-[7%] top-[5%] bottom-[5%] overflow-hidden rounded-[2rem] bg-brand-soft">
        <div className="absolute top-[26%] -left-[10%] h-[5%] w-[120%] -rotate-6 bg-card" />
        <div className="absolute top-[52%] -left-[10%] h-[4%] w-[120%] rotate-3 bg-card" />
        <div className="absolute top-0 left-[30%] h-full w-[4%] bg-card" />
        <div className="absolute top-0 left-[72%] h-full w-[3%] rotate-6 bg-card" />
      </div>
      <Tile icon={Cross} tone="success" round className="top-[12%] left-[16%] w-[12%]" motion={anim(active, "animate-pin-drop", 200)} />
      <Tile icon={Landmark} tone="highlight" round className="top-[10%] left-[66%] w-[12%]" motion={anim(active, "animate-pin-drop", 450)} />
      <Tile icon={Bus} tone="info" round className="top-[36%] left-[76%] w-[12%]" motion={anim(active, "animate-pin-drop", 700)} />
      <div className="absolute top-[34%] left-[46%] aspect-square w-[8%]">
        <span className={cn("absolute inset-0 rounded-full bg-info/40", active && "animate-pulse-ring")} />
        <span className="absolute inset-0 rounded-full bg-info ring-4 ring-card" />
      </div>
      <div className="absolute inset-x-[12%] top-[64%] h-[25%]">
        <div
          className={cn("flex h-full w-full items-center gap-3 rounded-2xl bg-card px-[5%] ring-1 ring-border", anim(active, "animate-slide-up", 900).className)}
          style={anim(active, "animate-slide-up", 900).style}
        >
          <IconBox icon={Cross} tone="success" round className="h-[62%] w-auto aspect-square" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar w="85%" />
            <Bar w="55%" tone="muted" />
          </span>
          <span className="rounded-full bg-highlight px-2.5 py-1 text-[11px] font-bold text-highlight-foreground">Nöbetçi</span>
        </div>
      </div>
    </Frame>
  );
}

/** 3. A verified business card with rating, "Onaylı" badge and a call button. */
export function BusinessIllustration({ active }: IlluProps) {
  const card = anim(active, "animate-slide-up", 300);
  const badge = anim(active, "animate-pop", 800);
  const call = anim(active, "animate-pop", 1100);
  return (
    <Frame label="Onaylı işletme kartı, puan ve arama butonu">
      <Backdrop />
      <div className="absolute top-[14%] left-[21%] h-[34%] w-[58%] -rotate-6 rounded-3xl bg-card/60 ring-1 ring-border" />
      <div className="absolute top-[22%] left-[19%] h-[36%] w-[62%] rotate-3 rounded-3xl bg-card/80 ring-1 ring-border" />
      <div className="absolute top-[38%] left-[13%] h-[50%] w-[74%]">
        <div className={cn("flex h-full w-full flex-col justify-between rounded-3xl bg-card p-[5%] ring-1 ring-border", card.className)} style={card.style}>
          <div className="flex items-center gap-3">
            <IconBox icon={Store} tone="primary" className="size-11" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Bar w="80%" />
              <span className="flex items-center gap-0.5 text-highlight">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-3 fill-current" strokeWidth={1.75} aria-hidden />
                ))}
                <span className="ml-1 text-[11px] font-bold text-foreground">4,8</span>
                <span className="text-[11px] text-muted-foreground">(126)</span>
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span
              className={cn("flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-primary", badge.className)}
              style={badge.style}
            >
              <BadgeCheck className="size-3.5" strokeWidth={2} aria-hidden /> Onaylı
            </span>
            <IconBox icon={Phone} tone="successSolid" round className="size-10" motion={call} />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** 4. A second-hand listing card and a job card ("Servis var · Yemek"). */
export function ListingsIllustration({ active }: IlluProps) {
  const left = anim(active, "animate-float", 0);
  const right = anim(active, "animate-float", 700);
  const chip = anim(active, "animate-pop", 900);
  return (
    <Frame label="İkinci el ilan ve iş ilanı kartları">
      <Backdrop />
      <div className="absolute top-[12%] left-[7%] h-[72%] w-[44%] -rotate-6">
        <div className={cn("flex h-full w-full flex-col gap-2 rounded-3xl bg-card p-[7%] ring-1 ring-border", left.className)} style={left.style}>
          <span className="flex flex-1 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <Bike className="size-[46%]" strokeWidth={1.75} aria-hidden />
          </span>
          <Bar w="80%" />
          <span className="text-sm font-bold text-primary">2.750 TL</span>
          <Bar w="50%" tone="muted" />
        </div>
      </div>
      <div className="absolute top-[22%] left-[49%] h-[66%] w-[45%] rotate-[5deg]">
        <div className={cn("flex h-full w-full flex-col gap-2.5 rounded-3xl bg-card p-[7%] ring-1 ring-border", right.className)} style={right.style}>
          <IconBox icon={Briefcase} tone="highlight" className="size-10" />
          <Bar w="85%" />
          <Bar w="60%" tone="muted" />
          <span
            className={cn(
              "mt-auto flex items-center justify-center gap-1 rounded-full bg-success-soft px-2 py-1.5 text-[10px] font-bold whitespace-nowrap text-success",
              chip.className,
            )}
            style={chip.style}
          >
            <Bus className="size-3" strokeWidth={2} aria-hidden /> Servis var · <Utensils className="size-3" strokeWidth={2} aria-hidden /> Yemek
          </span>
        </div>
      </div>
    </Frame>
  );
}

/** 5. Answered questions -> request sent -> three firms say "İlgileniyorum". */
export function ServiceRequestIllustration({ active }: IlluProps) {
  const list = anim(active, "animate-slide-up", 0);
  const firms: { icon: LucideIcon; tone: Tone; top: string }[] = [
    { icon: Wrench, tone: "brand", top: "12%" },
    { icon: PaintRoller, tone: "highlight", top: "39%" },
    { icon: Truck, tone: "info", top: "66%" },
  ];
  return (
    <Frame label="Talep formu firmalara gidiyor, firmalar ilgileniyor">
      <Backdrop />
      <div className="absolute top-[20%] left-[3%] h-[58%] w-[35%]">
        <div className={cn("flex h-full w-full flex-col justify-center gap-[14%] rounded-3xl bg-card px-[12%] ring-1 ring-border", list.className)} style={list.style}>
          {[0, 1, 2].map((i) => {
            const pop = anim(active, "animate-pop", 300 + i * 250);
            return (
              <span key={i} className="flex items-center gap-2">
                <CircleCheck className={cn("size-5 shrink-0 text-primary", pop.className)} style={pop.style} strokeWidth={2} aria-hidden />
                <Bar w={i === 1 ? "55%" : "75%"} />
              </span>
            );
          })}
        </div>
      </div>
      <Tile icon={Send} tone="brand" round className="top-[28%] left-[40.5%] w-[12%]" motion={anim(active, "animate-fly", 400)} />
      {firms.map((f, i) => {
        const m = anim(active, "animate-slide-up", 700 + i * 220);
        return (
          <div key={f.top} className="absolute left-[55%] h-[21%] w-[42%]" style={{ top: f.top }}>
            <div className={cn("flex h-full w-full items-center gap-2 rounded-2xl bg-card px-[6%] ring-1 ring-border", m.className)} style={m.style}>
              <IconBox icon={f.icon} tone={f.tone} round className="size-8" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <Bar w="70%" />
                <span className="w-fit rounded-full bg-success-soft px-1.5 py-0.5 text-[9px] font-bold text-success">İlgileniyorum</span>
              </span>
            </div>
          </div>
        );
      })}
    </Frame>
  );
}

/** 6. A phone with a location pin, a privacy shield and a lock. */
export function LocationIllustration({ active }: IlluProps) {
  const phone = anim(active, "animate-slide-up", 0);
  return (
    <Frame label="Konum pini ve gizlilik kalkanı">
      <Backdrop />
      <div className="absolute top-[7%] left-[33%] h-[86%] w-[34%]">
        <div className={cn("relative h-full w-full overflow-hidden rounded-[1.75rem] border-[5px] border-foreground bg-card", phone.className)} style={phone.style}>
          <div className="absolute top-[38%] -left-[20%] h-[5%] w-[140%] -rotate-12 bg-brand-soft" />
          <div className="absolute top-[70%] -left-[20%] h-[5%] w-[140%] rotate-6 bg-brand-soft" />
          <div className="absolute top-0 left-[36%] h-full w-[7%] bg-brand-soft" />
          <div className="absolute top-[3%] left-[35%] h-[3%] w-[30%] rounded-full bg-foreground/80" />
        </div>
      </div>
      <div className="absolute top-[40%] left-[42%] aspect-square w-[16%]">
        <span className={cn("absolute inset-0 rounded-full bg-primary/30", active && "animate-pulse-ring")} style={active ? { animationDelay: "600ms" } : undefined} />
        <IconBox icon={MapPin} tone="primary" round className="relative h-full w-full" motion={anim(active, "animate-pin-drop", 300)} />
      </div>
      <Tile icon={ShieldCheck} tone="success" className="top-[60%] left-[68%] w-[16%]" motion={anim(active, "animate-pop", 900)} />
      <Tile icon={Lock} tone="highlight" round className="top-[18%] left-[16%] w-[13%]" motion={anim(active, "animate-float", 400)} />
    </Frame>
  );
}

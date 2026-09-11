"use client";

import Link from "next/link";
import {
  Banknote,
  BedDouble,
  Building2,
  Bus,
  CalendarDays,
  CarTaxiFront,
  ChevronRight,
  Coffee,
  Cross,
  ExternalLink,
  Fuel,
  HeartPulse,
  Landmark,
  MoonStar,
  Newspaper,
  Pill,
  PlugZap,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CallButton } from "@/components/shared/call-button";
import type { AiCard, AiCardIcon } from "../lib/types";

const ICONS: Record<AiCardIcon, LucideIcon> = {
  duty: Cross,
  pharmacy: Pill,
  mosque: MoonStar,
  bus_stop: Bus,
  taxi: CarTaxiFront,
  atm: Banknote,
  place: Landmark,
  business: Store,
  food: UtensilsCrossed,
  cafe: Coffee,
  hotel: BedDouble,
  service: Wrench,
  shop: ShoppingBag,
  health: HeartPulse,
  event: CalendarDays,
  news: Newspaper,
  fuel: Fuel,
  ev_charge: PlugZap,
  institution: Building2,
};

const LINK_CLASS =
  "flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 outline-none transition-colors active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50";

function CardBody({ card }: { card: AiCard }) {
  const Icon = ICONS[card.icon] ?? Store;
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] leading-tight font-semibold">{card.title}</span>
          {card.badge ? (
            <span className="shrink-0 rounded-full bg-highlight-soft px-1.5 py-0.5 text-[10px] leading-none font-bold text-highlight-foreground">
              {card.badge}
            </span>
          ) : null}
        </span>
        {card.subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{card.subtitle}</span> : null}
      </span>
      {card.external ? (
        <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </>
  );
}

/** Result cards under an answer: white, tappable, with a call button when a real phone number is known. */
export function AiCardList({ cards, className }: { cards: AiCard[]; className?: string }) {
  if (!cards.length) return null;
  return (
    <ul className={cn("grid gap-2", className)} aria-label="Bulunan sonuçlar">
      {cards.map((card) => (
        <li key={card.id} className="flex min-w-0 items-center rounded-2xl bg-card">
          {card.external ? (
            <a href={card.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              <CardBody card={card} />
              <span className="sr-only">(yeni sekmede açılır)</span>
            </a>
          ) : (
            <Link href={card.href} className={LINK_CLASS}>
              <CardBody card={card} />
            </Link>
          )}
          {card.call ? (
            <CallButton
              phone={card.call.phone}
              subjectType={card.call.subjectType}
              subjectId={card.call.subjectId}
              label={`${card.title} ara`}
              iconOnly
              variant="secondary"
              className="mr-2 shrink-0 shadow-none"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import type { PlacePhoto } from "../types";
import { isOptimizable } from "./place-card";

/** Swipeable photo gallery with dots and photo credits. */
export function PlaceGallery({ photos, name }: { photos: PlacePhoto[]; name: string }) {
  const [api, setApi] = React.useState<CarouselApi>();
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const credit = photos[index]?.credit;

  return (
    <div className="relative">
      <Carousel setApi={setApi} opts={{ loop: photos.length > 1 }} aria-label={`${name} fotoğrafları`}>
        <CarouselContent className="ml-0">
          {photos.map((p, i) => (
            <CarouselItem key={p.url} className="pl-0" aria-label={`${i + 1} / ${photos.length}`}>
              <div className="relative aspect-[4/3] w-full bg-muted sm:aspect-[16/10]">
                <Image
                  src={p.url}
                  alt={p.alt ?? `${name} fotoğrafı ${i + 1}`}
                  fill
                  sizes="(max-width: 672px) 100vw, 672px"
                  priority={i === 0}
                  unoptimized={!isOptimizable(p.url)}
                  className="object-cover"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {photos.length > 1 ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
          {photos.map((p, i) => (
            <span key={p.url} className={cn("h-1.5 rounded-full bg-white/70 shadow transition-all", i === index ? "w-5 bg-white" : "w-1.5")} />
          ))}
        </div>
      ) : null}
      {credit ? <p className="absolute right-2 bottom-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">{credit}</p> : null}
    </div>
  );
}

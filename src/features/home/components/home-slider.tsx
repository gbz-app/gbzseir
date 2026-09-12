import Image from "next/image";

/**
 * Home slider under the search (owner, 12.09): only the owner's picture, 175 px tall with the home page's 28 px
 * corners; no text, dots, icons or transitions on it. Server-safe.
 */
export function HomeSlider() {
  return (
    <div className="relative h-[175px] w-full overflow-hidden rounded-[1.75rem] bg-card">
      <Image src="/images/home/slider-1.webp" alt="TurkNet 30. yıl" fill priority sizes="(max-width: 672px) 100vw, 672px" className="object-cover" />
    </div>
  );
}

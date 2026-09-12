import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Square picture card with the title underneath (Şehir Rehberi / Kategoriler on the home page). Shows `image` when
 * given, otherwise a large icon on the `tone` colour. `size="sm"` (the Şehir Rehberi strip, tiles 15% smaller than the
 * categories): smaller icon and a title of up to two lines. Width comes from the parent or `className`. Corners follow
 * the home page's 28 px (22 px on the small tiles). Pictures sit on white (the owner's 3D art has a white ground);
 * `imageFit` moves the picture inside the tile (e.g. "translate-x-[12%]"). `video`: a short silent loop over the picture
 * (the picture is its poster; people who ask for less motion see only the picture). `backdrop`: a photo in the top-right
 * corner of the coloured tile, lightly see-through and fading out towards the bottom left, with the icon in front at
 * the bottom left (owner, 12.09). Server-safe.
 */
export function ImageTile({
  href,
  label,
  sub,
  image,
  video,
  backdrop,
  icon: Icon,
  tone,
  sizes = "8rem",
  size = "md",
  className,
  imageClassName,
  imageFit,
}: {
  href: string;
  label: string;
  sub?: string;
  image?: string;
  /** Path of a short silent mp4 under /public (a constant from the code, never user input). */
  video?: string;
  /** Photo shown in the top-right corner of the coloured tile, behind the icon. */
  backdrop?: string;
  icon?: LucideIcon;
  tone?: string;
  sizes?: string;
  size?: "md" | "sm";
  className?: string;
  imageClassName?: string;
  imageFit?: string;
}) {
  const small = size === "sm";
  return (
    <Link href={href} className={cn("group block outline-none", className)}>
      <span
        className={cn(
          "relative flex aspect-square items-center justify-center overflow-hidden transition-transform group-active:scale-[0.97] group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
          small ? "rounded-[1.375rem]" : "rounded-[1.75rem]",
          image ? "bg-card" : tone,
          imageClassName,
        )}
      >
        {image ? <Image src={image} alt="" fill sizes={sizes} className={cn("object-cover", imageFit)} /> : null}
        {video ? (
          // Written as plain HTML so the server HTML carries `muted` (React leaves that attribute out, and iPhones only
          // autoplay a video that is muted in the markup).
          <span
            aria-hidden
            className="absolute inset-0 motion-reduce:hidden"
            dangerouslySetInnerHTML={{
              __html: `<video src="${encodeURI(video)}" autoplay muted loop playsinline preload="auto" disablepictureinpicture disableremoteplayback class="size-full object-cover"></video>`,
            }}
          />
        ) : null}
        {backdrop && !image && !video ? (
          <Image
            src={backdrop}
            alt=""
            fill
            sizes={sizes}
            className="object-cover object-right-top opacity-80 [-webkit-mask-image:linear-gradient(to_bottom_left,#000_35%,transparent_92%)] [mask-image:linear-gradient(to_bottom_left,#000_35%,transparent_92%)]"
          />
        ) : null}
        {image || video ? null : Icon ? (
          <Icon
            className={cn(small ? "size-8" : "size-10", backdrop && "absolute bottom-2 left-2 size-8 drop-shadow-[0_1px_1px_rgb(255_255_255/0.6)]")}
            strokeWidth={backdrop ? 1.75 : 1.5}
            aria-hidden
          />
        ) : null}
      </span>
      {small ? (
        <span className="mt-1.5 line-clamp-2 px-0.5 text-center text-sm leading-tight font-semibold">{label}</span>
      ) : (
        <span className="mt-2 block truncate px-0.5 text-center text-[15px] leading-tight font-semibold">{label}</span>
      )}
      {sub ? <span className="mt-0.5 block truncate px-0.5 text-center text-xs text-muted-foreground">{sub}</span> : null}
    </Link>
  );
}

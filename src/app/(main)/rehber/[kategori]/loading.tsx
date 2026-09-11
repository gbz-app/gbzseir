import { NearbyExplorerSkeleton } from "@/features/nearby/components/nearby-explorer-skeleton";

/** Same map + list sheet placeholder as /yakinimda (the category page is map-first too). */
export default function Loading() {
  return (
    <>
      <div aria-hidden className="pt-safe" />
      <NearbyExplorerSkeleton />
    </>
  );
}

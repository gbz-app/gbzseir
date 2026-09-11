"use client";

import * as React from "react";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import type { ProcessedImage } from "@/lib/images";
import { discardUploadedMedia, getMediaConfig, uploadMedia, useMediaConfig } from "@/lib/media/client";
import { MAX_LISTING_PHOTOS } from "../constants";
import type { ClassifiedVideoDraft } from "../wizard-drafts";
import { ListingVideoField } from "./listing-video-field";

export type ClassifiedMediaStepProps = {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  video: ClassifiedVideoDraft | null;
  onVideoChange: (video: ClassifiedVideoDraft | null) => void;
  /** Video URL saved on the listing (edit mode), or null. */
  persistedVideoUrl: string | null;
  /** True while photos or the video are being processed / uploaded. */
  onBusyChange: (busy: boolean) => void;
};

/** Photos go to R2 through the media adapter when it is configured; null keeps the Supabase upload. */
async function uploadPhotoToAdapter(processed: ProcessedImage): Promise<UploadedImage | null> {
  const config = await getMediaConfig();
  if (config.provider !== "r2") return null;
  const [full, thumb] = await Promise.allSettled([uploadMedia("listing-photo", processed.full.blob), uploadMedia("listing-photo", processed.thumb.blob)]);
  if (full.status === "rejected" || thumb.status === "rejected") {
    void discardUploadedMedia([full.status === "fulfilled" ? full.value.url : null, thumb.status === "fulfilled" ? thumb.value.url : null]);
    throw (full.status === "rejected" ? full.reason : (thumb as PromiseRejectedResult).reason) as Error;
  }
  return {
    url: full.value.url,
    thumbUrl: thumb.value.url,
    path: full.value.key,
    thumbPath: thumb.value.key,
    width: processed.full.width,
    height: processed.full.height,
    provider: "r2",
  };
}

async function discardPhotos(images: UploadedImage[]): Promise<void> {
  await discardUploadedMedia(images.flatMap((i) => [i.url, i.thumbUrl]));
}

/** 2. el wizard "Fotoğraf ekle" step: up to 10 photos (first = cover) and one optional video. */
export function ClassifiedMediaStep({ images, onImagesChange, video, onVideoChange, persistedVideoUrl, onBusyChange }: ClassifiedMediaStepProps) {
  const config = useMediaConfig();
  const [photosBusy, setPhotosBusy] = React.useState(false);
  const [videoBusy, setVideoBusy] = React.useState(false);

  React.useEffect(() => {
    onBusyChange(photosBusy || videoBusy);
  }, [photosBusy, videoBusy, onBusyChange]);

  return (
    <div className="flex flex-col gap-6">
      <ImageUploader
        value={images}
        onChange={onImagesChange}
        max={MAX_LISTING_PHOTOS}
        folder="listings"
        onUploadingChange={setPhotosBusy}
        upload={uploadPhotoToAdapter}
        removeUploaded={discardPhotos}
      />
      <section aria-label="Video">
        <ListingVideoField value={video} onChange={onVideoChange} config={config} persistedUrl={persistedVideoUrl} onBusyChange={setVideoBusy} />
      </section>
    </div>
  );
}

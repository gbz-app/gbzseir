"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { refreshMyBusinessPages } from "../actions";
import { MIN_PORTFOLIO_PHOTOS } from "../lib/completeness";
import { BusinessImagePicker, type PickedImage } from "./editor/image-picker";

const MAX_PHOTOS = 20;

export type PhotosManagerProps = {
  businessId: string;
  cover: PickedImage | null;
  photos: Array<{ id: string; url: string }>;
};

/** İşletme fotoğrafları: cover (saved at once) + portfolio (saved with "Kaydet", order = sort). */
export function PhotosManager({ businessId, cover: initialCover, photos: initialPhotos }: PhotosManagerProps) {
  const router = useRouter();
  const [cover, setCover] = React.useState<PickedImage | null>(initialCover);
  const [photos, setPhotos] = React.useState<UploadedImage[]>(() =>
    initialPhotos.map((p) => ({ url: p.url, thumbUrl: p.url, path: "", thumbPath: "" })),
  );
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const saveCover = async (next: PickedImage | null) => {
    setCover(next);
    const { error } = await createClient().from("businesses").update({ cover_url: next?.url ?? null }).eq("id", businessId);
    if (error) {
      toast.error("Kapak fotoğrafı kaydedilemedi.");
      return;
    }
    await refreshMyBusinessPages().catch(() => undefined);
    toast.success(next ? "Kapak fotoğrafı güncellendi" : "Kapak fotoğrafı kaldırıldı");
    router.refresh();
  };

  const savePhotos = async () => {
    setSaving(true);
    // One transaction (set_business_photos): a failed save keeps the old photos.
    const { error } = await createClient().rpc("set_business_photos", {
      p_business_id: businessId,
      p_photos: photos.map((p) => ({ url: p.url })),
    });
    if (error) {
      setSaving(false);
      toast.error("Fotoğraflar kaydedilemedi.");
      return;
    }
    await refreshMyBusinessPages().catch(() => undefined);
    setSaving(false);
    setDirty(false);
    toast.success("Fotoğrafların kaydedildi");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-8 px-4 pt-4 pb-8">
      <section aria-labelledby="kapak">
        <h2 id="kapak" className="scroll-mt-24 text-base font-bold">
          Kapak fotoğrafı
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">İşletme sayfanın en üstünde görünür. Dükkanının dışı ya da en iyi işin olabilir.</p>
        <BusinessImagePicker
          className="mt-3"
          value={cover}
          onChange={saveCover}
          label="Kapak"
          hint="Yatay bir fotoğraf en iyi görünür."
          prefix="cover-"
          deleteReplaced
        />
      </section>

      <section aria-labelledby="portfolyo">
        <h2 id="portfolyo" className="scroll-mt-24 text-base font-bold">
          İş fotoğrafları
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Yaptığın işleri göster. En az {MIN_PORTFOLIO_PHOTOS} fotoğraf güven verir; ilk fotoğraf öne çıkar, sürükleyerek sıralayabilirsin.
        </p>
        <ImageUploader
          className="mt-3"
          value={photos}
          onChange={(next) => {
            setPhotos(next);
            setDirty(true);
          }}
          max={MAX_PHOTOS}
          folder="business"
          onUploadingChange={setUploading}
        />
        <Button className="mt-4 w-full" size="lg" onClick={savePhotos} disabled={!dirty || uploading || saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {dirty ? "Fotoğrafları kaydet" : "Kaydedildi"}
        </Button>
      </section>
    </div>
  );
}

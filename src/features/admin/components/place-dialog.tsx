"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { formatPhoneTR } from "@/core/format";
import type { LatLng } from "@/core/geo";
import { LocationPicker } from "@/features/business/components/editor/location-picker";
import { pickerDefs, type CategoryDef } from "@/features/business/lib/category-visuals";
import type { PoiKind } from "@/features/nearby/types";
import { deletePlaceAction, savePlaceAction } from "../actions/places";
import { POI_KIND_META, poiDeletable } from "../lib/poi-kinds";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type PlaceValue = {
  id: string;
  kind: PoiKind;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  hidden: boolean;
  locked: boolean;
  source: string;
  /** "guide/…" for city-guide import rows: those are hidden, never deleted (see poiDeletable). */
  source_ref?: string | null;
  /** Gezilecek yer fields (kind "place"). */
  category: string;
  description: string | null;
  hours: string | null;
  fee: string | null;
  curated: boolean;
  photos: Array<{ url: string; alt: string | null; credit: string | null }>;
};

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const DEFAULT_CATEGORY = "tarihi";

/**
 * Add / edit a poi of any kind: name, phone, address, map location and hidden. Gezilecek yerler also get texts,
 * category, photos (upload) and the featured flag. Synced rows (OSM / KBB) are locked on save by default.
 */
export function PlaceDialog({
  kind,
  value,
  categories,
  trigger,
  defaultOpen = false,
}: {
  kind: PoiKind;
  value?: PlaceValue;
  /** place_categories in admin order (loadVocabularies): the picker lists the active ones plus the place's own. */
  categories: readonly CategoryDef[];
  trigger: React.ReactElement;
  /** Open on mount (deep link from a support message). */
  defaultOpen?: boolean;
}) {
  const isPlace = kind === "place";
  const options = pickerDefs(categories, isPlace ? value?.category : null);
  const fallbackCategory = options.some((c) => c.key === DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : (options[0]?.key ?? "diger");
  const synced = value?.source === "osm" || value?.source === "kbb";
  const meta = POI_KIND_META[kind];
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(defaultOpen);
  const [name, setName] = React.useState(value?.name ?? "");
  const [phone, setPhone] = React.useState(value?.phone ? formatPhoneTR(value.phone) : "");
  const [address, setAddress] = React.useState(value?.address ?? "");
  const [category, setCategory] = React.useState(value?.category ?? fallbackCategory);
  const [description, setDescription] = React.useState(value?.description ?? "");
  const [hours, setHours] = React.useState(value?.hours ?? "");
  const [fee, setFee] = React.useState(value?.fee ?? "");
  const [curated, setCurated] = React.useState(value?.curated ?? true);
  const [hidden, setHidden] = React.useState(value?.hidden ?? false);
  const [locked, setLocked] = React.useState(true);
  const [location, setLocation] = React.useState<LatLng | null>(value?.lat != null && value?.lng != null ? { lat: value.lat, lng: value.lng } : null);
  const credits = React.useMemo(() => new Map((value?.photos ?? []).map((p) => [p.url, p])), [value]);
  const [photos, setPhotos] = React.useState<UploadedImage[]>(() => (value?.photos ?? []).map((p) => ({ url: p.url, thumbUrl: p.url, path: "", thumbPath: "" })));
  const [uploading, setUploading] = React.useState(false);
  const ids = { name: React.useId(), phone: React.useId(), address: React.useId(), cat: React.useId(), desc: React.useId(), hours: React.useId(), fee: React.useId() };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        savePlaceAction({
          id: value?.id,
          kind,
          name,
          phone,
          address,
          hidden,
          locked,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          place: isPlace
            ? {
                category,
                description,
                hours,
                fee,
                curated,
                photos: photos.map((p) => ({ url: p.url, alt: credits.get(p.url)?.alt ?? name, credit: credits.get(p.url)?.credit ?? null })),
              }
            : undefined,
        }),
      { onSuccess: () => setOpen(false), refresh: true },
    );
  };

  const phoneField = (
    <div>
      <Label htmlFor={ids.phone} className="mb-1 block text-xs font-semibold">
        Telefon
      </Label>
      <Input id={ids.phone} type="tel" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="0262 123 45 67" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && !uploading && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{value ? `${value.name} düzenle` : `Yeni ${meta.noun}`}</DialogTitle>
          <DialogDescription>
            {isPlace
              ? "\"Öne çıkan\" yerler ana sayfada ve Gezilecek Yerler listesinin başında görünür."
              : `${meta.label}: ad, telefon, adres ve konum Yakınımda listesinde ve haritada görünür.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={ids.name} className="mb-1 block text-xs font-semibold">
                Ad
              </Label>
              <Input id={ids.name} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required />
            </div>
            {isPlace ? (
              <div>
                <Label htmlFor={ids.cat} className="mb-1 block text-xs font-semibold">
                  Kategori
                </Label>
                <select id={ids.cat} value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT}>
                  {options.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.active ? c.label : `${c.label} (pasif)`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              phoneField
            )}
          </div>
          {isPlace ? (
            <>
              <div>
                <Label htmlFor={ids.desc} className="mb-1 block text-xs font-semibold">
                  Açıklama
                </Label>
                <Textarea id={ids.desc} rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor={ids.hours} className="mb-1 block text-xs font-semibold">
                    Ziyaret saatleri
                  </Label>
                  <Input id={ids.hours} value={hours} maxLength={200} onChange={(e) => setHours(e.target.value)} placeholder="ör. Her gün 09:00-18:00" />
                </div>
                <div>
                  <Label htmlFor={ids.fee} className="mb-1 block text-xs font-semibold">
                    Giriş ücreti
                  </Label>
                  <Input id={ids.fee} value={fee} maxLength={100} onChange={(e) => setFee(e.target.value)} placeholder="Ücretsiz" />
                </div>
                {phoneField}
              </div>
            </>
          ) : null}
          <div>
            <Label htmlFor={ids.address} className="mb-1 block text-xs font-semibold">
              Adres
            </Label>
            <Input id={ids.address} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {isPlace ? (
            <>
              <label className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                <span className="font-semibold">Öne çıkan yer</span>
                <Switch checked={curated} onCheckedChange={setCurated} />
              </label>
              <div>
                <p className="mb-1 text-xs font-semibold">Fotoğraflar (ilki kapak)</p>
                <ImageUploader value={photos} onChange={setPhotos} max={12} folder="places" onUploadingChange={setUploading} />
                <p className="mt-1 text-xs text-muted-foreground">Yalnızca kullanım hakkına sahip olduğun fotoğrafları yükle.</p>
              </div>
            </>
          ) : null}
          <div>
            <p className="mb-1 text-xs font-semibold">Konum</p>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
          <SwitchRow
            title="Gizle"
            hint="Yakınımda, harita, arama ve nöbet listelerinde görünmez; sayfası açılmaz."
            checked={hidden}
            onCheckedChange={setHidden}
          />
          {synced ? (
            <SwitchRow
              title="Kaynaktan güncellenmesin"
              hint="Açıkken OSM / KBB veri eşitlemesi bu yerin adını, telefonunu, adresini, konumunu ve gizleme ayarını değiştirmez."
              checked={locked}
              onCheckedChange={setLocked}
            />
          ) : null}
          <div className="flex flex-wrap justify-between gap-2">
            {value && poiDeletable(kind, value.source, value.source_ref) ? <DeletePlace id={value.id} name={value.name} onDone={() => setOpen(false)} /> : <span />}
            <Button type="submit" disabled={pending || uploading}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({ title, hint, checked, onCheckedChange }: { title: string; hint: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function DeletePlace({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Yer silinsin mi?"
      description={`"${name}" haritadan ve listelerden kalkar.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => {
        const res = await run(() => deletePlaceAction({ id }), { refresh: true });
        if (res?.ok) onDone();
        return !!res?.ok;
      }}
    />
  );
}

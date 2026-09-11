"use client";

import * as React from "react";
import { BedDouble, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/core/format";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { FilterChip } from "@/components/shared/explore-header";
import { FormScreen } from "@/components/shared/form-screen";
import { refreshMyBusinessPages } from "../actions";
import { amountInput, parseAmount } from "../lib/form-utils";
import type { Room } from "../lib/vertical-queries";
import { ROOM_AMENITIES, roomAmenityOptions, type AmenityDef } from "../lib/verticals";
import { CharCount, Field } from "./editor/field";

const ROOM_COLUMNS = "id,name,description,price_try,capacity,bed_info,size_m2,amenities,photos,is_available,sort";
type RawRoom = Omit<Room, "price_try"> & { price_try: unknown };
const toRoom = (r: RawRoom): Room => {
  const n = r.price_try === null ? null : Number(r.price_try);
  return { ...r, price_try: n !== null && Number.isFinite(n) ? n : null, amenities: r.amenities ?? [], photos: r.photos ?? [] };
};

/** Owner rooms editor (hotels): add, edit, reorder, availability. Saved immediately. `amenities`: room features (vocabularies.ts). */
export function RoomsManager({ businessId, initial, amenities = ROOM_AMENITIES }: { businessId: string; initial: Room[]; amenities?: readonly AmenityDef[] }) {
  const [rooms, setRooms] = React.useState<Room[]>(initial);
  const [editing, setEditing] = React.useState<Room | "new" | null>(null);
  const supabase = React.useMemo(() => createClient(), []);
  const done = () => void refreshMyBusinessPages().catch(() => undefined);
  const fail = () => toast.error("İşlem yapılamadı, tekrar dene.");

  const move = async (index: number, dir: -1 | 1) => {
    const a = rooms[index];
    const b = rooms[index + dir];
    if (!a || !b) return;
    const next = [...rooms];
    next[index] = { ...b, sort: a.sort };
    next[index + dir] = { ...a, sort: b.sort };
    setRooms(next);
    const res = await Promise.all([
      supabase.from("business_rooms").update({ sort: b.sort }).eq("id", a.id),
      supabase.from("business_rooms").update({ sort: a.sort }).eq("id", b.id),
    ]);
    if (res.some((r) => r.error)) fail();
    else done();
  };

  const toggle = async (room: Room) => {
    const next = !room.is_available;
    setRooms((all) => all.map((r) => (r.id === room.id ? { ...r, is_available: next } : r)));
    const { error } = await supabase.from("business_rooms").update({ is_available: next }).eq("id", room.id);
    if (error) return fail();
    toast.success(next ? `${room.name} müsait` : `${room.name} müsait değil olarak işaretlendi`);
    done();
  };

  const remove = async (room: Room) => {
    if (!window.confirm(`"${room.name}" silinsin mi?`)) return;
    const { error } = await supabase.from("business_rooms").delete().eq("id", room.id);
    if (error) return fail();
    setRooms((all) => all.filter((r) => r.id !== room.id));
    setEditing(null);
    done();
  };

  return (
    <div className="flex flex-col gap-3">
      {rooms.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-5 py-8 text-center shadow-soft ring-1 ring-foreground/[0.05]">
          <BedDouble className="size-10 text-primary/50" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 font-semibold">Henüz oda eklemedin</p>
          <p className="mt-1 text-sm text-muted-foreground">Oda tiplerini fotoğraf, kapasite ve gecelik fiyatla ekle.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rooms.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 rounded-3xl bg-card p-2 pr-3 shadow-soft ring-1 ring-foreground/[0.05]">
              <button type="button" onClick={() => setEditing(r)} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left hover:bg-muted/60", !r.is_available && "opacity-55")}>
                {r.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photos[0]} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <BedDouble className="size-6" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {r.price_try != null ? `${formatPrice(r.price_try)} / gece` : "Fiyat yok"} · {r.capacity} kişi
                  </span>
                  <span className="block text-xs text-muted-foreground">{r.photos.length} fotoğraf{!r.is_available ? " · müsait değil" : ""}</span>
                </span>
              </button>
              <span className="flex flex-col">
                <button type="button" className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${r.name} yukarı`}>
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
                  onClick={() => move(i, 1)}
                  disabled={i === rooms.length - 1}
                  aria-label={`${r.name} aşağı`}
                >
                  <ChevronDown className="size-4" />
                </button>
              </span>
              <Switch checked={r.is_available} onCheckedChange={() => toggle(r)} aria-label={`${r.name} müsait`} />
            </li>
          ))}
        </ul>
      )}

      <Button size="lg" onClick={() => setEditing("new")}>
        <Plus /> Oda ekle
      </Button>

      {editing ? (
        <RoomForm
          key={editing === "new" ? "new" : editing.id}
          businessId={businessId}
          room={editing === "new" ? null : editing}
          features={amenities}
          nextSort={rooms.reduce((m, r) => Math.max(m, r.sort), -1) + 1}
          onClose={() => setEditing(null)}
          onDelete={remove}
          onSaved={(room) => {
            setRooms((all) => (all.some((r) => r.id === room.id) ? all.map((r) => (r.id === room.id ? room : r)) : [...all, room]));
            setEditing(null);
            done();
          }}
        />
      ) : null}
    </div>
  );
}

function RoomForm({
  businessId,
  room,
  features,
  nextSort,
  onClose,
  onSaved,
  onDelete,
}: {
  businessId: string;
  room: Room | null;
  features: readonly AmenityDef[];
  nextSort: number;
  onClose: () => void;
  onSaved: (room: Room) => void;
  onDelete: (room: Room) => void;
}) {
  const [name, setName] = React.useState(room?.name ?? "");
  const [description, setDescription] = React.useState(room?.description ?? "");
  const [price, setPrice] = React.useState(amountInput(room?.price_try));
  const [capacity, setCapacity] = React.useState(String(room?.capacity ?? 2));
  const [bed, setBed] = React.useState(room?.bed_info ?? "");
  const [size, setSize] = React.useState(room?.size_m2 ? String(room.size_m2) : "");
  const [amenities, setAmenities] = React.useState<string[]>(room?.amenities ?? []);
  const [photos, setPhotos] = React.useState<UploadedImage[]>(() => (room?.photos ?? []).map((url) => ({ url, thumbUrl: url, path: "", thumbPath: "" })));
  const [available, setAvailable] = React.useState(room?.is_available ?? true);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 2 || n.length > 80) return toast.error("Oda adı 2-80 karakter olmalı.");
    if (description.length > 600) return toast.error("Açıklama en fazla 600 karakter olabilir.");
    const amount = parseAmount(price);
    if (amount === undefined) return toast.error("Gecelik fiyatı sayı olarak yaz (ör. 2600).");
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 20) return toast.error("Kapasite 1-20 kişi olmalı.");
    const m2 = size.trim() ? Number(size) : null;
    if (m2 !== null && (!Number.isInteger(m2) || m2 < 5 || m2 > 1000)) return toast.error("Oda büyüklüğü 5-1000 m² olmalı.");
    setSaving(true);
    const values = {
      name: n,
      description: description.trim() || null,
      price_try: amount,
      capacity: cap,
      bed_info: bed.trim() || null,
      size_m2: m2,
      amenities,
      photos: photos.map((p) => p.url),
      is_available: available,
    };
    const supabase = createClient();
    const { data, error } = room
      ? await supabase.from("business_rooms").update(values).eq("id", room.id).select(ROOM_COLUMNS).single()
      : await supabase.from("business_rooms").insert({ ...values, business_id: businessId, sort: nextSort }).select(ROOM_COLUMNS).single();
    setSaving(false);
    if (error || !data) return toast.error("Oda kaydedilemedi, tekrar dene.");
    toast.success(room ? "Oda güncellendi" : "Oda eklendi");
    onSaved(toRoom(data as unknown as RawRoom));
  };

  return (
    <FormScreen
      title={room ? "Odayı düzenle" : "Oda ekle"}
      onClose={onClose}
      onSubmit={submit}
      busy={saving || uploading}
      footerExtra={
        room ? (
          <Button type="button" variant="outline" size="lg" className="text-destructive" onClick={() => onDelete(room)} aria-label="Odayı sil">
            <Trash2 />
          </Button>
        ) : null
      }
    >
      <Field label="Oda adı" htmlFor="oda-ad">
        <Input id="oda-ad" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ör. Deluxe Oda" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gecelik fiyat (TL)" htmlFor="oda-fiyat" optional>
          <Input id="oda-fiyat" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ör. 2600" />
        </Field>
        <Field label="Kapasite (kişi)" htmlFor="oda-kapasite">
          <Input id="oda-kapasite" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Yatak" htmlFor="oda-yatak" optional>
          <Input id="oda-yatak" value={bed} maxLength={80} onChange={(e) => setBed(e.target.value)} placeholder="1 çift kişilik" />
        </Field>
        <Field label="Büyüklük (m²)" htmlFor="oda-m2" optional>
          <Input id="oda-m2" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <Field label="Açıklama" htmlFor="oda-aciklama" optional>
        <Textarea id="oda-aciklama" rows={3} value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} placeholder="Manzara, kat, öne çıkan özellikler" />
        <CharCount value={description} max={600} />
      </Field>
      <Field label="Oda özellikleri" optional>
        <div className="flex flex-wrap gap-2">
          {roomAmenityOptions(features).map((a) => (
            <FilterChip key={a.key} active={amenities.includes(a.key)} onClick={() => setAmenities((s) => (s.includes(a.key) ? s.filter((x) => x !== a.key) : [...s, a.key]))} icon={a.icon}>
              {a.label}
            </FilterChip>
          ))}
        </div>
      </Field>
      <Field label="Fotoğraflar" optional hint="En fazla 10 fotoğraf. İlk fotoğraf kapak olur.">
        <ImageUploader value={photos} onChange={setPhotos} max={10} folder="rooms" onUploadingChange={setUploading} />
      </Field>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.05]">
        <span>
          <span className="block font-semibold">Müsait</span>
          <span className="text-sm text-muted-foreground">Kapalıysa sayfanda &quot;Şu an müsait değil&quot; yazar.</span>
        </span>
        <Switch checked={available} onCheckedChange={setAvailable} />
      </label>
    </FormScreen>
  );
}

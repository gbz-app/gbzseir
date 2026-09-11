"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormScreen } from "@/components/shared/form-screen";
import { refreshMyBusinessPages } from "../actions";
import { amountInput, parseAmount } from "../lib/form-utils";
import { SERVICE_COLUMNS, toBusinessService, type BusinessService, type RawBusinessService } from "../lib/service-catalog";
import { SERVICE_UNITS, formatServicePrice, type ServiceUnit } from "../lib/verticals";
import { CharCount, Field } from "./editor/field";
import { BusinessImagePicker, type PickedImage } from "./editor/image-picker";

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";

/** Owner service catalog (hizmet firmaları): add, edit, reorder, show / hide. Saved immediately (RLS: owner write). */
export function ServicesManager({ businessId, initial }: { businessId: string; initial: BusinessService[] }) {
  const [items, setItems] = React.useState<BusinessService[]>(initial);
  const [editing, setEditing] = React.useState<BusinessService | "new" | null>(null);
  const supabase = React.useMemo(() => createClient(), []);
  const done = () => void refreshMyBusinessPages().catch(() => undefined);
  const fail = () => toast.error("İşlem yapılamadı, tekrar dene.");

  const move = async (index: number, dir: -1 | 1) => {
    const a = items[index];
    const b = items[index + dir];
    if (!a || !b) return;
    const next = [...items];
    next[index] = { ...b, sort: a.sort };
    next[index + dir] = { ...a, sort: b.sort };
    setItems(next);
    const res = await Promise.all([
      supabase.from("business_services").update({ sort: b.sort }).eq("id", a.id),
      supabase.from("business_services").update({ sort: a.sort }).eq("id", b.id),
    ]);
    if (res.some((r) => r.error)) fail();
    else done();
  };

  const toggle = async (s: BusinessService) => {
    const next = !s.is_active;
    setItems((all) => all.map((x) => (x.id === s.id ? { ...x, is_active: next } : x)));
    const { error } = await supabase.from("business_services").update({ is_active: next }).eq("id", s.id);
    if (error) return fail();
    toast.success(next ? `${s.name} sayfanda görünüyor` : `${s.name} gizlendi`);
    done();
  };

  const remove = async (s: BusinessService) => {
    if (!window.confirm(`"${s.name}" silinsin mi?`)) return;
    const { error } = await supabase.from("business_services").delete().eq("id", s.id);
    if (error) return fail();
    setItems((all) => all.filter((x) => x.id !== s.id));
    setEditing(null);
    done();
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-5 py-8 text-center shadow-soft ring-1 ring-foreground/[0.05]">
          <Wrench className="size-10 text-primary/50" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 font-semibold">Henüz hizmet eklemedin</p>
          <p className="mt-1 text-sm text-muted-foreground">Verdiğin hizmetleri fiyatlarıyla ekle; müşteriler sayfanda görüp seni arasın.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 rounded-3xl bg-card p-2 pr-3 shadow-soft ring-1 ring-foreground/[0.05]">
              <button type="button" onClick={() => setEditing(s)} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left hover:bg-muted/60", !s.is_active && "opacity-55")}>
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo_url} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
                    <Wrench className="size-6" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{formatServicePrice(s.price_try, s.price_max_try, s.price_unit)}</span>
                  {s.duration_text ? <span className="block text-xs text-muted-foreground">{s.duration_text}</span> : null}
                </span>
              </button>
              <span className="flex flex-col">
                <button type="button" className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${s.name} yukarı`}>
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label={`${s.name} aşağı`}
                >
                  <ChevronDown className="size-4" />
                </button>
              </span>
              <Switch checked={s.is_active} onCheckedChange={() => toggle(s)} aria-label={`${s.name} sayfada görünsün`} />
            </li>
          ))}
        </ul>
      )}

      <Button size="lg" onClick={() => setEditing("new")}>
        <Plus /> Hizmet ekle
      </Button>

      {editing ? (
        <ServiceForm
          key={editing === "new" ? "new" : editing.id}
          businessId={businessId}
          service={editing === "new" ? null : editing}
          nextSort={items.reduce((m, s) => Math.max(m, s.sort), -1) + 1}
          onClose={() => setEditing(null)}
          onDelete={remove}
          onSaved={(s) => {
            setItems((all) => (all.some((x) => x.id === s.id) ? all.map((x) => (x.id === s.id ? s : x)) : [...all, s]));
            setEditing(null);
            done();
          }}
        />
      ) : null}
    </div>
  );
}

function ServiceForm({
  businessId,
  service,
  nextSort,
  onClose,
  onSaved,
  onDelete,
}: {
  businessId: string;
  service: BusinessService | null;
  nextSort: number;
  onClose: () => void;
  onSaved: (s: BusinessService) => void;
  onDelete: (s: BusinessService) => void;
}) {
  const [name, setName] = React.useState(service?.name ?? "");
  const [description, setDescription] = React.useState(service?.description ?? "");
  const [price, setPrice] = React.useState(amountInput(service?.price_try));
  const [priceMax, setPriceMax] = React.useState(amountInput(service?.price_max_try));
  const [unit, setUnit] = React.useState<ServiceUnit>((service?.price_unit as ServiceUnit) ?? "is");
  const [duration, setDuration] = React.useState(service?.duration_text ?? "");
  const [photo, setPhoto] = React.useState<PickedImage | null>(service?.photo_url ? { url: service.photo_url, path: null } : null);
  const [active, setActive] = React.useState(service?.is_active ?? true);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 2 || n.length > 80) return toast.error("Hizmet adı 2-80 karakter olmalı.");
    if (description.length > 500) return toast.error("Açıklama en fazla 500 karakter olabilir.");
    const min = parseAmount(price);
    const max = parseAmount(priceMax);
    if (min === undefined || max === undefined) return toast.error("Fiyatı sayı olarak yaz (ör. 1500).");
    if (min != null && max != null && max < min) return toast.error("En yüksek fiyat, başlangıç fiyatından küçük olamaz.");
    setSaving(true);
    const values = {
      name: n,
      description: description.trim() || null,
      price_try: min,
      price_max_try: max,
      price_unit: unit,
      duration_text: duration.trim() || null,
      photo_url: photo?.url ?? null,
      is_active: active,
    };
    const supabase = createClient();
    const { data, error } = service
      ? await supabase.from("business_services").update(values).eq("id", service.id).select(SERVICE_COLUMNS).single()
      : await supabase.from("business_services").insert({ ...values, business_id: businessId, sort: nextSort }).select(SERVICE_COLUMNS).single();
    setSaving(false);
    if (error || !data) return toast.error("Hizmet kaydedilemedi, tekrar dene.");
    toast.success(service ? "Hizmet güncellendi" : "Hizmet eklendi");
    onSaved(toBusinessService(data as unknown as RawBusinessService));
  };

  return (
    <FormScreen
      title={service ? "Hizmeti düzenle" : "Hizmet ekle"}
      onClose={onClose}
      onSubmit={submit}
      busy={saving || uploading}
      footerExtra={
        service ? (
          <Button type="button" variant="outline" size="lg" className="text-destructive" onClick={() => onDelete(service)} aria-label="Hizmeti sil">
            <Trash2 />
          </Button>
        ) : null
      }
    >
      <Field label="Hizmet adı" htmlFor="hz-ad">
        <Input id="hz-ad" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ör. Ev temizliği (3+1)" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fiyat (TL)" htmlFor="hz-fiyat" optional hint="Başlangıç fiyatı">
          <Input id="hz-fiyat" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ör. 1500" />
        </Field>
        <Field label="En yüksek (TL)" htmlFor="hz-fiyat-max" optional hint="Aralık vermek için">
          <Input id="hz-fiyat-max" inputMode="decimal" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="ör. 2500" />
        </Field>
        <Field label="Birim" htmlFor="hz-birim">
          <select id="hz-birim" value={unit} onChange={(e) => setUnit(e.target.value as ServiceUnit)} className={SELECT}>
            {Object.entries(SERVICE_UNITS).map(([k, l]) => (
              <option key={k} value={k}>
                {l} başına
              </option>
            ))}
          </select>
        </Field>
        <Field label="Süre" htmlFor="hz-sure" optional>
          <Input id="hz-sure" value={duration} maxLength={40} onChange={(e) => setDuration(e.target.value)} placeholder="ör. 3-4 saat" />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Önizleme: {formatServicePrice(parseAmount(price) ?? null, parseAmount(priceMax) ?? null, unit)}</p>
      <Field label="Açıklama" htmlFor="hz-aciklama" optional>
        <Textarea id="hz-aciklama" rows={3} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Neler dahil, malzeme kimden, garanti var mı?" />
        <CharCount value={description} max={500} />
      </Field>
      <BusinessImagePicker value={photo} onChange={setPhoto} onUploadingChange={setUploading} label="Fotoğraf" hint="İsteğe bağlı. Yaptığın bir işin fotoğrafı." prefix="service-" />
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.05]">
        <span>
          <span className="block font-semibold">Sayfamda görünsün</span>
          <span className="text-sm text-muted-foreground">Kapalıysa hizmet gizlenir ama silinmez.</span>
        </span>
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
    </FormScreen>
  );
}

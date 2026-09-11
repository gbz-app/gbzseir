"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/core/format";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FilterChip } from "@/components/shared/explore-header";
import { FormScreen } from "@/components/shared/form-screen";
import { refreshMyBusinessPages } from "../actions";
import { amountInput, parseAmount } from "../lib/form-utils";
import type { MenuItem, MenuSection } from "../lib/vertical-queries";
import { MENU_TAGS, MENU_TAG_KEYS } from "../lib/verticals";
import { CharCount, Field } from "./editor/field";
import { BusinessImagePicker, type PickedImage } from "./editor/image-picker";

const ITEM_COLUMNS = "id,name,description,price_try,photo_url,tags,is_available,sort";
const SUGGESTED = ["Çorbalar", "Ana yemekler", "Tatlılar", "İçecekler", "Kahvaltı", "Sıcak kahveler"];
/** Section ideas for a hotel's menu (restaurant and room service). */
export const HOTEL_MENU_SUGGESTIONS = ["Kahvaltı", "Oda servisi", "Restoran", "İçecekler", "Minibar", "Tatlılar"];

type RawItem = Omit<MenuItem, "price_try" | "tags"> & { price_try: unknown; tags: string[] | null };
const toItem = (r: RawItem): MenuItem => {
  const n = r.price_try === null ? null : Number(r.price_try);
  return { ...r, price_try: n !== null && Number.isFinite(n) ? n : null, tags: r.tags ?? [] };
};

const ICON_BTN = "flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30";

/** Owner menu editor: sections and items are saved immediately (RLS: owner write). */
export function MenuManager({
  businessId,
  initial,
  suggestions = SUGGESTED,
}: {
  businessId: string;
  initial: MenuSection[];
  /** Section name chips shown while the menu is empty. */
  suggestions?: readonly string[];
}) {
  const [sections, setSections] = React.useState<MenuSection[]>(initial);
  const [newSection, setNewSection] = React.useState("");
  const [rename, setRename] = React.useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = React.useState<{ sectionId: string; item: MenuItem | null } | null>(null);
  const [pending, setPending] = React.useState(false);
  const supabase = React.useMemo(() => createClient(), []);

  const done = () => void refreshMyBusinessPages().catch(() => undefined);
  const fail = () => toast.error("İşlem yapılamadı, tekrar dene.");

  const addSection = async (raw: string) => {
    const name = raw.trim();
    if (!name || name.length > 60) return toast.error("Bölüm adı 1-60 karakter olmalı.");
    setPending(true);
    const sort = sections.reduce((m, s) => Math.max(m, s.sort), -1) + 1;
    const { data, error } = await supabase.from("business_menu_sections").insert({ business_id: businessId, name, sort }).select("id,name,sort").single();
    setPending(false);
    if (error || !data) return fail();
    setSections((s) => [...s, { ...(data as { id: string; name: string; sort: number }), items: [] }]);
    setNewSection("");
    done();
  };

  const saveRename = async () => {
    if (!rename) return;
    const name = rename.name.trim();
    if (!name || name.length > 60) return toast.error("Bölüm adı 1-60 karakter olmalı.");
    const { error } = await supabase.from("business_menu_sections").update({ name }).eq("id", rename.id);
    if (error) return fail();
    setSections((s) => s.map((x) => (x.id === rename.id ? { ...x, name } : x)));
    setRename(null);
    done();
  };

  const deleteSection = async (s: MenuSection) => {
    if (!window.confirm(`"${s.name}" bölümü${s.items.length ? ` ve içindeki ${s.items.length} ürün` : ""} silinsin mi?`)) return;
    const { error } = await supabase.from("business_menu_sections").delete().eq("id", s.id);
    if (error) return fail();
    setSections((all) => all.filter((x) => x.id !== s.id));
    done();
  };

  /** Swap sort values of two rows and persist both. */
  const moveSection = async (index: number, dir: -1 | 1) => {
    const a = sections[index];
    const b = sections[index + dir];
    if (!a || !b) return;
    const next = [...sections];
    next[index] = { ...b, sort: a.sort };
    next[index + dir] = { ...a, sort: b.sort };
    setSections(next);
    const res = await Promise.all([
      supabase.from("business_menu_sections").update({ sort: b.sort }).eq("id", a.id),
      supabase.from("business_menu_sections").update({ sort: a.sort }).eq("id", b.id),
    ]);
    if (res.some((r) => r.error)) fail();
    else done();
  };

  const moveItem = async (sectionId: string, index: number, dir: -1 | 1) => {
    const section = sections.find((s) => s.id === sectionId);
    const a = section?.items[index];
    const b = section?.items[index + dir];
    if (!section || !a || !b) return;
    const items = [...section.items];
    items[index] = { ...b, sort: a.sort };
    items[index + dir] = { ...a, sort: b.sort };
    setSections((all) => all.map((s) => (s.id === sectionId ? { ...s, items } : s)));
    const res = await Promise.all([
      supabase.from("business_menu_items").update({ sort: b.sort }).eq("id", a.id),
      supabase.from("business_menu_items").update({ sort: a.sort }).eq("id", b.id),
    ]);
    if (res.some((r) => r.error)) fail();
    else done();
  };

  const toggleItem = async (sectionId: string, item: MenuItem) => {
    const next = !item.is_available;
    setSections((all) => all.map((s) => (s.id === sectionId ? { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, is_available: next } : i)) } : s)));
    const { error } = await supabase.from("business_menu_items").update({ is_available: next }).eq("id", item.id);
    if (error) return fail();
    toast.success(next ? `${item.name} satışta` : `${item.name} tükendi olarak işaretlendi`);
    done();
  };

  const upsertItem = (sectionId: string, item: MenuItem) =>
    setSections((all) =>
      all.map((s) => (s.id !== sectionId ? s : { ...s, items: s.items.some((i) => i.id === item.id) ? s.items.map((i) => (i.id === item.id ? item : i)) : [...s.items, item] })),
    );

  const deleteItem = async (sectionId: string, item: MenuItem) => {
    if (!window.confirm(`"${item.name}" silinsin mi?`)) return false;
    const { error } = await supabase.from("business_menu_items").delete().eq("id", item.id);
    if (error) {
      fail();
      return false;
    }
    setSections((all) => all.map((s) => (s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== item.id) } : s)));
    done();
    return true;
  };

  return (
    <div className="flex flex-col gap-4">
      {sections.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-5 py-8 text-center">
          <UtensilsCrossed className="size-10 text-primary/50" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 font-semibold">Menün henüz boş</p>
          <p className="mt-1 text-sm text-muted-foreground">Önce bir bölüm ekle, sonra ürünlerini fiyatlarıyla gir.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <FilterChip key={s} active={false} onClick={() => addSection(s)} icon={Plus}>
                {s}
              </FilterChip>
            ))}
          </div>
        </div>
      ) : null}

      {sections.map((s, si) => (
        <section key={s.id} className="overflow-hidden rounded-3xl bg-card" aria-label={s.name}>
          <div className="flex items-center gap-1 pt-2 pr-2 pb-1 pl-4">
            {rename?.id === s.id ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveRename();
                }}
              >
                <Input autoFocus value={rename.name} maxLength={60} onChange={(e) => setRename({ id: s.id, name: e.target.value })} className="h-10" aria-label="Bölüm adı" />
                <Button type="submit" size="sm">
                  Kaydet
                </Button>
              </form>
            ) : (
              <>
                <h2 className="min-w-0 flex-1 truncate font-semibold">
                  {s.name} <span className="font-normal text-muted-foreground">({s.items.length})</span>
                </h2>
                <button type="button" className={ICON_BTN} onClick={() => moveSection(si, -1)} disabled={si === 0} aria-label={`${s.name} bölümünü yukarı taşı`}>
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  className={ICON_BTN}
                  onClick={() => moveSection(si, 1)}
                  disabled={si === sections.length - 1}
                  aria-label={`${s.name} bölümünü aşağı taşı`}
                >
                  <ChevronDown className="size-4" />
                </button>
                <button type="button" className={ICON_BTN} onClick={() => setRename({ id: s.id, name: s.name })} aria-label={`${s.name} adını değiştir`}>
                  <Pencil className="size-4" />
                </button>
                <button type="button" className={cn(ICON_BTN, "hover:text-destructive")} onClick={() => deleteSection(s)} aria-label={`${s.name} bölümünü sil`}>
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </div>

          <ul className="divide-y">
            {s.items.map((it, ii) => (
              <li key={it.id} className="flex items-center gap-2 py-2 pr-3 pl-2">
                <button
                  type="button"
                  onClick={() => setEditing({ sectionId: s.id, item: it })}
                  className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1.5 text-left hover:bg-muted/60", !it.is_available && "opacity-55")}
                >
                  {it.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.photo_url} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <UtensilsCrossed className="size-5" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {it.price_try != null ? formatPrice(it.price_try) : "Fiyat yok"}
                      {!it.is_available ? " · Tükendi" : ""}
                    </span>
                  </span>
                </button>
                <span className="flex flex-col">
                  <button type="button" className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => moveItem(s.id, ii, -1)} disabled={ii === 0} aria-label={`${it.name} yukarı`}>
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
                    onClick={() => moveItem(s.id, ii, 1)}
                    disabled={ii === s.items.length - 1}
                    aria-label={`${it.name} aşağı`}
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </span>
                <Switch checked={it.is_available} onCheckedChange={() => toggleItem(s.id, it)} aria-label={`${it.name} satışta`} />
              </li>
            ))}
          </ul>
          <div className="p-2">
            <Button type="button" variant="ghost" className="w-full text-primary" onClick={() => setEditing({ sectionId: s.id, item: null })}>
              <Plus /> Ürün ekle
            </Button>
          </div>
        </section>
      ))}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addSection(newSection);
        }}
      >
        <Input value={newSection} maxLength={60} onChange={(e) => setNewSection(e.target.value)} placeholder="Yeni bölüm adı (ör. Tatlılar)" aria-label="Yeni bölüm adı" className="h-12 rounded-full px-4" />
        <Button type="submit" size="lg" disabled={pending || !newSection.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Bölüm
        </Button>
      </form>

      {editing ? (
        <ItemForm
          key={editing.item?.id ?? "new"}
          businessId={businessId}
          sectionId={editing.sectionId}
          item={editing.item}
          nextSort={(sections.find((x) => x.id === editing.sectionId)?.items.reduce((m, i) => Math.max(m, i.sort), -1) ?? -1) + 1}
          onClose={() => setEditing(null)}
          onSaved={(item) => {
            upsertItem(editing.sectionId, item);
            setEditing(null);
            done();
          }}
          onDelete={async (item) => {
            if (await deleteItem(editing.sectionId, item)) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ItemForm({
  businessId,
  sectionId,
  item,
  nextSort,
  onClose,
  onSaved,
  onDelete,
}: {
  businessId: string;
  sectionId: string;
  item: MenuItem | null;
  nextSort: number;
  onClose: () => void;
  onSaved: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  const [name, setName] = React.useState(item?.name ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [price, setPrice] = React.useState(amountInput(item?.price_try));
  const [photo, setPhoto] = React.useState<PickedImage | null>(item?.photo_url ? { url: item.photo_url, path: null } : null);
  const [tags, setTags] = React.useState<string[]>(item?.tags ?? []);
  const [available, setAvailable] = React.useState(item?.is_available ?? true);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n || n.length > 80) return toast.error("Ürün adı 1-80 karakter olmalı.");
    if (description.length > 300) return toast.error("Açıklama en fazla 300 karakter olabilir.");
    const amount = parseAmount(price);
    if (amount === undefined) return toast.error("Fiyatı sayı olarak yaz (ör. 140 veya 12,50).");
    setSaving(true);
    const values = { name: n, description: description.trim() || null, price_try: amount, photo_url: photo?.url ?? null, tags, is_available: available };
    const supabase = createClient();
    const { data, error } = item
      ? await supabase.from("business_menu_items").update(values).eq("id", item.id).select(ITEM_COLUMNS).single()
      : await supabase
          .from("business_menu_items")
          .insert({ ...values, business_id: businessId, section_id: sectionId, sort: nextSort })
          .select(ITEM_COLUMNS)
          .single();
    setSaving(false);
    if (error || !data) return toast.error("Ürün kaydedilemedi, tekrar dene.");
    toast.success(item ? "Ürün güncellendi" : "Ürün eklendi");
    onSaved(toItem(data as unknown as RawItem));
  };

  return (
    <FormScreen
      title={item ? "Ürünü düzenle" : "Ürün ekle"}
      onClose={onClose}
      onSubmit={submit}
      busy={saving || uploading}
      footerExtra={
        item ? (
          <Button type="button" variant="destructive" size="lg" onClick={() => onDelete(item)} aria-label="Ürünü sil">
            <Trash2 />
          </Button>
        ) : null
      }
    >
      <Field label="Ürün adı" htmlFor="urun-ad">
        <Input id="urun-ad" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ör. Mercimek çorbası" />
      </Field>
      <Field label="Fiyat (TL)" htmlFor="urun-fiyat" optional hint="Boş bırakırsan fiyat gösterilmez.">
        <Input id="urun-fiyat" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ör. 140" />
      </Field>
      <Field label="Açıklama" htmlFor="urun-aciklama" optional>
        <Textarea id="urun-aciklama" rows={3} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="İçindekiler, porsiyon, servis şekli" />
        <CharCount value={description} max={300} />
      </Field>
      <BusinessImagePicker value={photo} onChange={setPhoto} onUploadingChange={setUploading} label="Fotoğraf" hint="İsteğe bağlı. Kare fotoğraf en iyi görünür." prefix="menu-" />
      <Field label="Etiketler" optional>
        <div className="flex flex-wrap gap-2">
          {MENU_TAG_KEYS.map((k) => (
            <FilterChip key={k} active={tags.includes(k)} onClick={() => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))} icon={MENU_TAGS[k].icon}>
              {MENU_TAGS[k].label}
            </FilterChip>
          ))}
        </div>
      </Field>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4">
        <span>
          <span className="block font-semibold">Satışta</span>
          <span className="text-sm text-muted-foreground">Kapalıysa menüde &quot;Tükendi&quot; olarak görünür.</span>
        </span>
        <Switch checked={available} onCheckedChange={setAvailable} />
      </label>
    </FormScreen>
  );
}

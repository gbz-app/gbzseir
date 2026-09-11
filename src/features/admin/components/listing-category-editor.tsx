"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { slugifyTr } from "@/core/tr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/features/listings/components/category-icon";
import { deleteListingCategoryAction, saveListingCategoryAction } from "../actions/listing-categories";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type AttrField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  required?: boolean;
  /** Filter on /ilanlar (not for free text). */
  filterable?: boolean;
  options?: Array<{ value: string; label: string }>;
};
export type ListingCategoryValue = {
  id: string;
  type: "classified" | "job";
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  sort: number;
  is_banned: boolean;
  attributes_schema: AttrField[];
};

const TYPE_LABELS: Record<AttrField["type"], string> = { text: "Metin", number: "Sayı", select: "Seçim listesi", boolean: "Evet / hayır" };
const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const keyOf = (label: string) => slugifyTr(label).replace(/-/g, "_").replace(/^[^a-z]+/, "").slice(0, 40) || "alan";

type DraftField = AttrField & { optionsText: string; uid: string };

const toDraft = (f: AttrField, i: number): DraftField => ({ ...f, optionsText: (f.options ?? []).map((o) => o.label).join("\n"), uid: `${f.key}-${i}` });

/**
 * Options from the textarea. A kept label keeps its stored value (listings and filter links use it); a new label gets
 * a slug value (digits allowed: "64 GB" -> "64_gb"), made unique within the field.
 */
function optionsOf(text: string, prev: AttrField["options"]): NonNullable<AttrField["options"]> {
  const labels = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  const known = new Map((prev ?? []).map((o) => [o.label, o.value]));
  const used = new Set(labels.flatMap((l) => known.get(l) ?? []));
  return labels.map((label) => {
    const kept = known.get(label);
    if (kept) return { value: kept, label };
    const base = slugifyTr(label).replace(/-/g, "_").slice(0, 40) || "secenek";
    let value = base;
    for (let i = 2; used.has(value); i++) value = `${base.slice(0, 36)}_${i}`;
    used.add(value);
    return { value, label };
  });
}

/** Add / edit a listing category with its attribute (özellik / filtre) fields. */
export function ListingCategoryEditor({
  type,
  roots,
  category,
  defaultParentId = null,
  trigger,
}: {
  type: "classified" | "job";
  roots: Array<{ id: string; name: string }>;
  category?: ListingCategoryValue;
  defaultParentId?: string | null;
  trigger: React.ReactElement;
}) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(category?.name ?? "");
  const [slug, setSlug] = React.useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(!!category);
  const [parentId, setParentId] = React.useState<string>(category?.parent_id ?? defaultParentId ?? "");
  const [icon, setIcon] = React.useState(category?.icon ?? "");
  const [sort, setSort] = React.useState(String(category?.sort ?? 100));
  const [banned, setBanned] = React.useState(category?.is_banned ?? false);
  const [fields, setFields] = React.useState<DraftField[]>(() => (category?.attributes_schema ?? []).map(toDraft));
  const ids = { name: React.useId(), slug: React.useId(), parent: React.useId(), icon: React.useId(), sort: React.useId() };

  const update = (uid: string, patch: Partial<DraftField>) => setFields((fs) => fs.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const next = [...fs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return fs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const attributes: AttrField[] = fields.map((f) => ({
      key: f.key || keyOf(f.label),
      label: f.label,
      type: f.type,
      required: f.required || undefined,
      filterable: (f.filterable && f.type !== "text") || undefined,
      options: f.type === "select" ? optionsOf(f.optionsText, f.options) : undefined,
    }));
    void run(
      () =>
        saveListingCategoryAction({
          id: category?.id,
          type,
          parentId: parentId || null,
          name,
          slug: slug || slugifyTr(name),
          icon: icon || null,
          sort: Number(sort),
          isBanned: banned,
          attributes,
        }),
      { onSuccess: () => setOpen(false), refresh: true },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{category ? `${category.name} düzenle` : "Yeni kategori"}</DialogTitle>
          <DialogDescription>
            Özellik alanları ilan verirken sorulur. &quot;Listede filtre&quot; açık olan seçim, sayı ve evet / hayır alanları ilan listesinde bu kategori seçilince filtre olur. Alt kategori
            boşsa ana kategorinin alanlarını kullanır.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={ids.name} className="mb-1 block text-xs font-semibold">
                Kategori adı
              </Label>
              <Input
                id={ids.name}
                value={name}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugifyTr(e.target.value));
                }}
                required
              />
            </div>
            <div>
              <Label htmlFor={ids.slug} className="mb-1 block text-xs font-semibold">
                Adres (slug)
              </Label>
              <Input
                id={ids.slug}
                value={slug}
                maxLength={60}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
              />
            </div>
            <div>
              <Label htmlFor={ids.parent} className="mb-1 block text-xs font-semibold">
                Üst kategori
              </Label>
              <select id={ids.parent} value={parentId} onChange={(e) => setParentId(e.target.value)} className={SELECT}>
                <option value="">Yok (ana kategori)</option>
                {roots
                  .filter((r) => r.id !== category?.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
              <div>
                <Label htmlFor={ids.icon} className="mb-1 block text-xs font-semibold">
                  Simge
                </Label>
                <div className="flex items-center gap-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <CategoryIcon iconName={icon} className="size-5" fallback={type === "job" ? "briefcase" : "tag"} />
                  </span>
                  <select id={ids.icon} value={icon} onChange={(e) => setIcon(e.target.value)} className={SELECT}>
                    <option value="">Varsayılan</option>
                    {CATEGORY_ICON_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor={ids.sort} className="mb-1 block text-xs font-semibold">
                  Sıra
                </Label>
                <Input id={ids.sort} type="number" min={0} value={sort} onChange={(e) => setSort(e.target.value)} />
              </div>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <span>
              <span className="block font-semibold">Yasaklı kategori</span>
              <span className="text-muted-foreground">Bu kategoride ilan verilemez (ör. emlak, vasıta, silah).</span>
            </span>
            <Switch checked={banned} onCheckedChange={setBanned} />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Özellik ve filtre alanları ({fields.length})</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFields((fs) => [...fs, { key: "", label: "", type: "text", optionsText: "", uid: `new-${Date.now()}` }])}
                disabled={fields.length >= 20}
              >
                <Plus /> Alan ekle
              </Button>
            </div>
            {fields.length === 0 ? <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">Alan yok. Örnek: Durum (seçim), Marka (metin), Garanti (evet/hayır).</p> : null}
            <ul className="grid gap-2">
              {fields.map((f, i) => (
                <li key={f.uid} className="grid gap-2 rounded-xl border p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                    <Input
                      value={f.label}
                      maxLength={60}
                      onChange={(e) => update(f.uid, { label: e.target.value, key: f.key && category ? f.key : keyOf(e.target.value) })}
                      placeholder="Alan adı (ör. Durum)"
                      aria-label="Alan adı"
                    />
                    <select value={f.type} onChange={(e) => update(f.uid, { type: e.target.value as AttrField["type"] })} className={SELECT} aria-label="Alan türü">
                      {Object.entries(TYPE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Yukarı">
                        <ChevronUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Aşağı">
                        <ChevronDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setFields((fs) => fs.filter((x) => x.uid !== f.uid))} aria-label="Alanı sil">
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {f.type === "select" ? (
                    <Textarea
                      rows={3}
                      value={f.optionsText}
                      onChange={(e) => update(f.uid, { optionsText: e.target.value })}
                      placeholder={"Her satıra bir seçenek\nSıfır\nAz kullanılmış\nİkinci el"}
                      aria-label="Seçenekler"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <label className="inline-flex items-center gap-2">
                      <Switch checked={!!f.required} onCheckedChange={(c) => update(f.uid, { required: c })} /> Zorunlu
                    </label>
                    {f.type !== "text" ? (
                      <label className="inline-flex items-center gap-2">
                        <Switch checked={!!f.filterable} onCheckedChange={(c) => update(f.uid, { filterable: c })} /> Listede filtre
                      </label>
                    ) : null}
                    <span>Anahtar: {f.key || keyOf(f.label) || "-"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            {category ? <DeleteCategory id={category.id} name={category.name} onDone={() => setOpen(false)} /> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Kaydet
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategory({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Kategori silinsin mi?"
      description={`"${name}" silinir. İçinde ilan varsa silinemez; alt kategorileri de silinir.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => {
        const res = await run(() => deleteListingCategoryAction({ id }), { refresh: true });
        if (res?.ok) onDone();
        return !!res?.ok;
      }}
    />
  );
}

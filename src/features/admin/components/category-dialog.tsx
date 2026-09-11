"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { slugifyTr } from "@/core/tr";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_ICON_NAMES, ServiceIconBubble } from "@/features/services/components/service-icon";
import { createServiceCategoryAction, deleteServiceCategoryAction, editServiceCategoryAction, updateServiceCategoryAction } from "../actions/categories";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type ServiceCategoryValue = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  synonyms: string[];
  sort: number;
  active: boolean;
};

export type CategoryRoot = { id: string; name: string };

type Run = ReturnType<typeof useAdminAction>["run"];

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60";
const splitWords = (s: string) =>
  s
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);

/** Add / edit a service category: name, slug, parent, icon, description, search words, sort. Delete lives in the edit view. */
export function CategoryDialog({
  category,
  roots,
  defaultParentId = null,
  hasChildren = false,
  trigger,
}: {
  category?: ServiceCategoryValue;
  roots: CategoryRoot[];
  defaultParentId?: string | null;
  hasChildren?: boolean;
  trigger: React.ReactElement;
}) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{category ? `${category.name} düzenle` : "Yeni hizmet kategorisi"}</DialogTitle>
          <DialogDescription>Ana kategoriler Hizmetler sayfasında grup olur; talepler, firmalar ve soru akışları alt kategorilere bağlanır.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from the saved values. */}
        <CategoryForm
          category={category}
          roots={roots}
          defaultParentId={defaultParentId}
          hasChildren={hasChildren}
          pending={pending}
          run={run}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  roots,
  defaultParentId,
  hasChildren,
  pending,
  run,
  onDone,
}: {
  category?: ServiceCategoryValue;
  roots: CategoryRoot[];
  defaultParentId: string | null;
  hasChildren: boolean;
  pending: boolean;
  run: Run;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(category?.name ?? "");
  const [slug, setSlug] = React.useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(!!category);
  const [parentId, setParentId] = React.useState<string>(category ? (category.parent_id ?? "") : (defaultParentId ?? ""));
  const [icon, setIcon] = React.useState(category?.icon ?? "");
  const [description, setDescription] = React.useState(category?.description ?? "");
  const [synonyms, setSynonyms] = React.useState((category?.synonyms ?? []).join(", "));
  const [sort, setSort] = React.useState(String(category?.sort ?? 100));
  const [active, setActive] = React.useState(true);
  const ids = {
    name: React.useId(),
    slug: React.useId(),
    parent: React.useId(),
    icon: React.useId(),
    sort: React.useId(),
    desc: React.useId(),
    syn: React.useId(),
  };

  // A main category with sub-categories stays a main one (the database refuses the move too).
  const lockedRoot = !!category && !category.parent_id && hasChildren;
  const finalSlug = slugifyTr(slug || name, 60);
  const slugChanged = !!category && !!finalSlug && finalSlug !== category.slug;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fields = {
      parentId: parentId || null,
      name,
      slug,
      icon: icon || null,
      description,
      synonyms: splitWords(synonyms),
      sort: Number(sort),
    };
    void run(() => (category ? editServiceCategoryAction({ id: category.id, ...fields }) : createServiceCategoryAction({ ...fields, active })), {
      onSuccess: onDone,
      refresh: true,
    });
  };

  return (
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
              if (!slugTouched) setSlug(slugifyTr(e.target.value, 60));
            }}
            placeholder="ör. Klima servisi"
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
              setSlug(e.target.value);
            }}
            aria-describedby={`${ids.slug}-hint`}
          />
          <p id={`${ids.slug}-hint`} className="mt-1 text-xs break-all text-muted-foreground">
            {finalSlug ? routes.services.category(finalSlug) : "Addan otomatik oluşur."}
            {slugChanged ? " · Eski bağlantı çalışmaz." : null}
          </p>
        </div>
        <div>
          <Label htmlFor={ids.parent} className="mb-1 block text-xs font-semibold">
            Üst kategori
          </Label>
          <select id={ids.parent} value={parentId} onChange={(e) => setParentId(e.target.value)} className={SELECT} disabled={lockedRoot}>
            <option value="">Yok (ana kategori)</option>
            {roots
              .filter((r) => r.id !== category?.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
          {lockedRoot ? <p className="mt-1 text-xs text-muted-foreground">Alt kategorileri olduğu için ana kategori olarak kalır.</p> : null}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <div>
            <Label htmlFor={ids.icon} className="mb-1 block text-xs font-semibold">
              Simge
            </Label>
            <div className="flex items-center gap-2">
              <ServiceIconBubble name={icon || null} size="sm" />
              <select id={ids.icon} value={icon} onChange={(e) => setIcon(e.target.value)} className={SELECT}>
                <option value="">Varsayılan</option>
                {SERVICE_ICON_NAMES.map((n) => (
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
            <Input id={ids.sort} type="number" inputMode="numeric" min={0} max={10000} value={sort} onChange={(e) => setSort(e.target.value)} required />
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor={ids.desc} className="mb-1 block text-xs font-semibold">
          Kısa açıklama
        </Label>
        <Textarea id={ids.desc} rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ör. Montaj, bakım ve gaz dolumu" />
      </div>
      <div>
        <Label htmlFor={ids.syn} className="mb-1 block text-xs font-semibold">
          Arama kelimeleri
        </Label>
        <Textarea
          id={ids.syn}
          rows={2}
          value={synonyms}
          onChange={(e) => setSynonyms(e.target.value)}
          placeholder="klima, split klima, klima gazı"
          aria-describedby={`${ids.syn}-hint`}
        />
        <p id={`${ids.syn}-hint`} className="mt-1 text-xs text-muted-foreground">
          Virgülle ayır. Aramada bu kelimeler de bu kategoriyi bulur.
        </p>
      </div>
      {!category ? (
        <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
          <span>
            <span className="block font-semibold">Hemen yayınla</span>
            <span className="text-muted-foreground">Kapalıysa pasif eklenir; soru akışını hazırlayıp sonra açabilirsin.</span>
          </span>
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        {category ? <DeleteCategory category={category} onDone={onDone} /> : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Kaydet
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Delete with a check: a category in use is not deleted; the dialog then offers to deactivate it. */
function DeleteCategory({ category, onDone }: { category: ServiceCategoryValue; onDone: () => void }) {
  const router = useRouter();
  const [blocked, setBlocked] = React.useState<string | null>(null);

  const remove = async () => {
    try {
      const res = await deleteServiceCategoryAction({ id: category.id });
      if (res.ok) {
        toast.success(res.message ?? "Kategori silindi.");
        onDone();
        router.refresh();
        return true;
      }
      if (res.hint === "in_use") {
        setBlocked(res.error);
        return false;
      }
      toast.error(res.error);
      return false;
    } catch {
      toast.error("Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.");
      return false;
    }
  };

  const deactivate = async () => {
    if (!category.active) return true;
    try {
      const res = await updateServiceCategoryAction({ id: category.id, active: false });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success("Kategori pasif yapıldı; sitede artık görünmez.");
      onDone();
      router.refresh();
      return true;
    } catch {
      toast.error("Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.");
      return false;
    }
  };

  return (
    <ConfirmDialog
      title={blocked ? "Kategori silinemez" : "Kategori silinsin mi?"}
      description={
        blocked
          ? category.active
            ? blocked
            : `${blocked} Kategori zaten pasif.`
          : `"${category.name}" ve soru akışları silinir. Firma, talep ya da alt kategori bağlıysa silinmez; o zaman pasif yapabilirsin.`
      }
      confirmLabel={blocked ? (category.active ? "Pasif yap" : "Tamam") : "Sil"}
      destructive={!blocked}
      onOpenChange={(o) => {
        if (!o) setBlocked(null);
      }}
      trigger={
        <Button type="button" variant="ghost" className="text-destructive">
          <Trash2 aria-hidden /> Sil
        </Button>
      }
      onConfirm={blocked ? deactivate : remove}
    />
  );
}

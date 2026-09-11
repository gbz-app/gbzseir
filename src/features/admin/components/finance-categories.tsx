"use client";

import * as React from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createFinanceCategoryAction, deleteFinanceCategoryAction, setFinanceCategoryActiveAction, updateFinanceCategoryAction } from "../actions/finance";
import { ConfirmDialog } from "./confirm-dialog";
import type { FinanceCategoryOption } from "./finance-entry-dialog";
import { useAdminAction } from "./use-admin-action";

/** Finance categories: add, rename / recolour, delete (unused only) and hide/show (hidden ones stay on old entries). */
export function FinanceCategories({ categories }: { categories: FinanceCategoryOption[] }) {
  const { pending, run } = useAdminAction();
  const [kind, setKind] = React.useState<"income" | "expense">("expense");
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#8c6cf0");

  const group = (k: "income" | "expense") => (
    <div>
      <p className="mb-2 text-sm font-semibold">{k === "income" ? "Gelir kategorileri" : "Gider kategorileri"}</p>
      <ul className="flex flex-col gap-1">
        {categories
          .filter((c) => c.kind === k)
          .map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-sm">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
              <span className={c.is_active ? "min-w-0 flex-1 truncate pl-0.5" : "min-w-0 flex-1 truncate pl-0.5 text-muted-foreground line-through"}>{c.name}</span>
              <CategoryEditDialog category={c} />
              <CategoryDeleteButton category={c} />
              <Switch
                checked={c.is_active}
                disabled={pending}
                aria-label={`${c.name} kullanımda`}
                onCheckedChange={(v) => run(() => setFinanceCategoryActiveAction({ id: c.id, active: v }))}
              />
            </li>
          ))}
      </ul>
    </div>
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {group("income")}
        {group("expense")}
      </div>
      <form
        className="flex flex-wrap items-center gap-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => createFinanceCategoryAction({ kind, name, color }), { onSuccess: () => setName("") });
        }}
      >
        <select value={kind} onChange={(e) => setKind(e.target.value as "income" | "expense")} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Tür">
          <option value="expense">Gider</option>
          <option value="income">Gelir</option>
        </select>
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Yeni kategori adı" aria-label="Kategori adı" className="w-48 flex-1" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Renk" className="h-10 w-12 cursor-pointer rounded-md border bg-background p-1" />
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
          <Plus /> Ekle
        </Button>
      </form>
    </div>
  );
}

/** Rename / recolour; entries keep the category, so they show the new name and colour. */
function CategoryEditDialog({ category }: { category: FinanceCategoryOption }) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [color, setColor] = React.useState(category.color);
  const nameId = React.useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setName(category.name);
          setColor(category.color);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${category.name} kategorisini düzenle`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kategoriyi düzenle</DialogTitle>
          <DialogDescription>Yeni ad ve renk, bu kategorideki eski kayıtlarda da görünür.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => updateFinanceCategoryAction({ id: category.id, name, color }), { onSuccess: () => setOpen(false) });
          }}
        >
          <div>
            <Label htmlFor={nameId} className="mb-1 block text-xs font-semibold">
              Kategori adı
            </Label>
            <div className="flex gap-2">
              <Input id={nameId} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required className="flex-1" />
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Renk" className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Delete; the server refuses a category that is used by any entry (hide it instead). */
function CategoryDeleteButton({ category }: { category: FinanceCategoryOption }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Kategori silinsin mi?"
      description={`"${category.name}" kalıcı olarak silinir. Kayıtlarda kullanılan bir kategori silinemez; onu gizleyebilirsin.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`${category.name} kategorisini sil`}>
          <Trash2 className="text-destructive" />
        </Button>
      }
      onConfirm={async () => {
        await run(() => deleteFinanceCategoryAction({ id: category.id }));
      }}
    />
  );
}

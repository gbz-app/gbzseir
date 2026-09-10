"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createFinanceCategoryAction, setFinanceCategoryActiveAction } from "../actions/finance";
import type { FinanceCategoryOption } from "./finance-entry-dialog";
import { useAdminAction } from "./use-admin-action";

/** Finance categories: add + hide/show (hidden ones stay on old entries). */
export function FinanceCategories({ categories }: { categories: FinanceCategoryOption[] }) {
  const { pending, run } = useAdminAction();
  const [kind, setKind] = React.useState<"income" | "expense">("expense");
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#8c6cf0");

  const group = (k: "income" | "expense") => (
    <div>
      <p className="mb-2 text-sm font-semibold">{k === "income" ? "Gelir kategorileri" : "Gider kategorileri"}</p>
      <ul className="flex flex-col gap-1.5">
        {categories
          .filter((c) => c.kind === k)
          .map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
              <span className={c.is_active ? "flex-1" : "flex-1 text-muted-foreground line-through"}>{c.name}</span>
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

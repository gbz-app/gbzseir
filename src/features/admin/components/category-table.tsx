"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, ListChecks, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { routes } from "@/core/routes";
import { ServiceIcon } from "@/features/services/components/service-icon";
import { updateServiceCategoryAction } from "../actions/categories";
import { CategoryDialog, type CategoryRoot, type ServiceCategoryValue } from "./category-dialog";
import { useAdminAction } from "./use-admin-action";

export type CategoryRowData = ServiceCategoryValue & {
  popular: boolean;
  auto_dispatch: boolean;
  /** null = the admin default (Ayarlar > max_providers_default). */
  max_providers: number | null;
  notify_pool_size: number;
  flowVersion: number | null;
  flowCount: number;
};

type Patch = Omit<Parameters<typeof updateServiceCategoryAction>[0], "id">;

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  onLabel,
  offLabel,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 lg:justify-center">
      <label htmlFor={id} className="text-sm text-muted-foreground lg:sr-only">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
        {onLabel ? <span className={cn("w-20 text-xs font-semibold", checked ? "text-success" : "text-muted-foreground")}>{checked ? onLabel : offLabel}</span> : null}
      </div>
    </div>
  );
}

function NumberCell({
  label,
  value,
  min,
  max,
  onCommit,
  disabled,
  fallback,
}: {
  label: string;
  /** null = not set: the input stays empty and shows `fallback` as a placeholder. */
  value: number | null;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  fallback?: number;
}) {
  const id = React.useId();
  const shown = value === null ? "" : String(value);
  const [draft, setDraft] = React.useState(shown);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(n) || n < min || n > max) {
      setDraft(shown);
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 lg:justify-center">
      <label htmlFor={id} className="text-sm text-muted-foreground lg:sr-only">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        placeholder={value === null && fallback !== undefined ? String(fallback) : undefined}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(shown);
        }}
        className="h-10 w-20 text-center tabular-nums"
        aria-describedby={`${id}-range`}
      />
      <span id={`${id}-range`} className="sr-only">
        {min} ile {max} arası{value === null && fallback !== undefined ? `, boş: varsayılan ${fallback}` : ""}
      </span>
    </div>
  );
}

/** "Yeni kategori" button (page header). */
export function NewCategoryButton({ roots }: { roots: CategoryRoot[] }) {
  return (
    <CategoryDialog
      roots={roots}
      trigger={
        <Button>
          <Plus aria-hidden /> Yeni kategori
        </Button>
      }
    />
  );
}

/** One category row. Optimistic local state; remounted (via key) whenever the server values change. */
function CategoryRow({
  row,
  isParent,
  roots,
  hasChildren,
  defaultMaxProviders,
}: {
  row: CategoryRowData;
  isParent: boolean;
  roots: CategoryRoot[];
  hasChildren: boolean;
  defaultMaxProviders: number;
}) {
  const { pending, run } = useAdminAction();
  const [state, setState] = React.useState(row);

  const save = (patch: Patch) => {
    setState((s) => ({ ...s, ...patch }));
    void run(() => updateServiceCategoryAction({ id: row.id, ...patch }), {
      onError: () => setState(row),
    });
  };

  return (
    <div
      className={cn(
        "grid items-center gap-x-3 px-4 py-3 lg:grid-cols-[minmax(0,1.7fr)_5.5rem_5.5rem_9.5rem_6rem_6rem_9rem]",
        isParent ? "bg-muted/60" : "border-t",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2 py-1">
        <div className="flex min-w-0 items-start gap-2">
          <ServiceIcon name={row.icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className={cn("font-semibold break-words", isParent && "font-heading text-base font-bold")}>{row.name}</p>
            <p className="text-xs break-all text-muted-foreground">
              {row.slug}
              {!state.active ? (
                <Badge variant="outline" className="ml-2">
                  Pasif
                </Badge>
              ) : null}
            </p>
          </div>
        </div>
        <div className="-my-1 flex shrink-0 items-center">
          {isParent ? (
            <CategoryDialog
              roots={roots}
              defaultParentId={row.id}
              trigger={
                <Button type="button" variant="ghost" size="icon" className="lg:size-9" aria-label={`${row.name} altına kategori ekle`}>
                  <Plus aria-hidden />
                </Button>
              }
            />
          ) : null}
          <CategoryDialog
            category={row}
            roots={roots}
            hasChildren={hasChildren}
            trigger={
              <Button type="button" variant="ghost" size="icon" className="lg:size-9" aria-label={`${row.name} düzenle`}>
                <Pencil aria-hidden />
              </Button>
            }
          />
        </div>
      </div>
      <Toggle label="Aktif" checked={state.active} disabled={pending} onChange={(v) => save({ active: v })} />
      <Toggle label="Popüler" checked={state.popular} disabled={pending} onChange={(v) => save({ popular: v })} />
      {isParent ? (
        <p className="hidden text-center text-xs text-muted-foreground lg:block">-</p>
      ) : (
        <Toggle label="Eşleştirme" checked={state.auto_dispatch} disabled={pending} onChange={(v) => save({ auto_dispatch: v })} onLabel="Otomatik" offLabel="Concierge" />
      )}
      {isParent ? (
        <>
          <span className="hidden lg:block" />
          <span className="hidden lg:block" />
          <span className="hidden lg:block" />
        </>
      ) : (
        <>
          <NumberCell
            label="Kabul limiti"
            value={state.max_providers}
            fallback={defaultMaxProviders}
            min={1}
            max={10}
            disabled={pending}
            onCommit={(v) => save({ max_providers: v })}
          />
          <NumberCell label="Bildirim havuzu" value={state.notify_pool_size} min={1} max={50} disabled={pending} onCommit={(v) => save({ notify_pool_size: v })} />
          <div className="flex min-h-11 items-center justify-between gap-2 lg:justify-end">
            <span className="text-sm text-muted-foreground lg:sr-only">Soru akışı</span>
            <Link
              href={routes.admin.serviceCategory(row.id)}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-muted"
            >
              <ListChecks className="size-4" aria-hidden />
              {row.flowVersion ? `Sürüm ${row.flowVersion}` : "Akış yok"}
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function CategoryTable({ categories, defaultMaxProviders }: { categories: CategoryRowData[]; defaultMaxProviders: number }) {
  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);
  const roots: CategoryRoot[] = parents.map((p) => ({ id: p.id, name: p.name }));
  const keyOf = (r: CategoryRowData) => [r.id, r.active, r.popular, r.auto_dispatch, r.max_providers, r.notify_pool_size].join(":");

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
      <div
        className="hidden border-b px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(0,1.7fr)_5.5rem_5.5rem_9.5rem_6rem_6rem_9rem] lg:gap-x-3"
        aria-hidden
      >
        <span>Kategori</span>
        <span className="text-center">Aktif</span>
        <span className="text-center">Popüler</span>
        <span className="text-center">Eşleştirme</span>
        <span className="text-center">Kabul limiti</span>
        <span className="text-center">Bild. havuzu</span>
        <span className="text-right">Soru akışı</span>
      </div>
      {parents.map((p) => {
        const children = childrenOf(p.id);
        return (
          <div key={p.id} className="border-b last:border-b-0">
            <CategoryRow key={keyOf(p)} row={p} isParent roots={roots} hasChildren={children.length > 0} defaultMaxProviders={defaultMaxProviders} />
            {children.map((c) => (
              <CategoryRow key={keyOf(c)} row={c} isParent={false} roots={roots} hasChildren={false} defaultMaxProviders={defaultMaxProviders} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

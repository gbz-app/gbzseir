"use client";

import * as React from "react";
import { CircleCheck, CircleSlash, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FilterChip } from "@/components/shared/explore-header";
import { CATEGORY_ICON_NAMES, categoryIcon } from "@/features/business/lib/category-visuals";
import { BUSINESS_VERTICALS, VERTICAL_INFO, VOCAB_ICON_NAMES, subcategoryMatcher, type Vertical } from "@/features/business/lib/verticals";
import {
  deleteAmenityAction,
  deleteEventCategoryAction,
  deleteNewsCategoryAction,
  deletePlaceCategoryAction,
  deleteSubcategoryAction,
  saveAmenityAction,
  saveEventCategoryAction,
  saveNewsCategoryAction,
  savePlaceCategoryAction,
  saveSubcategoryAction,
} from "../actions/vocabularies";
import type { ActionResult } from "../lib/action-result";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type SubcategoryValue = { id: string; vertical: Vertical; key: string; label: string; keywords: string[]; exclude: string[]; sort: number; active: boolean };
export type AmenityScope = "business" | "room";
export type AmenityValue = { id: string; scope: AmenityScope; key: string; label: string; icon: string | null; verticals: Vertical[]; sort: number; active: boolean };
/** event_categories, news_categories and place_categories share this shape. */
export type CategoryKind = "event" | "news" | "place";
export type CategoryValue = { id: string; key: string; label: string; icon: string | null; sort: number; active: boolean };

/** Terms from a textarea: one per line (commas also split). */
const termsOf = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

/** Lucide icon of a vocabulary row (decorative). categoryIcon knows every name the editors offer. */
export function VocabIconView({ name, className }: { name: string | null | undefined; className?: string }) {
  return React.createElement(categoryIcon(name), { className, "aria-hidden": true });
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold">
      {children}
    </Label>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-xs text-muted-foreground">{children}</p>;

function LabelAndSort({ label, onLabel, sort, onSort, max, placeholder }: { label: string; onLabel: (v: string) => void; sort: string; onSort: (v: string) => void; max: number; placeholder: string }) {
  const ids = { label: React.useId(), sort: React.useId() };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
      <div>
        <FieldLabel htmlFor={ids.label}>Ad</FieldLabel>
        <Input id={ids.label} value={label} maxLength={max} onChange={(e) => onLabel(e.target.value)} placeholder={placeholder} required />
      </div>
      <div>
        <FieldLabel htmlFor={ids.sort}>Sıra</FieldLabel>
        <Input id={ids.sort} type="number" min={0} max={10000} value={sort} onChange={(e) => onSort(e.target.value)} />
      </div>
    </div>
  );
}

function ActiveSwitch({ checked, onChange, text }: { checked: boolean; onChange: (v: boolean) => void; text: string }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
      <span>
        <span className="block font-semibold">Aktif</span>
        <span className="text-muted-foreground">{text}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function IconPicker({ names = VOCAB_ICON_NAMES, value, onChange }: { names?: readonly string[]; value: string; onChange: (name: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold">Simge</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Simge">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={n}
            title={n}
            onClick={() => onChange(value === n ? "" : n)}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              value === n ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
            )}
          >
            <VocabIconView name={n} className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

function EditorShell({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  pending,
  onSubmit,
  footerStart,
  children,
}: {
  title: string;
  description: string;
  trigger: React.ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: () => void;
  footerStart?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="grid gap-4"
        >
          {children}
          <div className="flex flex-wrap justify-between gap-2">
            {footerStart ?? <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
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

function DeleteButton({ title, description, action, onDone }: { title: string; description: string; action: () => Promise<ActionResult<null>>; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title={title}
      description={description}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => {
        const res = await run(action, { refresh: true });
        if (res?.ok) onDone();
        return !!res?.ok;
      }}
    />
  );
}

/** Add / edit a keşfet chip: label, keywords, exclude phrases, order, active; with a live match test. */
export function SubcategoryEditor({ vertical, item, trigger }: { vertical: Vertical; item?: SubcategoryValue; trigger: React.ReactElement }) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(item?.label ?? "");
  const [keywords, setKeywords] = React.useState((item?.keywords ?? []).join("\n"));
  const [exclude, setExclude] = React.useState((item?.exclude ?? []).join("\n"));
  const [sort, setSort] = React.useState(String(item?.sort ?? 100));
  const [active, setActive] = React.useState(item?.active ?? true);
  const [sample, setSample] = React.useState("");
  const ids = { keywords: React.useId(), exclude: React.useId(), sample: React.useId() };
  const verdict = sample.trim() ? subcategoryMatcher({ key: "deneme", label, keywords: termsOf(keywords), exclude: termsOf(exclude) })(sample) : null;

  const submit = () =>
    void run(() => saveSubcategoryAction({ id: item?.id, vertical, label, keywords: termsOf(keywords), exclude: termsOf(exclude), sort: Number(sort), active }), {
      refresh: true,
      onSuccess: () => {
        setOpen(false);
        if (!item) {
          setLabel("");
          setKeywords("");
          setExclude("");
          setSample("");
        }
      },
    });

  return (
    <EditorShell
      title={item ? `${item.label} chip'ini düzenle` : `${VERTICAL_INFO[vertical].plural}: yeni chip`}
      description="Chip, keşfet listesindeki işletmeleri anahtar kelimelerle süzer. Kelimeler işletmenin kısa tanımında, adında ve açıklamasında kelime başında aranır; Türkçe harf farkı gözetilmez."
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      pending={pending}
      onSubmit={submit}
      footerStart={
        item ? (
          <DeleteButton
            title="Chip silinsin mi?"
            description={`"${item.label}" keşfet listesinden kalkar. Geçici gizlemek için pasife alabilirsin.`}
            action={() => deleteSubcategoryAction({ id: item.id })}
            onDone={() => setOpen(false)}
          />
        ) : null
      }
    >
      <LabelAndSort label={label} onLabel={setLabel} sort={sort} onSort={setSort} max={40} placeholder="ör. Pideci" />
      <div>
        <FieldLabel htmlFor={ids.keywords}>Anahtar kelimeler</FieldLabel>
        <Textarea id={ids.keywords} rows={4} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={"Her satıra bir kelime\npide\nlahmacun"} />
        <Hint>{"Kelimenin başı yeter: \"pide\" hem Pide hem Pideci demek. En az bir kelime yaz."}</Hint>
      </div>
      <div>
        <FieldLabel htmlFor={ids.exclude}>Hariç ifadeler</FieldLabel>
        <Textarea id={ids.exclude} rows={2} value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="ör. çiğ köfte" />
        <Hint>{"Eşleştirmeden önce metinden çıkarılır: Köfte chip'inde \"çiğ köfte\" yazılıysa çiğ köfteciler Köfte'ye girmez."}</Hint>
      </div>
      <div>
        <FieldLabel htmlFor={ids.sample}>Dene</FieldLabel>
        <Input id={ids.sample} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="ör. Karadeniz Pide Salonu" />
        {verdict !== null ? (
          <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-semibold", verdict ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} aria-live="polite">
            {verdict ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleSlash className="size-3.5" aria-hidden />}
            {verdict ? "Bu chip'te listelenir" : "Bu chip'te listelenmez"}
          </p>
        ) : null}
      </div>
      <ActiveSwitch checked={active} onChange={setActive} text="Kapalıysa chip keşfet listesinde görünmez." />
      {item ? <p className="text-xs text-muted-foreground">Anahtar: {item.key}</p> : null}
    </EditorShell>
  );
}

/** Add / edit an amenity (scope business: offered to the chosen verticals) or a hotel room feature. */
export function AmenityEditor({ scope, item, trigger }: { scope: AmenityScope; item?: AmenityValue; trigger: React.ReactElement }) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(item?.label ?? "");
  const [icon, setIcon] = React.useState(item?.icon ?? "");
  const [verticals, setVerticals] = React.useState<Vertical[]>(item?.verticals ?? []);
  const [sort, setSort] = React.useState(String(item?.sort ?? 100));
  const [active, setActive] = React.useState(item?.active ?? true);
  const room = scope === "room";
  const allOn = BUSINESS_VERTICALS.every((v) => verticals.includes(v));
  const toggle = (v: Vertical) => setVerticals((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  const submit = () =>
    void run(() => saveAmenityAction({ id: item?.id, scope, label, icon: icon || null, verticals: room ? [] : verticals, sort: Number(sort), active }), {
      refresh: true,
      onSuccess: () => {
        setOpen(false);
        if (!item) {
          setLabel("");
          setIcon("");
          setVerticals([]);
        }
      },
    });

  return (
    <EditorShell
      title={item ? `${item.label} düzenle` : room ? "Yeni oda özelliği" : "Yeni olanak"}
      description={
        room
          ? "Otel odası eklerken seçilir, oda kartında görünür."
          : "İşletme sayfasını düzenlerken seçilir ve işletme sayfasında görünür. Yalnızca seçtiğin işletme türlerine sunulur."
      }
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      pending={pending}
      onSubmit={submit}
      footerStart={
        item ? (
          <DeleteButton
            title="Silinsin mi?"
            description={`"${item.label}" silinir. Seçen ${room ? "oda" : "işletme"} varsa silinmez; pasife alabilirsin.`}
            action={() => deleteAmenityAction({ id: item.id })}
            onDone={() => setOpen(false)}
          />
        ) : null
      }
    >
      <LabelAndSort label={label} onLabel={setLabel} sort={sort} onSort={setSort} max={60} placeholder={room ? "ör. Jakuzi" : "ör. Nargile"} />
      <IconPicker value={icon} onChange={setIcon} />
      {room ? null : (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">İşletme türleri</p>
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={() => setVerticals((s) => (allOn ? s.filter((v) => !BUSINESS_VERTICALS.includes(v)) : [...new Set([...s, ...BUSINESS_VERTICALS])]))}
            >
              {allOn ? "Hiçbiri" : "Tümü"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {BUSINESS_VERTICALS.map((v) => (
              <FilterChip key={v} active={verticals.includes(v)} onClick={() => toggle(v)} icon={VERTICAL_INFO[v].icon}>
                {VERTICAL_INFO[v].label}
              </FilterChip>
            ))}
          </div>
        </div>
      )}
      <ActiveSwitch
        checked={active}
        onChange={setActive}
        text={room ? "Kapalıysa oda eklerken seçilemez ve oda kartlarında görünmez." : "Kapalıysa seçilemez ve işletme sayfalarında görünmez."}
      />
      {item ? <p className="text-xs text-muted-foreground">Anahtar: {item.key}</p> : null}
    </EditorShell>
  );
}

type CategorySaveInput = { id?: string; label: string; icon: string | null; sort: number; active: boolean };

const CATEGORY_KINDS: Record<
  CategoryKind,
  {
    newTitle: string;
    description: string;
    placeholder: string;
    activeText: string;
    deleteText: string;
    icons: readonly string[];
    save: (input: CategorySaveInput) => Promise<ActionResult<null>>;
    remove: (input: { id: string }) => Promise<ActionResult<null>>;
  }
> = {
  event: {
    newTitle: "Yeni etkinlik kategorisi",
    description: "Etkinlik eklerken seçilir; etkinlik kartında ve Etkinlikler sayfasındaki kategori filtresinde görünür.",
    placeholder: "ör. Stand-up",
    activeText: "Kapalıysa yeni etkinliklerde seçilemez; eski etkinliklerde görünmeye devam eder.",
    deleteText: "Bu kategoride etkinlik varsa silinmez; pasife alabilirsin.",
    icons: VOCAB_ICON_NAMES,
    save: saveEventCategoryAction,
    remove: deleteEventCategoryAction,
  },
  news: {
    newTitle: "Yeni haber kategorisi",
    description: "Haber eklerken seçilir; haber kartlarında ve Haberler sayfasındaki filtrede görünür. Fotoğrafı olmayan haberin kapağında simgesi durur.",
    placeholder: "ör. Ekonomi",
    activeText: "Kapalıysa haber eklerken seçilemez; eski haberlerde ve kaynak haberlerinde görünmeye devam eder.",
    deleteText: "Bu kategoride haber varsa silinmez; pasife alabilirsin.",
    icons: CATEGORY_ICON_NAMES,
    save: saveNewsCategoryAction,
    remove: deleteNewsCategoryAction,
  },
  place: {
    newTitle: "Yeni yer kategorisi",
    description: "Gezilecek yer eklerken seçilir; yer kartlarında ve Gezilecek Yerler sayfasındaki filtrede görünür. Fotoğrafı olmayan yerin kapağında simgesi durur.",
    placeholder: "ör. Plaj",
    activeText: "Kapalıysa yer eklerken seçilemez; mevcut yerlerde görünmeye devam eder.",
    deleteText: "Bu kategoride yer varsa silinmez; pasife alabilirsin.",
    icons: CATEGORY_ICON_NAMES,
    save: savePlaceCategoryAction,
    remove: deletePlaceCategoryAction,
  },
};

/** Add / edit an event, news or place category. `deletable` is false for the keys the database always keeps. */
export function CategoryEditor({ kind, item, deletable = true, trigger }: { kind: CategoryKind; item?: CategoryValue; deletable?: boolean; trigger: React.ReactElement }) {
  const cfg = CATEGORY_KINDS[kind];
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(item?.label ?? "");
  const [icon, setIcon] = React.useState(item?.icon ?? "");
  const [sort, setSort] = React.useState(String(item?.sort ?? 100));
  const [active, setActive] = React.useState(item?.active ?? true);

  const submit = () =>
    void run(() => cfg.save({ id: item?.id, label, icon: icon || null, sort: Number(sort), active }), {
      refresh: true,
      onSuccess: () => {
        setOpen(false);
        if (!item) {
          setLabel("");
          setIcon("");
        }
      },
    });

  return (
    <EditorShell
      title={item ? `${item.label} düzenle` : cfg.newTitle}
      description={cfg.description}
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      pending={pending}
      onSubmit={submit}
      footerStart={
        item && deletable ? (
          <DeleteButton
            title="Kategori silinsin mi?"
            description={`"${item.label}" silinir. ${cfg.deleteText}`}
            action={() => cfg.remove({ id: item.id })}
            onDone={() => setOpen(false)}
          />
        ) : null
      }
    >
      <LabelAndSort label={label} onLabel={setLabel} sort={sort} onSort={setSort} max={40} placeholder={cfg.placeholder} />
      <IconPicker names={cfg.icons} value={icon} onChange={setIcon} />
      <ActiveSwitch checked={active} onChange={setActive} text={cfg.activeText} />
      {item ? <p className="text-xs text-muted-foreground">Anahtar: {item.key}</p> : null}
    </EditorShell>
  );
}

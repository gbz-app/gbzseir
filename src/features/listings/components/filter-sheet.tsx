"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { CONDITIONS, EXPERIENCE_LEVELS, JOB_LOCATIONS, WORK_TYPES } from "../constants";
import { emptyQuery, type ListingsQuery } from "../filters";
import { digitsOnly, groupDigits } from "../format";
import type { ListingCategory, NeighbourhoodRef } from "../types";
import { ChoiceChips } from "./choice-chips";

export type FilterSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: ListingsQuery;
  /** Categories of the current tab (2. el categories or job sectors). */
  categories: ListingCategory[];
  neighbourhood: NeighbourhoodRef | null;
  onApply: (q: ListingsQuery) => void;
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-2.5 text-[15px] font-bold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** E2: filter bottom sheet. Mount with a new `key` every time it opens so the draft starts from the URL state. */
export function FilterSheet({ open, onOpenChange, query, categories, neighbourhood, onApply }: FilterSheetProps) {
  const [draft, setDraft] = React.useState<ListingsQuery>(query);
  const [nb, setNb] = React.useState<NeighbourhoodRef | null>(neighbourhood);
  const isJob = query.tab === "is-ilanlari";

  const tops = categories.filter((c) => !c.parent_id);
  const selected = categories.find((c) => c.slug === draft.kategori) ?? null;
  const activeTop = selected ? (selected.parent_id ? (categories.find((c) => c.id === selected.parent_id) ?? null) : selected) : null;
  const children = activeTop ? categories.filter((c) => c.parent_id === activeTop.id) : [];

  const patch = (p: Partial<ListingsQuery>) => setDraft((d) => ({ ...d, ...p }));

  const apply = () => {
    let { min, max } = draft;
    if (min != null && max != null && min > max) [min, max] = [max, min];
    onApply({ ...draft, min, max, mahalle: nb?.slug || null });
    onOpenChange(false);
  };

  const clear = () => {
    const e = emptyQuery(query.tab);
    setDraft({ ...e, q: query.q, sirala: query.sirala });
    setNb(null);
  };

  const priceValue = (n: number | null) => (n == null ? "" : groupDigits(String(n)));
  const parsePrice = (v: string) => {
    const d = digitsOnly(v).slice(0, 8);
    return d ? Number(d) : null;
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filtrele"
      description={isJob ? "İş ilanlarını daralt." : "2. el ilanları daralt."}
      fullHeight
      repositionInputs={false}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" className="flex-1" onClick={clear}>
            Temizle
          </Button>
          <Button type="button" size="lg" className="flex-[2]" onClick={apply}>
            Sonuçları göster
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7 pt-1 pb-4">
        <Section id="filtre-kategori" title={isJob ? "Sektör" : "Kategori"}>
          <ChoiceChips
            size="sm"
            ariaLabelledBy="filtre-kategori"
            options={[{ value: "", label: "Tümü" }, ...tops.map((c) => ({ value: c.slug, label: c.name }))]}
            value={activeTop?.slug ?? ""}
            onChange={(v) => patch({ kategori: v || null })}
          />
          {activeTop && children.length ? (
            <div className="mt-3 rounded-2xl bg-muted/60 p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{activeTop.name} içinde</p>
              <ChoiceChips
                size="sm"
                ariaLabel={`${activeTop.name} alt kategorileri`}
                options={[{ value: activeTop.slug, label: "Hepsi" }, ...children.map((c) => ({ value: c.slug, label: c.name }))]}
                value={draft.kategori}
                onChange={(v) => patch({ kategori: v || activeTop.slug })}
              />
            </div>
          ) : null}
        </Section>

        {!isJob ? (
          <>
            <Section id="filtre-fiyat" title="Fiyat aralığı (TL)">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  inputMode="numeric"
                  aria-label="En düşük fiyat"
                  placeholder="En az"
                  value={priceValue(draft.min)}
                  onChange={(e) => patch({ min: parsePrice(e.target.value) })}
                />
                <Input
                  inputMode="numeric"
                  aria-label="En yüksek fiyat"
                  placeholder="En çok"
                  value={priceValue(draft.max)}
                  onChange={(e) => patch({ max: parsePrice(e.target.value) })}
                />
              </div>
            </Section>
            <Section id="filtre-mahalle" title="Mahalle">
              <NeighbourhoodPicker
                value={nb?.id ?? null}
                onChange={(n) => setNb(n && n.slug ? { id: String(n.id), name: n.name, slug: n.slug } : null)}
                persistDefault={false}
                allowClear
                placeholder="Tüm mahalleler"
                title="Mahalle seç"
              />
            </Section>
            <Section id="filtre-durum" title="Durum">
              <ChoiceChips
                size="sm"
                ariaLabelledBy="filtre-durum"
                options={[{ value: "", label: "Tümü" }, ...CONDITIONS]}
                value={draft.durum ?? ""}
                onChange={(v) => patch({ durum: v || null })}
              />
            </Section>
          </>
        ) : (
          <>
            <Section id="filtre-calisma" title="Çalışma şekli">
              <ChoiceChips
                size="sm"
                ariaLabelledBy="filtre-calisma"
                options={[{ value: "", label: "Tümü" }, ...WORK_TYPES]}
                value={draft.calisma ?? ""}
                onChange={(v) => patch({ calisma: v || null })}
              />
            </Section>
            <Section id="filtre-konum" title="Konum / OSB">
              <ChoiceChips
                size="sm"
                ariaLabelledBy="filtre-konum"
                options={[{ value: "", label: "Tümü" }, ...JOB_LOCATIONS.map((l) => ({ value: l.key, label: l.label }))]}
                value={draft.konum ?? ""}
                onChange={(v) => patch({ konum: v || null })}
              />
            </Section>
            <Section id="filtre-deneyim" title="Deneyim">
              <ChoiceChips
                size="sm"
                ariaLabelledBy="filtre-deneyim"
                options={[{ value: "", label: "Tümü" }, ...EXPERIENCE_LEVELS]}
                value={draft.deneyim ?? ""}
                onChange={(v) => patch({ deneyim: v || null })}
              />
            </Section>
            <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border px-4 py-3">
              <span>
                <span className="block text-[15px] font-bold">Servis var</span>
                <span className="block text-xs text-muted-foreground">Sadece personel servisi olan ilanları göster.</span>
              </span>
              <Switch checked={draft.servis} onCheckedChange={(c) => patch({ servis: c })} aria-label="Servis var" />
            </label>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

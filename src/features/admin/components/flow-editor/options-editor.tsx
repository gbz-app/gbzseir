"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowOption } from "@/core/flow";
import { slugifyTr } from "@/core/tr";

/** "5+1 ve üzeri" -> "5_1_ve_uzeri" (option values must be ASCII without spaces). */
export function valueFromLabel(label: string): string {
  return slugifyTr(label, 40).replace(/-/g, "_").replace(/^_+|_+$/g, "");
}

export function OptionsEditor({ options, onChange }: { options: FlowOption[]; onChange: (options: FlowOption[]) => void }) {
  const set = (i: number, patch: Partial<FlowOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= options.length) return;
    const next = [...options];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 px-1 text-xs font-semibold text-muted-foreground sm:grid" aria-hidden>
        <span>Değer (kayıt)</span>
        <span>Etiket (kullanıcı görür)</span>
        <span className="w-[8.5rem]" />
      </div>
      <ol className="grid gap-2">
        {options.map((o, i) => (
          <li key={i} className="grid gap-2 rounded-xl border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:border-0 sm:p-0">
            <Input
              value={o.value}
              maxLength={40}
              spellCheck={false}
              autoCapitalize="off"
              placeholder="deger"
              aria-label={`${i + 1}. seçeneğin değeri`}
              className="font-mono"
              onChange={(e) => set(i, { value: e.target.value.replace(/\s+/g, "_") })}
            />
            <Input
              value={o.label}
              maxLength={80}
              placeholder="Etiket"
              aria-label={`${i + 1}. seçeneğin etiketi`}
              onChange={(e) => set(i, { label: e.target.value })}
              onBlur={() => {
                if (!o.value.trim() && o.label.trim()) set(i, { value: valueFromLabel(o.label) });
              }}
            />
            <div className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" aria-label={`${i + 1}. seçeneği yukarı taşı`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`${i + 1}. seçeneği aşağı taşı`} disabled={i === options.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`${i + 1}. seçeneği sil`} onClick={() => onChange(options.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="outline" className="justify-self-start" disabled={options.length >= 30} onClick={() => onChange([...options, { value: "", label: "" }])}>
        <Plus aria-hidden /> Seçenek ekle
      </Button>
      <p className="text-xs text-muted-foreground">Değeri boş bırakırsan etiketten otomatik üretilir. Yayından sonra değeri değiştirmek raporlamayı etkiler; etiketi değiştirmek güvenlidir.</p>
    </div>
  );
}

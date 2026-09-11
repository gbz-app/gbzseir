"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FlowStep, FlowStepType } from "@/core/flow";
import { FLOW_STEP_TYPES, isChoiceType, type FlowIssue } from "../../lib/flow-draft";
import { OptionsEditor } from "./options-editor";

function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const MIN_MAX_LABELS: Partial<Record<FlowStepType, [string, string, string]>> = {
  multi: ["En az seçim", "En çok seçim", "Kaç seçenek işaretlenebileceği."],
  number: ["En küçük değer", "En büyük değer", "Girilebilecek sayı aralığı."],
  text: ["En az karakter", "En çok karakter", "120'den uzun sınırda çok satırlı alan açılır."],
  date: ["En erken (gün)", "En geç (gün)", "Bugünden itibaren gün: 0 = bugün, 180 = altı ay sonra."],
};

const numOrUndef = (v: string): number | undefined => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

export function StepForm({
  index,
  step,
  steps,
  issues,
  onChange,
}: {
  index: number;
  step: FlowStep;
  steps: FlowStep[];
  issues: FlowIssue[];
  onChange: (patch: Partial<FlowStep>) => void;
}) {
  const uid = React.useId();
  const f = (name: string) => `${uid}-${name}`;
  const minMax = MIN_MAX_LABELS[step.type];
  const parents = steps.slice(0, index).filter((s) => isChoiceType(s.type) && s.id);
  const parent = step.showIf ? steps.find((s) => s.id === step.showIf!.step) : undefined;
  const fieldIssue = (field: string) => issues.filter((i) => i.field === field).map((i) => i.message);

  const changeType = (type: FlowStepType) => {
    const patch: Partial<FlowStep> = { type };
    if (isChoiceType(type) && (!step.options || step.options.length === 0)) {
      patch.options = [
        { value: "secenek_1", label: "Seçenek 1" },
        { value: "secenek_2", label: "Seçenek 2" },
      ];
    }
    if (type !== step.type) {
      patch.min = type === "date" ? 0 : undefined;
      patch.max = undefined;
    }
    onChange(patch);
  };

  const errorText = (msgs: string[]) =>
    msgs.length ? (
      <p className="text-xs font-medium text-destructive" role="alert">
        {msgs.join(" ")}
      </p>
    ) : null;

  return (
    <section className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]" aria-label={`${index + 1}. adımı düzenle`}>
      <header className="border-b px-4 py-3">
        <h2 className="font-heading text-base font-bold">{index + 1}. adım</h2>
        {issues.length ? (
          <ul className="mt-2 space-y-1 text-sm text-destructive">
            {issues.map((i, k) => (
              <li key={k} className="flex items-start gap-1.5">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {i.message}
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      <div className="grid gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kimlik (yanıt anahtarı)" htmlFor={f("id")} hint="Küçük harf, rakam ve _ (ör. oda_sayisi).">
            <Input
              id={f("id")}
              value={step.id}
              maxLength={40}
              spellCheck={false}
              autoCapitalize="off"
              className="font-mono"
              aria-invalid={fieldIssue("id").length > 0 || undefined}
              onChange={(e) => onChange({ id: e.target.value.replace(/\s+/g, "_") })}
            />
            {errorText(fieldIssue("id"))}
          </Field>
          <Field label="Soru tipi" htmlFor={f("type")}>
            <Select value={step.type} onValueChange={(v) => changeType(v as FlowStepType)}>
              <SelectTrigger id={f("type")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLOW_STEP_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Soru başlığı" htmlFor={f("title")}>
          <Input
            id={f("title")}
            value={step.title}
            maxLength={140}
            placeholder="Ör. Ev kaç odalı?"
            aria-invalid={fieldIssue("title").length > 0 || undefined}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          {errorText(fieldIssue("title"))}
        </Field>

        <Field label="Yardım metni (isteğe bağlı)" htmlFor={f("help")}>
          <Textarea id={f("help")} value={step.help ?? ""} maxLength={300} rows={2} onChange={(e) => onChange({ help: e.target.value })} />
        </Field>

        <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3">
          <Label htmlFor={f("required")} className="flex-1 cursor-pointer">
            Zorunlu soru
          </Label>
          <Switch id={f("required")} checked={!!step.required} onCheckedChange={(v) => onChange({ required: v })} />
        </div>

        {isChoiceType(step.type) ? (
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Seçenekler</p>
            <OptionsEditor options={step.options ?? []} onChange={(options) => onChange({ options })} />
            {errorText(fieldIssue("options"))}
          </div>
        ) : null}

        {minMax ? (
          <div className="grid gap-1.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label={minMax[0]} htmlFor={f("min")}>
                <Input
                  id={f("min")}
                  type="number"
                  inputMode="numeric"
                  value={step.min ?? ""}
                  aria-invalid={fieldIssue("min").length > 0 || undefined}
                  onChange={(e) => onChange({ min: numOrUndef(e.target.value) })}
                />
              </Field>
              <Field label={minMax[1]} htmlFor={f("max")}>
                <Input
                  id={f("max")}
                  type="number"
                  inputMode="numeric"
                  value={step.max ?? ""}
                  aria-invalid={fieldIssue("max").length > 0 || undefined}
                  onChange={(e) => onChange({ max: numOrUndef(e.target.value) })}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{minMax[2]} Boş bırakılabilir.</p>
            {errorText([...fieldIssue("min"), ...fieldIssue("max")])}
          </div>
        ) : null}

        {step.type === "number" || step.type === "text" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {step.type === "number" ? (
              <Field label="Birim (isteğe bağlı)" htmlFor={f("unit")} hint="Ör. m², kişi, adet">
                <Input id={f("unit")} value={step.unit ?? ""} maxLength={12} onChange={(e) => onChange({ unit: e.target.value })} />
              </Field>
            ) : null}
            <Field label="Kutu içi ipucu (isteğe bağlı)" htmlFor={f("placeholder")}>
              <Input id={f("placeholder")} value={step.placeholder ?? ""} maxLength={80} onChange={(e) => onChange({ placeholder: e.target.value })} />
            </Field>
            {step.type === "text" ? (
              <div className="flex min-h-11 items-center justify-between gap-3 self-end rounded-xl border px-3">
                <Label htmlFor={f("multiline")} className="flex-1 cursor-pointer">
                  Çok satırlı alan
                </Label>
                <Switch id={f("multiline")} checked={!!step.multiline} onCheckedChange={(v) => onChange({ multiline: v || undefined })} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 rounded-xl border p-3">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <Label htmlFor={f("showif")} className="flex-1 cursor-pointer">
              Koşullu göster
              <span className="block text-xs font-normal text-muted-foreground">Yalnızca önceki bir seçimli soruya verilen cevaba göre gösterilir.</span>
            </Label>
            <Switch
              id={f("showif")}
              checked={!!step.showIf}
              disabled={!step.showIf && parents.length === 0}
              onCheckedChange={(v) => onChange({ showIf: v ? { step: parents[parents.length - 1]?.id ?? "", in: [] } : undefined })}
            />
          </div>
          {!step.showIf && parents.length === 0 ? <p className="text-xs text-muted-foreground">Bu adımdan önce seçimli bir soru yok.</p> : null}
          {step.showIf ? (
            <>
              <Field label="Bağlı olduğu soru" htmlFor={f("showif-step")}>
                <Select value={step.showIf.step || undefined} onValueChange={(v) => onChange({ showIf: { step: v, in: [] } })}>
                  <SelectTrigger id={f("showif-step")} className="w-full">
                    <SelectValue placeholder="Soru seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {parents.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title || p.id} ({p.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {parent?.options?.length ? (
                <fieldset className="grid gap-1">
                  <legend className="mb-1 text-sm font-medium">Şu cevaplardan biri seçilirse göster</legend>
                  {parent.options.map((o) => {
                    const checked = step.showIf!.in.includes(o.value);
                    const cid = f(`in-${o.value}`);
                    return (
                      <div key={o.value} className="flex min-h-10 items-center gap-2.5">
                        <Checkbox
                          id={cid}
                          checked={checked}
                          onCheckedChange={(v) => {
                            const set = new Set(step.showIf!.in);
                            if (v === true) set.add(o.value);
                            else set.delete(o.value);
                            onChange({ showIf: { step: step.showIf!.step, in: parent.options!.map((x) => x.value).filter((x) => set.has(x)) } });
                          }}
                        />
                        <Label htmlFor={cid} className="cursor-pointer font-normal">
                          {o.label || o.value} <span className="font-mono text-xs text-muted-foreground">({o.value})</span>
                        </Label>
                      </div>
                    );
                  })}
                </fieldset>
              ) : null}
              {errorText(fieldIssue("showIf"))}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

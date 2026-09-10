/**
 * Question-flow editor helpers (pure TS): strict validation before publishing and canonical cleaning.
 * The runtime contract lives in src/core/flow.ts; this module only adds editor-time rules.
 */
import type { FlowOption, FlowSchema, FlowShowIf, FlowStep, FlowStepType } from "@/core/flow";

export const FLOW_STEP_TYPES: Array<{ value: FlowStepType; label: string; minMax: string }> = [
  { value: "single", label: "Tek seçim", minMax: "" },
  { value: "multi", label: "Çoklu seçim", minMax: "Seçim sayısı" },
  { value: "number", label: "Sayı", minMax: "Değer sınırı" },
  { value: "text", label: "Metin", minMax: "Karakter sayısı" },
  { value: "date", label: "Tarih", minMax: "Bugünden itibaren gün" },
];

export const isChoiceType = (t: FlowStepType) => t === "single" || t === "multi";

export type FlowIssue = { stepIndex: number | null; field?: string; message: string };

const ID_RE = /^[a-z][a-z0-9_]{0,39}$/;
const VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9_+\-.]{0,39}$/;
const LIMITS = { title: 140, help: 300, label: 80, unit: 12, placeholder: 80, textMax: 4000, dateRange: 3650 } as const;

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Editor-time validation. Returns an empty list when the flow can be published. */
export function validateFlowDraft(steps: FlowStep[]): FlowIssue[] {
  const issues: FlowIssue[] = [];
  if (!Array.isArray(steps) || steps.length === 0) {
    return [{ stepIndex: null, message: "En az bir adım ekle." }];
  }
  if (steps.length > 40) issues.push({ stepIndex: null, message: "Bir akışta en fazla 40 adım olabilir." });

  const seen = new Map<string, number>();
  steps.forEach((s, i) => {
    const add = (message: string, field?: string) => issues.push({ stepIndex: i, field, message });
    const id = typeof s.id === "string" ? s.id : "";
    if (!id) add("Adım kimliği boş olamaz.", "id");
    else if (!ID_RE.test(id)) add("Kimlik küçük harfle başlamalı; yalnızca a-z, 0-9 ve _ içerebilir (en fazla 40).", "id");
    else if (seen.has(id)) add(`'${id}' kimliği ${seen.get(id)! + 1}. adımda da kullanılıyor.`, "id");
    if (id && !seen.has(id)) seen.set(id, i);

    if (!FLOW_STEP_TYPES.some((t) => t.value === s.type)) add("Soru tipi geçersiz.", "type");
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!title) add("Soru başlığı gerekli.", "title");
    else if (title.length > LIMITS.title) add(`Başlık en fazla ${LIMITS.title} karakter olabilir.`, "title");
    if (s.help && s.help.length > LIMITS.help) add(`Yardım metni en fazla ${LIMITS.help} karakter olabilir.`, "help");
    if (s.placeholder && s.placeholder.length > LIMITS.placeholder) add(`Örnek metin en fazla ${LIMITS.placeholder} karakter olabilir.`, "placeholder");

    const hasMin = s.min !== undefined && s.min !== null;
    const hasMax = s.max !== undefined && s.max !== null;
    if (hasMin && !isNum(s.min)) add("En az değeri sayı olmalı.", "min");
    if (hasMax && !isNum(s.max)) add("En çok değeri sayı olmalı.", "max");
    if (hasMin && hasMax && isNum(s.min) && isNum(s.max) && s.min > s.max) add("En az değeri en çok değerinden büyük olamaz.", "min");

    if (isChoiceType(s.type)) {
      const options = Array.isArray(s.options) ? s.options : [];
      if (options.length < 2) add("En az 2 seçenek ekle.", "options");
      if (options.length > 30) add("En fazla 30 seçenek olabilir.", "options");
      const values = new Set<string>();
      options.forEach((o, j) => {
        const v = typeof o?.value === "string" ? o.value.trim() : "";
        const l = typeof o?.label === "string" ? o.label.trim() : "";
        if (!l) add(`${j + 1}. seçeneğin etiketi boş.`, "options");
        else if (l.length > LIMITS.label) add(`${j + 1}. seçeneğin etiketi en fazla ${LIMITS.label} karakter olabilir.`, "options");
        if (!v) add(`${j + 1}. seçeneğin değeri boş.`, "options");
        else if (!VALUE_RE.test(v)) add(`${j + 1}. seçeneğin değeri yalnızca harf, rakam ve _ + - . içerebilir (boşluksuz).`, "options");
        else if (values.has(v)) add(`'${v}' değeri birden fazla seçenekte kullanılıyor.`, "options");
        values.add(v);
      });
      if (s.type === "multi") {
        if (hasMin && (!isInt(s.min) || s.min < 0)) add("En az seçim sayısı 0 veya daha büyük bir tam sayı olmalı.", "min");
        if (hasMax && (!isInt(s.max) || s.max < 1)) add("En çok seçim sayısı 1 veya daha büyük bir tam sayı olmalı.", "max");
        if (hasMax && isInt(s.max) && s.max > options.length) add("En çok seçim sayısı seçenek sayısından büyük olamaz.", "max");
        if (hasMin && isInt(s.min) && s.min > options.length) add("En az seçim sayısı seçenek sayısından büyük olamaz.", "min");
      }
    }
    if (s.type === "text") {
      if (hasMin && (!isInt(s.min) || s.min < 0)) add("En az karakter 0 veya daha büyük bir tam sayı olmalı.", "min");
      if (hasMax && (!isInt(s.max) || s.max < 1 || s.max > LIMITS.textMax)) add(`En çok karakter 1-${LIMITS.textMax} arasında olmalı.`, "max");
    }
    if (s.type === "date") {
      if (hasMin && (!isInt(s.min) || Math.abs(s.min) > LIMITS.dateRange)) add("Tarih için en az gün, tam sayı olmalı (ör. 0 = bugünden önce seçilemez).", "min");
      if (hasMax && (!isInt(s.max) || Math.abs(s.max) > LIMITS.dateRange)) add("Tarih için en çok gün, tam sayı olmalı (ör. 180).", "max");
    }
    if (s.type === "number" && s.unit && s.unit.length > LIMITS.unit) add(`Birim en fazla ${LIMITS.unit} karakter olabilir.`, "unit");

    if (s.showIf) {
      const parentIndex = steps.findIndex((p) => p.id === s.showIf!.step);
      const parent = parentIndex >= 0 ? steps[parentIndex] : undefined;
      if (!s.showIf.step) add("Koşul için bir adım seç.", "showIf");
      else if (!parent) add(`Koşuldaki '${s.showIf.step}' adımı bulunamadı.`, "showIf");
      else if (parentIndex >= i) add("Koşul yalnızca kendinden önceki bir adıma bağlanabilir.", "showIf");
      else if (!isChoiceType(parent.type)) add("Koşul yalnızca seçimli (tek/çoklu) bir adıma bağlanabilir.", "showIf");
      else {
        const values = Array.isArray(s.showIf.in) ? s.showIf.in : [];
        if (values.length === 0) add("Koşul için en az bir seçenek işaretle.", "showIf");
        const parentValues = new Set((parent.options ?? []).map((o) => o.value));
        for (const v of values) if (!parentValues.has(v)) add(`Koşul değeri '${v}', '${parent.id}' adımının seçeneklerinde yok.`, "showIf");
      }
    }
  });
  return issues;
}

function cleanNumber(n: unknown): number | undefined {
  if (n === "" || n === null || n === undefined) return undefined;
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : undefined;
}

function cleanText(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t ? t : undefined;
}

/** One step in canonical form: trimmed strings, empty optionals removed, type-specific fields only. */
export function cleanFlowStep(s: FlowStep): FlowStep {
  const out: FlowStep = { id: (s.id ?? "").trim(), type: s.type, title: (s.title ?? "").trim() };
  const help = cleanText(s.help);
  if (help) out.help = help;
  out.required = !!s.required;
  if (isChoiceType(s.type)) {
    out.options = (s.options ?? []).map((o): FlowOption => {
      const opt: FlowOption = { value: (o.value ?? "").trim(), label: (o.label ?? "").trim() };
      const d = cleanText(o.description);
      if (d) opt.description = d;
      return opt;
    });
  }
  if (s.type !== "single") {
    const min = cleanNumber(s.min);
    const max = cleanNumber(s.max);
    if (min !== undefined) out.min = min;
    if (max !== undefined) out.max = max;
  }
  if (s.type === "number") {
    const unit = cleanText(s.unit);
    if (unit) out.unit = unit;
  }
  if (s.type === "number" || s.type === "text") {
    const placeholder = cleanText(s.placeholder);
    if (placeholder) out.placeholder = placeholder;
  }
  if (s.type === "text" && s.multiline) out.multiline = true;
  if (s.showIf && s.showIf.step) {
    const showIf: FlowShowIf = { step: s.showIf.step, in: Array.from(new Set((s.showIf.in ?? []).map(String))) };
    out.showIf = showIf;
  }
  return out;
}

export function cleanFlowSchema(steps: FlowStep[]): FlowSchema {
  return { steps: steps.map(cleanFlowStep) };
}

/** A fresh step with a unique id. */
export function newFlowStep(type: FlowStepType, existingIds: string[]): FlowStep {
  let n = existingIds.length + 1;
  let id = `soru_${n}`;
  while (existingIds.includes(id)) id = `soru_${++n}`;
  const base: FlowStep = { id, type, title: "", required: true };
  if (isChoiceType(type)) {
    base.options = [
      { value: "secenek_1", label: "Seçenek 1" },
      { value: "secenek_2", label: "Seçenek 2" },
    ];
  }
  if (type === "date") base.min = 0;
  return base;
}

/** Coerce unknown JSON (JSON view / DB) into editable steps. Throws with a Turkish message. */
export function stepsFromUnknown(input: unknown): FlowStep[] {
  const obj = typeof input === "string" ? JSON.parse(input) : input;
  if (!obj || typeof obj !== "object") throw new Error("JSON bir nesne olmalı: {\"steps\": [...]}");
  const steps = Array.isArray(obj) ? obj : (obj as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) throw new Error("JSON içinde 'steps' dizisi yok.");
  return steps.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`${i + 1}. adım bir nesne olmalı.`);
    const s = raw as Record<string, unknown>;
    const step: FlowStep = {
      id: typeof s.id === "string" ? s.id : "",
      type: (typeof s.type === "string" ? s.type : "single") as FlowStepType,
      title: typeof s.title === "string" ? s.title : "",
    };
    if (typeof s.help === "string") step.help = s.help;
    if (typeof s.required === "boolean") step.required = s.required;
    if (Array.isArray(s.options)) {
      step.options = s.options.map((o) => {
        const r = (o ?? {}) as Record<string, unknown>;
        const opt: FlowOption = { value: String(r.value ?? ""), label: String(r.label ?? "") };
        if (typeof r.description === "string") opt.description = r.description;
        return opt;
      });
    }
    for (const k of ["min", "max"] as const) {
      if (s[k] !== undefined && s[k] !== null) step[k] = Number(s[k]);
    }
    if (typeof s.unit === "string") step.unit = s.unit;
    if (typeof s.placeholder === "string") step.placeholder = s.placeholder;
    if (typeof s.multiline === "boolean") step.multiline = s.multiline;
    if (s.showIf && typeof s.showIf === "object") {
      const si = s.showIf as Record<string, unknown>;
      step.showIf = { step: String(si.step ?? ""), in: Array.isArray(si.in) ? si.in.map(String) : [] };
    }
    return step;
  });
}

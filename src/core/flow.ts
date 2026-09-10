/**
 * Question-flow contract (pure TS) shared by service requests, listing attributes and wizards.
 *
 * JSON contract:
 * {"steps":[{id,type:'single'|'multi'|'number'|'text'|'date',title,help,required,
 *            options:[{value,label}],min,max,placeholder,showIf:{step,in}}]}
 *
 * - single: one option value (string). Auto-advances in the UI.
 * - multi:  array of option values. min/max = number of selections.
 * - number: number. min/max = value bounds. Optional `unit` ("m²", "kişi").
 * - text:   string. min/max = length bounds. Optional `multiline`.
 * - date:   'YYYY-MM-DD'. min/max = day offsets from today (e.g. min: 0 = not in the past).
 * - showIf: the step is visible only when the answer of `step` (single value or any of multi values)
 *           is in `in`. A step depending on a hidden step is hidden too.
 */
import { addDaysToKey, istanbulDateKey } from "./time";

export type FlowOption = { value: string; label: string; description?: string };
export type FlowStepType = "single" | "multi" | "number" | "text" | "date";
export type FlowShowIf = { step: string; in: string[] };

export type FlowStep = {
  id: string;
  type: FlowStepType;
  title: string;
  help?: string;
  required?: boolean;
  options?: FlowOption[];
  min?: number;
  max?: number;
  placeholder?: string;
  showIf?: FlowShowIf;
  unit?: string;
  multiline?: boolean;
};

export type FlowSchema = { version?: number; steps: FlowStep[] };

export type FlowAnswerValue = string | string[] | number | null;
export type FlowAnswers = Record<string, FlowAnswerValue | undefined>;

const STEP_TYPES: FlowStepType[] = ["single", "multi", "number", "text", "date"];

function isEmpty(v: FlowAnswerValue | undefined): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Visibility of one step given answers (recursive through showIf chains). */
export function isStepVisible(schema: FlowSchema, step: FlowStep, answers: FlowAnswers, depth = 0): boolean {
  if (!step.showIf) return true;
  if (depth > 20) return false; // cycle guard
  const parent = schema.steps.find((s) => s.id === step.showIf!.step);
  if (!parent || !isStepVisible(schema, parent, answers, depth + 1)) return false;
  const v = answers[parent.id];
  if (isEmpty(v)) return false;
  const values = Array.isArray(v) ? v : [String(v)];
  return values.some((x) => step.showIf!.in.includes(String(x)));
}

/** Steps visible for the current answers (drives the progress bar). */
export function visibleSteps(schema: FlowSchema, answers: FlowAnswers): FlowStep[] {
  return schema.steps.filter((s) => isStepVisible(schema, s, answers));
}

/** Validate a single answer. Returns a Turkish error message or null. */
export function validateStep(step: FlowStep, value: FlowAnswerValue | undefined, now: Date = new Date()): string | null {
  if (isEmpty(value)) return step.required ? "Bu soruyu yanıtlaman gerekiyor." : null;
  const optionValues = (step.options ?? []).map((o) => o.value);
  switch (step.type) {
    case "single":
      if (typeof value !== "string" || (optionValues.length > 0 && !optionValues.includes(value))) return "Geçerli bir seçenek seç.";
      return null;
    case "multi": {
      if (!Array.isArray(value)) return "Geçerli seçenekler seç.";
      if (optionValues.length > 0 && value.some((v) => !optionValues.includes(v))) return "Geçerli seçenekler seç.";
      if (step.min !== undefined && value.length < step.min) return `En az ${step.min} seçenek seç.`;
      if (step.max !== undefined && value.length > step.max) return `En fazla ${step.max} seçenek seçebilirsin.`;
      return null;
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "Geçerli bir sayı gir.";
      if (step.min !== undefined && n < step.min) return `En az ${step.min} olmalı.`;
      if (step.max !== undefined && n > step.max) return `En fazla ${step.max} olabilir.`;
      return null;
    }
    case "text": {
      if (typeof value !== "string") return "Geçerli bir metin gir.";
      const len = value.trim().length;
      if (step.required && len === 0) return "Bu alanı doldurman gerekiyor.";
      if (step.min !== undefined && len < step.min) return `En az ${step.min} karakter yaz.`;
      if (step.max !== undefined && len > step.max) return `En fazla ${step.max} karakter yazabilirsin.`;
      return null;
    }
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Geçerli bir tarih seç.";
      const today = istanbulDateKey(now);
      if (step.min !== undefined && value < addDaysToKey(today, step.min)) return "Bu tarih seçilemez.";
      if (step.max !== undefined && value > addDaysToKey(today, step.max)) return "Bu tarih çok ileride.";
      return null;
    }
    default:
      return "Bilinmeyen soru tipi.";
  }
}

export type FlowValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
  /** Answers of visible steps only (hidden-step answers are dropped). Numbers coerced. */
  cleaned: FlowAnswers;
};

/** Validate all visible steps. Use on the client AND on the server before saving. */
export function validateAnswers(schema: FlowSchema, answers: FlowAnswers, now: Date = new Date()): FlowValidationResult {
  const errors: Record<string, string> = {};
  const cleaned: FlowAnswers = {};
  for (const step of visibleSteps(schema, answers)) {
    let v = answers[step.id];
    if (step.type === "number" && typeof v === "string" && v.trim() !== "") v = Number(v);
    if (step.type === "text" && typeof v === "string") v = v.trim();
    const err = validateStep(step, v, now);
    if (err) errors[step.id] = err;
    if (!isEmpty(v)) cleaned[step.id] = v;
  }
  return { valid: Object.keys(errors).length === 0, errors, cleaned };
}

/** Human-readable summary rows for review screens and lead cards. */
export function summarizeAnswers(schema: FlowSchema, answers: FlowAnswers): Array<{ stepId: string; title: string; answer: string }> {
  return visibleSteps(schema, answers)
    .filter((s) => !isEmpty(answers[s.id]))
    .map((s) => {
      const v = answers[s.id]!;
      const label = (val: string) => s.options?.find((o) => o.value === val)?.label ?? val;
      let answer: string;
      if (Array.isArray(v)) answer = v.map(label).join(", ");
      else if (s.type === "single") answer = label(String(v));
      else if (s.type === "number") answer = `${v}${s.unit ? ` ${s.unit}` : ""}`;
      else answer = String(v);
      return { stepId: s.id, title: s.title, answer };
    });
}

/** Light structural validation of flow JSON coming from the DB. Throws on invalid input. */
export function parseFlowSchema(input: unknown): FlowSchema {
  const obj = typeof input === "string" ? JSON.parse(input) : input;
  if (!obj || typeof obj !== "object" || !Array.isArray((obj as FlowSchema).steps)) throw new Error("Geçersiz akış: steps dizisi yok");
  const ids = new Set<string>();
  for (const s of (obj as FlowSchema).steps) {
    if (!s || typeof s.id !== "string" || !s.id) throw new Error("Geçersiz akış: adım id eksik");
    if (ids.has(s.id)) throw new Error(`Geçersiz akış: tekrarlanan adım id '${s.id}'`);
    ids.add(s.id);
    if (!STEP_TYPES.includes(s.type)) throw new Error(`Geçersiz akış: '${s.id}' adımının tipi hatalı`);
    if (typeof s.title !== "string" || !s.title) throw new Error(`Geçersiz akış: '${s.id}' başlıksız`);
    if ((s.type === "single" || s.type === "multi") && (!Array.isArray(s.options) || s.options.length === 0))
      throw new Error(`Geçersiz akış: '${s.id}' seçenek içermiyor`);
  }
  return obj as FlowSchema;
}

"use client";

import * as React from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  MapPin,
  MapPinned,
  MessageSquare,
  Navigation,
  PencilLine,
  Phone,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { NoteField, ReportAlert, ReportProgress, ReportSuccess } from "@/components/shared/report-sheet-ui";
import { createClient } from "@/lib/supabase/client";
import { digitsOnly, formatPhoneInputTR, toNationalDigits } from "@/core/phone";
import { formatPhoneTR } from "@/core/format";

/** submit_contact_message accepts 10-2000 characters (char_length). */
const MIN = 10;
const MAX = 500;
const NAME_MAX = 120;

type Problem = "telefon" | "adres" | "isim" | "konum" | "kapandi" | "saatler" | "diger";

type ProblemMeta = {
  /** Row label on step 1, step 2 title and the "Konu" line of the summary. */
  label: string;
  icon: LucideIcon;
  /** Step 2 control: tel input, one-line input, textarea or a confirm card with an optional note. */
  field: "phone" | "input" | "textarea" | "confirm";
  fieldLabel: string;
  lead: string;
  placeholder?: string;
  hint?: string;
  /** Minimum characters of the new value (the composed message stays above the RPC's 10 anyway). */
  min: number;
  max: number;
  /** The line the team reads, e.g. "Telefon numarası: 0262 123 45 67 (yeni)". */
  compose: (value: string) => string;
};

const PROBLEMS: Record<Problem, ProblemMeta> = {
  telefon: {
    label: "Telefon numarası",
    icon: Phone,
    field: "phone",
    fieldLabel: "Doğru numara",
    lead: "Doğru numarayı yaz; kontrol edip güncelleyelim.",
    placeholder: "0262 123 45 67",
    hint: "Cep ya da sabit hat olabilir.",
    min: 0,
    max: 20,
    compose: (v) => `Telefon numarası: ${v} (yeni)`,
  },
  adres: {
    label: "Adres",
    icon: Navigation,
    field: "textarea",
    fieldLabel: "Doğru adres",
    lead: "Doğru adresi yaz; kontrol edip güncelleyelim.",
    placeholder: "Örn. Hacıhalil Mah. İstanbul Cad. No: 12, Gebze",
    hint: "Mahalle, cadde ve numara yeterli.",
    min: MIN,
    max: MAX,
    compose: (v) => `Adres (yeni): ${v}`,
  },
  isim: {
    label: "İsim",
    icon: Type,
    field: "input",
    fieldLabel: "Doğru isim",
    lead: "Tabelada yazan adı yaz.",
    placeholder: "Örn. Şifa Eczanesi",
    min: 2,
    max: NAME_MAX,
    compose: (v) => `İsim (yeni): ${v}`,
  },
  konum: {
    label: "Haritadaki konum",
    icon: MapPinned,
    field: "textarea",
    fieldLabel: "Doğru yeri tarif et",
    lead: "Pin yanlış yerdeyse doğru yeri kısaca anlat.",
    placeholder: "Örn. Belediyenin karşısında, köşedeki binada. Haritadakinden 100 m ileride.",
    hint: "Yakındaki bilinen bir yeri yazman yeter.",
    min: MIN,
    max: MAX,
    compose: (v) => `Haritadaki konum yanlış. Doğru yer: ${v}`,
  },
  kapandi: {
    label: "Kapandı / artık yok",
    icon: Ban,
    field: "confirm",
    fieldLabel: "Not ekle (isteğe bağlı)",
    lead: "Burası kapandı ya da taşındı mı?",
    placeholder: "Örn. Geçen ay taşındı, yerine market açıldı.",
    hint: "Kişisel bilgi paylaşma.",
    min: 0,
    max: MAX,
    compose: (v) => (v ? `Kapandı / artık yok.\nNot: ${v}` : "Kapandı / artık yok."),
  },
  saatler: {
    label: "Çalışma saatleri",
    icon: Clock,
    field: "textarea",
    fieldLabel: "Doğru çalışma saatleri",
    lead: "Hangi gün, hangi saatler açık?",
    placeholder: "Örn. Hafta içi 08:30-19:00, cumartesi 09:00-14:00, pazar kapalı.",
    hint: "Bildiğin kadarını yaz.",
    min: 3,
    max: MAX,
    compose: (v) => `Çalışma saatleri (yeni): ${v}`,
  },
  diger: {
    label: "Diğer",
    icon: MessageSquare,
    field: "textarea",
    fieldLabel: "Ne hatalı? Kısaca anlat",
    lead: "Ne yanlışsa kısaca yaz.",
    placeholder: "Örn. Fotoğraf başka bir yere ait.",
    hint: "Kişisel bilgi paylaşma.",
    min: MIN,
    max: MAX,
    compose: (v) => `Diğer: ${v}`,
  },
};

const PROBLEM_ORDER: Problem[] = ["telefon", "adres", "isim", "konum", "kapandi", "saatler", "diger"];

const COPY = {
  correction: {
    trigger: "Bilgi hatalı mı? Bildir",
    title: "Ne hatalı?",
    description: "Ne yanlışsa seç; kontrol edip güncelleyelim.",
  },
  phone: {
    trigger: "Numarasını biliyor musun? Bildir",
    title: "Numarasını biliyor musun?",
    description: "Bu durağın telefonunu biliyorsan yaz; kontrol edip ekleyelim.",
  },
} as const;

type SendError = "rate_limited" | "invalid_message" | "banned" | "failed";

const ERROR_COPY: Record<SendError, string> = {
  rate_limited: "Çok fazla bildirim gönderildi. Biraz sonra tekrar dene.",
  invalid_message: `En az ${MIN} karakter yaz.`,
  banned: "Hesabın kısıtlı olduğu için bildirim gönderemezsin.",
  failed: "Gönderilemedi. Bağlantını kontrol edip tekrar dene.",
};

type Step = "choose" | "value" | "review" | "done";

const STEPS: Record<keyof typeof COPY, Step[]> = {
  correction: ["choose", "value", "review"],
  phone: ["value", "review"],
};

/** Place phone mask: keeps a typed leading 0 ("0262 123 45 67") and 444 numbers ("444 1 234"), else "5XX XXX XX XX". */
function maskPlacePhone(raw: string): string {
  let d = digitsOnly(raw);
  if (d.startsWith("0090")) d = d.slice(4);
  else if (d.startsWith("90") && d.length > 11) d = d.slice(2);
  if (d.startsWith("444")) return [d.slice(0, 3), d.slice(3, 4), d.slice(4, 7)].filter(Boolean).join(" ");
  const zero = d.startsWith("0");
  const body = formatPhoneInputTR(zero ? d.slice(1) : d);
  return zero ? `0${body}` : body;
}

/** Display form of a valid place phone ("0262 123 45 67", "444 1 234"), or null. Mobile and landline both pass. */
function placePhone(raw: string): string | null {
  const d = digitsOnly(raw).replace(/^0/, "");
  if (/^444\d{4}$/.test(d)) return `444 ${d.slice(3, 4)} ${d.slice(4)}`;
  return toNationalDigits(d, { allowLandline: true }) ? formatPhoneTR(d) : null;
}

/** Count characters like the RPC (char_length), not UTF-16 units. */
const charLength = (s: string) => Array.from(s.trim()).length;

/** The new value as the team will read it, or null while step 2 is not valid ("" is valid for the optional note). */
function newValue(problem: Problem, raw: string): string | null {
  const meta = PROBLEMS[problem];
  if (meta.field === "phone") return placePhone(raw);
  const length = charLength(raw);
  if (meta.field === "confirm") return length <= meta.max ? raw.trim() : null;
  return length >= meta.min && length <= meta.max ? raw.trim() : null;
}

export type InfoReportSheetProps = {
  /** What is reported, e.g. "Eczane: Fatih Eczanesi". */
  subject: string;
  /** Page path (for the admin). */
  path: string;
  /** "phone": a small inline "Numarasını biliyor musun? Bildir" link for a place without a phone. */
  mode?: keyof typeof COPY;
  className?: string;
};

/**
 * "Bilgi hatalı mı? Bildir": a correction note for a place (pois are not a `reports` target), sent to the support inbox
 * via submit_contact_message (topic 'bilgi_duzeltme'). Guests may send it without phone / e-mail; the RPC rate-limits.
 * Correction mode is a 3-step sheet: 1) what is wrong, 2) the right value, 3) check and send. Phone mode skips step 1.
 */
export function InfoReportSheet({ subject, path, mode = "correction", className }: InfoReportSheetProps) {
  const copy = COPY[mode];
  const steps = STEPS[mode];
  const firstStep = steps[0] ?? "value";
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>(firstStep);
  // Slide direction of the next step change: forward from the right, back from the left.
  const [dir, setDir] = React.useState<1 | -1>(1);
  const [picked, setPicked] = React.useState<Problem | null>(null);
  const [values, setValues] = React.useState<Partial<Record<Problem, string>>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<SendError | null>(null);
  const fieldId = React.useId();
  const formId = React.useId();
  const stepRef = React.useRef<HTMLDivElement>(null);

  const problem: Problem | null = mode === "phone" ? "telefon" : picked;
  const meta = problem ? PROBLEMS[problem] : null;
  const raw = problem ? (values[problem] ?? "") : "";
  const value = problem ? newValue(problem, raw) : null;
  const valid = value !== null;
  const index = Math.max(0, steps.indexOf(step));

  const openSheet = () => {
    // A sent note starts over; an unsent draft is kept (every opening starts at the first step).
    if (step === "done") {
      setPicked(null);
      setValues({});
    }
    setStep(firstStep);
    setDir(1);
    setError(null);
    setOpen(true);
  };

  /** Focus follows the flow: the field on step 2 (the keyboard opens for the new value), else the step itself. */
  const focusStep = (target: Step, p: Problem | null) =>
    window.requestAnimationFrame(() => {
      const field = target === "value" && p && PROBLEMS[p].field !== "confirm" ? document.getElementById(fieldId) : null;
      (field ?? stepRef.current)?.focus({ preventScroll: true });
    });

  const go = (target: Step, direction: 1 | -1, p: Problem | null = problem) => {
    setDir(direction);
    setStep(target);
    setError(null);
    focusStep(target, p);
  };

  const pick = (p: Problem) => {
    setPicked(p);
    go("value", 1, p);
  };

  const back = () => {
    if (busy) return;
    const previous = steps[index - 1];
    if (previous) go(previous, -1);
  };

  const setRaw = (next: string) => {
    if (!problem) return;
    setValues((prev) => ({ ...prev, [problem]: next }));
    if (error === "invalid_message") setError(null);
  };

  const submit = async () => {
    if (!meta || value === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await createClient().rpc("submit_contact_message", {
        p_topic: "bilgi_duzeltme",
        p_subject: subject,
        p_message: meta.compose(value),
        p_page_path: path,
      });
      if (rpcError || !data) {
        const hint = rpcError?.hint;
        setError(hint === "rate_limited" || hint === "invalid_message" || hint === "banned" ? hint : "failed");
        return;
      }
      go("done", 1);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === "choose"
      ? copy.title
      : step === "value"
        ? mode === "phone"
          ? copy.title
          : (meta?.label ?? copy.title)
        : step === "review"
          ? "Kontrol et"
          : "Bildirimin alındı";

  const lead =
    step === "choose"
      ? copy.description
      : step === "value"
        ? mode === "phone"
          ? copy.description
          : (meta?.lead ?? copy.description)
        : step === "review"
          ? "Göndermeden önce bir bak."
          : "Teşekkürler, inceleyip düzelteceğiz.";

  const canGoBack = index > 0 && (step === "value" || step === "review");
  const showFooter = step !== "choose";

  return (
    <>
      {mode === "phone" ? (
        <button
          type="button"
          onClick={openSheet}
          className={cn(
            "inline-flex min-h-10 items-center rounded-md font-semibold text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
            className,
          )}
        >
          {copy.trigger}
        </button>
      ) : (
        <Button type="button" variant="ghost" className={cn("text-muted-foreground", className)} onClick={openSheet}>
          <Flag />
          {copy.trigger}
        </Button>
      )}
      <Drawer open={open} onOpenChange={setOpen}>
        {/* "!": tailwind-merge does not know the custom rounded-t-card of DrawerContent, so both classes survive the merge. */}
        <DrawerContent className="mx-auto w-full max-w-2xl bg-background data-[vaul-drawer-direction=bottom]:max-h-[88dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[1.75rem]!">
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4 pt-2">
            {canGoBack ? (
              <SheetIconButton label="Geri" onClick={back} disabled={busy}>
                <ChevronLeft className="size-6" strokeWidth={2.25} />
              </SheetIconButton>
            ) : (
              <span aria-hidden />
            )}
            <div className="min-w-0 text-center">
              {step !== "done" ? (
                <p className="text-xs font-semibold text-muted-foreground tabular-nums" aria-hidden>
                  {index + 1}/{steps.length}
                </p>
              ) : null}
              <DrawerTitle className={cn("line-clamp-2 text-[17px] leading-tight font-bold text-balance", step === "done" && "sr-only")}>
                {title}
              </DrawerTitle>
            </div>
            <DrawerClose asChild>
              <SheetIconButton label="Kapat">
                <X className="size-5" strokeWidth={2.25} />
              </SheetIconButton>
            </DrawerClose>
          </div>

          {step !== "done" ? (
            <div className="px-5 pt-3">
              <ReportProgress index={index} count={steps.length} />
            </div>
          ) : null}

          <div
            className={cn(
              "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5",
              showFooter ? "pb-3" : "pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]",
            )}
          >
            <div
              key={step}
              ref={stepRef}
              role="group"
              aria-label={step === "done" ? "Bildirimin alındı" : `Adım ${index + 1} / ${steps.length}: ${title}`}
              tabIndex={-1}
              className={cn(
                "animate-in outline-none duration-200 fade-in-0 motion-reduce:animate-none",
                step === "done" ? "" : dir > 0 ? "slide-in-from-right-8" : "slide-in-from-left-8",
              )}
            >
              <DrawerDescription className={cn("mb-4 px-1 text-sm leading-relaxed text-muted-foreground", step === "done" && "sr-only")}>
                {lead}
              </DrawerDescription>

              {step === "choose" ? <ProblemRows value={picked} onSelect={pick} /> : null}

              {step === "value" && meta && problem ? (
                <form
                  id={formId}
                  noValidate
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (valid) go("review", 1);
                  }}
                >
                  <ValueField id={fieldId} problem={problem} meta={meta} raw={raw} onChange={setRaw} />
                </form>
              ) : null}

              {step === "review" && meta ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 rounded-[1.25rem] bg-card p-4">
                    <SummaryRow icon={MapPin} term="Bildirdiğin yer">
                      {subject}
                    </SummaryRow>
                    <SummaryRow icon={meta.icon} term="Konu">
                      {meta.label}
                    </SummaryRow>
                    {value ? (
                      <SummaryRow icon={PencilLine} term={meta.field === "confirm" ? "Not" : "Yeni bilgi"} numeric={meta.field === "phone"}>
                        {value}
                      </SummaryRow>
                    ) : null}
                  </div>
                  {error ? <ReportAlert>{ERROR_COPY[error]}</ReportAlert> : null}
                  <p className="px-1 text-xs leading-relaxed text-muted-foreground">Ekibimiz kontrol edip bilgiyi güncelleyecek.</p>
                </div>
              ) : null}

              {step === "done" ? <ReportSuccess title="Bildirimin alındı" message="Teşekkürler, inceleyip düzelteceğiz." /> : null}
            </div>
          </div>

          {showFooter ? (
            <div className="px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              {step === "value" ? (
                <Button type="submit" form={formId} size="lg" className={CTA} disabled={!valid}>
                  Devam
                </Button>
              ) : step === "review" ? (
                <Button type="button" size="lg" className={CTA} onClick={submit} disabled={!valid || busy} aria-busy={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  Gönder
                </Button>
              ) : (
                <Button type="button" size="lg" className={CTA} onClick={() => setOpen(false)}>
                  Kapat
                </Button>
              )}
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Black primary CTA of the sheet (40-44 px control family: rounded-2xl, not a pill). */
const CTA = "h-12 w-full rounded-2xl bg-foreground text-base font-semibold text-background shadow-none hover:bg-foreground/90";

/** White one-line field on the lavender sheet (no border; the focus ring stays for keyboard users). */
const FIELD = "h-12 rounded-2xl border-transparent bg-card px-4 text-base focus-visible:border-transparent aria-invalid:border-transparent";

/** 44 px header control (back / close), white on the lavender sheet. */
function SheetIconButton({ label, className, children, ...props }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-2xl bg-card text-foreground transition-colors outline-none hover:bg-muted active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Step 1: big white rows (icon tile + label + chevron); a tap goes straight to step 2. */
function ProblemRows({ value, onSelect }: { value: Problem | null; onSelect: (p: Problem) => void }) {
  return (
    <ul aria-label="Ne hatalı?" className="flex flex-col gap-2">
      {PROBLEM_ORDER.map((p) => {
        const { label, icon: Icon } = PROBLEMS[p];
        const active = p === value;
        return (
          <li key={p}>
            <button
              type="button"
              aria-current={active || undefined}
              onClick={() => onSelect(p)}
              className="flex min-h-14 w-full items-center gap-3 rounded-[1.25rem] bg-card px-3.5 py-2.5 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-brand-soft text-primary",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">{label}</span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Step 2 control for the chosen problem. */
function ValueField({
  id,
  problem,
  meta,
  raw,
  onChange,
}: {
  id: string;
  problem: Problem;
  meta: ProblemMeta;
  raw: string;
  onChange: (value: string) => void;
}) {
  const length = charLength(raw);
  const metaId = `${id}-meta`;

  if (meta.field === "phone") {
    const digits = digitsOnly(raw).replace(/^0/, "");
    const invalid = digits.length >= 10 && placePhone(raw) === null;
    return (
      <div>
        <Label htmlFor={id} className="mb-1.5 block px-1 text-sm font-semibold">
          {meta.fieldLabel}
        </Label>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          enterKeyHint="next"
          value={raw}
          onChange={(e) => onChange(maskPlacePhone(e.target.value))}
          placeholder={meta.placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={metaId}
          className={cn(FIELD, "font-semibold tracking-wide tabular-nums placeholder:font-normal")}
        />
        <p id={metaId} className={cn("mt-1.5 px-1 text-xs text-muted-foreground", invalid && "font-medium text-destructive")}>
          {invalid ? "Geçerli bir numara yaz." : meta.hint}
        </p>
      </div>
    );
  }

  if (meta.field === "input") {
    const tooShort = length > 0 && length < meta.min;
    return (
      <div>
        <Label htmlFor={id} className="mb-1.5 block px-1 text-sm font-semibold">
          {meta.fieldLabel}
        </Label>
        <Input
          id={id}
          value={raw}
          maxLength={meta.max}
          autoComplete="off"
          enterKeyHint="next"
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta.placeholder}
          aria-invalid={tooShort || undefined}
          aria-describedby={metaId}
          className={FIELD}
        />
        <div id={metaId} className="mt-1.5 flex justify-between gap-3 px-1 text-xs text-muted-foreground">
          <span className={cn(tooShort && "font-medium text-destructive")}>{tooShort ? `En az ${meta.min} karakter yaz.` : meta.hint}</span>
          <span className="shrink-0 tabular-nums">
            {raw.length}/{meta.max}
          </span>
        </div>
      </div>
    );
  }

  const tooShort = meta.min > 0 && length > 0 && length < meta.min;
  return (
    <>
      {meta.field === "confirm" ? (
        <div className="flex items-start gap-3 rounded-[1.25rem] bg-card p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <Ban className="size-5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 pt-0.5 text-[15px] leading-snug">
            <span className="font-semibold">Bu yerin kapandığını bildireceksin.</span>{" "}
            <span className="text-muted-foreground">Ekibimiz kontrol edip listeden kaldıracak.</span>
          </p>
        </div>
      ) : null}
      <NoteField
        key={problem}
        id={id}
        label={meta.fieldLabel}
        value={raw}
        onChange={onChange}
        max={meta.max}
        placeholder={meta.placeholder}
        hint={tooShort ? `En az ${meta.min} karakter yaz.` : meta.hint}
        invalid={tooShort}
      />
    </>
  );
}

/** One line of the step 3 summary card: icon tile, small term, bold detail. */
function SummaryRow({ icon: Icon, term, numeric, children }: { icon: LucideIcon; term: string; numeric?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs font-semibold text-muted-foreground">{term}</p>
        <p className={cn("text-[15px] leading-snug font-semibold [overflow-wrap:anywhere] whitespace-pre-line", numeric && "tabular-nums")}>{children}</p>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, Loader2, RotateCcw, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { BottomDock } from "@/components/shared/bottom-dock";
import { useIsClient } from "@/lib/use-is-client";
import { clearWizardDraft, readWizardDraft, writeWizardDraft } from "./draft";
import { StepShell } from "./step-shell";

export type WizardStepContext<T> = {
  data: T;
  /** Merge a patch or apply an updater. Updates are visible to next() immediately (ref-backed). */
  setData: (patch: Partial<T> | ((data: T) => T)) => void;
  /** Validate the current step and go forward (or complete on the last step). */
  next: () => Promise<void>;
  back: () => void;
  goTo: (stepId: string) => void;
  /** 0-based index among visible steps. */
  index: number;
  count: number;
  isLast: boolean;
  /** Validation / submit error of the current step. */
  error: string | null;
  submitting: boolean;
};

export type WizardStep<T> = {
  id: string;
  title: React.ReactNode;
  help?: React.ReactNode;
  /** Optional Lucide icon shown in a soft chip next to the step title. */
  icon?: LucideIcon;
  /** Hidden steps are skipped and not counted in the progress bar. */
  isVisible?: (data: T) => boolean;
  /** Return a Turkish error message to block "İleri", or null. May be async. */
  validate?: (data: T) => string | null | Promise<string | null>;
  render: (ctx: WizardStepContext<T>) => React.ReactNode;
  /** Hide the footer (e.g. single-choice questions that auto-advance). */
  hideFooter?: boolean | ((data: T) => boolean);
  /** Custom label for the primary button on this step. */
  nextLabel?: string;
};

export type WizardProps<T extends object> = {
  steps: WizardStep<T>[];
  initialData: T;
  /** Autosave to localStorage under 'gebzem.draft.<draftKey>' and restore on return. */
  draftKey?: string;
  /**
   * Called on the last step. Return a Turkish error string to stay on the step, or nothing on success
   * (then navigate away yourself, e.g. router.push(routes.services.requestDone(code))). The draft is cleared on success.
   */
  onComplete: (data: T) => Promise<string | void> | string | void;
  /** Primary button label on the last step (default "Gönder"). */
  completeLabel?: string;
  /** Header title (e.g. "İlan ver"). */
  title?: React.ReactNode;
  /** Where the X (first step) goes (default "/"); or pass onExit. */
  exitHref?: string;
  onExit?: () => void;
  onDataChange?: (data: T) => void;
  className?: string;
};

/**
 * Multi-step flow used by listing creation, service requests and the business application.
 * - progress bar from visible steps only; step synced to ?adim=N (browser back works)
 * - per-step validation; draft autosave; Enter submits the step.
 */
export function Wizard<T extends object>(props: WizardProps<T>) {
  return (
    <React.Suspense fallback={<WizardSkeleton />}>
      <WizardInner {...props} />
    </React.Suspense>
  );
}

export function WizardSkeleton() {
  return (
    <div className="px-4 pt-safe" aria-busy="true" aria-label="Yükleniyor">
      <div className="flex h-(--topbar-h) items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-1 w-full" />
      <Skeleton className="mt-8 h-8 w-3/4" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <div className="mt-8 flex flex-col gap-3">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** Renders a step's content; ctx callbacks are ref-backed and must only run in handlers. */
function StepContent<T>({ step, ctx }: { step: WizardStep<T>; ctx: WizardStepContext<T> }) {
  return <>{step.render(ctx)}</>;
}

function WizardInner<T extends object>({
  steps,
  initialData,
  draftKey,
  onComplete,
  completeLabel = "Gönder",
  title,
  exitHref = "/",
  onExit,
  onDataChange,
  className,
}: WizardProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isClient = useIsClient();

  // Draft is read in the initializer; nothing step-related renders before hydration (isClient) so there is no mismatch.
  const [data, setDataState] = React.useState<T>(() =>
    draftKey && typeof window !== "undefined" ? (readWizardDraft<T>(draftKey) ?? initialData) : initialData,
  );
  const [restored, setRestored] = React.useState<boolean>(() => !!(draftKey && typeof window !== "undefined" && readWizardDraft<T>(draftKey)));
  const [errorState, setErrorState] = React.useState<{ stepId: string; message: string } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [validating, setValidating] = React.useState(false);

  const dataRef = React.useRef(data);
  const pushes = React.useRef(0);
  const busy = React.useRef(false);

  const visible = React.useMemo(() => steps.filter((s) => !s.isVisible || s.isVisible(data)), [steps, data]);
  const rawStep = Number(searchParams.get("adim") ?? "1");
  const index = Math.min(Math.max(Number.isFinite(rawStep) ? Math.trunc(rawStep) - 1 : 0, 0), Math.max(visible.length - 1, 0));
  const step = visible[index];
  const isLast = index >= visible.length - 1;
  const error = errorState && step && errorState.stepId === step.id ? errorState.message : null;

  const indexRef = React.useRef(index);
  const stepIdRef = React.useRef(step?.id);
  React.useLayoutEffect(() => {
    indexRef.current = index;
    stepIdRef.current = step?.id;
  });

  const urlFor = React.useCallback(
    (i: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (i <= 0) sp.delete("adim");
      else sp.set("adim", String(i + 1));
      const qs = sp.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  // Autosave.
  React.useEffect(() => {
    if (draftKey && isClient) writeWizardDraft(draftKey, data);
  }, [draftKey, data, isClient]);

  // Deep link / reload guard: never show a step after an invalid earlier step.
  React.useEffect(() => {
    if (!isClient) return;
    for (let i = 0; i < index; i++) {
      const v = visible[i]?.validate?.(dataRef.current);
      if (typeof v === "string" && v) {
        router.replace(urlFor(i), { scroll: false });
        return;
      }
    }
  }, [isClient, index, visible, router, urlFor]);

  const setData = React.useCallback(
    (patch: Partial<T> | ((d: T) => T)) => {
      const nextData = typeof patch === "function" ? (patch as (d: T) => T)(dataRef.current) : ({ ...dataRef.current, ...patch } as T);
      dataRef.current = nextData;
      setDataState(nextData);
      setErrorState(null);
      onDataChange?.(nextData);
    },
    [onDataChange],
  );

  const exit = React.useCallback(() => {
    if (onExit) onExit();
    else router.push(exitHref);
  }, [onExit, router, exitHref]);

  const next = React.useCallback(async () => {
    if (busy.current) return;
    const d = dataRef.current;
    const vis = steps.filter((s) => !s.isVisible || s.isVisible(d));
    let i = vis.findIndex((s) => s.id === stepIdRef.current);
    if (i < 0) i = Math.min(indexRef.current, vis.length - 1);
    const current = vis[i];
    if (!current) return;
    busy.current = true;
    try {
      setValidating(true);
      const err = current.validate ? await current.validate(d) : null;
      setValidating(false);
      if (err) {
        setErrorState({ stepId: current.id, message: err });
        return;
      }
      setErrorState(null);
      if (i >= vis.length - 1) {
        setSubmitting(true);
        const res = await onComplete(d);
        setSubmitting(false);
        if (typeof res === "string" && res) {
          setErrorState({ stepId: current.id, message: res });
          return;
        }
        if (draftKey) clearWizardDraft(draftKey);
        return;
      }
      pushes.current += 1;
      router.push(urlFor(i + 1), { scroll: false });
      window.scrollTo({ top: 0 });
    } catch {
      setSubmitting(false);
      setValidating(false);
      setErrorState({ stepId: current.id, message: "Bir şeyler ters gitti. Lütfen tekrar dene." });
    } finally {
      busy.current = false;
    }
  }, [steps, onComplete, draftKey, router, urlFor]);

  const back = React.useCallback(() => {
    const i = indexRef.current;
    if (i <= 0) return exit();
    if (pushes.current > 0) {
      pushes.current -= 1;
      router.back();
    } else {
      router.replace(urlFor(i - 1), { scroll: false });
    }
  }, [exit, router, urlFor]);

  const goTo = React.useCallback(
    (id: string) => {
      const i = steps.filter((s) => !s.isVisible || s.isVisible(dataRef.current)).findIndex((s) => s.id === id);
      if (i >= 0) {
        pushes.current += 1;
        router.push(urlFor(i), { scroll: false });
      }
    },
    [steps, router, urlFor],
  );

  const restart = () => {
    dataRef.current = initialData;
    setDataState(initialData);
    setRestored(false);
    setErrorState(null);
    if (draftKey) clearWizardDraft(draftKey);
    pushes.current = 0;
    router.replace(urlFor(0), { scroll: false });
  };

  if (!isClient || !step) return <WizardSkeleton />;

  const ctx: WizardStepContext<T> = { data, setData, next, back, goTo, index, count: visible.length, isLast, error, submitting };
  const hideFooter = typeof step.hideFooter === "function" ? step.hideFooter(data) : !!step.hideFooter;
  const percent = Math.round(((index + 1) / visible.length) * 100);

  return (
    <div className={cn("flex min-h-dvh flex-col", className)}>
      <HideBottomNav />
      <header className="sticky top-0 z-40 bg-background pt-safe">
        <div className="flex h-(--topbar-h) items-center gap-1 px-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full bg-foreground/[0.06] hover:bg-foreground/10"
            onClick={back}
            aria-label={index === 0 ? "Kapat" : "Geri"}
          >
            {index === 0 ? <X className="size-5" strokeWidth={2.2} /> : <ArrowLeft className="size-5" strokeWidth={2.2} />}
          </Button>
          <div className="min-w-0 flex-1">
            {title ? <p className="truncate text-[15px] leading-tight font-bold">{title}</p> : null}
            <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
              Adım {index + 1} / {visible.length}
            </p>
          </div>
          {restored ? (
            <Button type="button" variant="ghost" size="sm" onClick={restart} className="text-muted-foreground">
              <RotateCcw /> Baştan başla
            </Button>
          ) : null}
        </div>
        <Progress value={percent} className="h-1 rounded-none" aria-label={`İlerleme yüzde ${percent}`} />
      </header>

      <form
        noValidate
        className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        <div className="flex-1 px-4 pt-6 pb-8">
          <StepShell key={step.id} title={step.title} help={step.help} icon={step.icon}>
            <StepContent step={step} ctx={ctx} />
          </StepShell>
          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {hideFooter ? null : (
          // Shared dock, kept in the form's flow and stuck to the bottom: solid bg-background, no blur or line.
          <BottomDock inFlow className="sticky bottom-0 z-30">
            <div className="flex gap-2">
              {index > 0 ? (
                <Button type="button" variant="secondary" size="lg" onClick={back}>
                  <ChevronLeft data-icon="inline-start" aria-hidden />
                  Geri
                </Button>
              ) : null}
              <Button
                type="submit"
                size="lg"
                className="flex-1 bg-foreground text-background shadow-none hover:bg-foreground/90"
                disabled={submitting || validating}
              >
                {submitting || validating ? <Loader2 className="animate-spin" /> : null}
                {isLast ? completeLabel : (step.nextLabel ?? "İleri")}
              </Button>
            </div>
          </BottomDock>
        )}
      </form>
    </div>
  );
}

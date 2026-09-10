"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Braces, CircleAlert, History, ListOrdered, Plus, RotateCcw, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FlowStep } from "@/core/flow";
import { formatDateTime } from "@/core/format";
import { readString, removeItem, writeString } from "@/lib/storage";
import { publishFlowAction } from "../../actions/categories";
import { FLOW_STEP_TYPES, cleanFlowSchema, newFlowStep, validateFlowDraft, type FlowIssue } from "../../lib/flow-draft";
import { ConfirmDialog } from "../confirm-dialog";
import { useAdminAction } from "../use-admin-action";
import { FlowPreview } from "./flow-preview";
import { JsonPanel } from "./json-panel";
import { StepForm } from "./step-form";
import { VersionHistory, type FlowVersionData } from "./version-history";

const DRAFT_PREFIX = "gebzem.admin.flowDraft.";
const DRAFT_EVENT = "gebzem:flow-draft";

type Draft = { baseVersion: number | null; steps: FlowStep[]; savedAt: string };

const sameSteps = (a: FlowStep[], b: FlowStep[]) => JSON.stringify(cleanFlowSchema(a)) === JSON.stringify(cleanFlowSchema(b));

function subscribeDraft(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(DRAFT_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(DRAFT_EVENT, cb);
  };
}

/** Unsaved editor draft in localStorage (read via useSyncExternalStore: no hydration mismatch). */
function useStoredDraft(key: string): Draft | null {
  const raw = React.useSyncExternalStore(
    subscribeDraft,
    () => readString(key),
    () => null,
  );
  return React.useMemo(() => {
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as Draft;
      return Array.isArray(d?.steps) ? d : null;
    } catch {
      return null;
    }
  }, [raw]);
}

function writeDraft(key: string, draft: Draft | null) {
  if (draft) writeString(key, JSON.stringify(draft));
  else removeItem(key);
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

export type FlowEditorProps = {
  categoryId: string;
  categoryName: string;
  versions: FlowVersionData[];
};

export function FlowEditor({ categoryId, categoryName, versions }: FlowEditorProps) {
  const draftKey = `${DRAFT_PREFIX}${categoryId}`;
  const live = versions.find((v) => v.published) ?? null;
  const [baseVersion, setBaseVersion] = React.useState<number | null>(live?.version ?? null);
  const [baseSteps, setBaseSteps] = React.useState<FlowStep[]>(live?.steps ?? versions[0]?.steps ?? []);
  const [steps, setStepsState] = React.useState<FlowStep[]>(live?.steps ?? versions[0]?.steps ?? []);
  const [selected, setSelected] = React.useState(0);
  const [mode, setMode] = React.useState<"form" | "json">("form");
  const [focus, setFocus] = React.useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 });
  const storedDraft = useStoredDraft(draftKey);
  const { pending, run } = useAdminAction();

  const issues = React.useMemo(() => validateFlowDraft(steps), [steps]);
  const issuesByStep = React.useMemo(() => {
    const m = new Map<number, FlowIssue[]>();
    for (const i of issues) if (i.stepIndex !== null) m.set(i.stepIndex, [...(m.get(i.stepIndex) ?? []), i]);
    return m;
  }, [issues]);
  const globalIssues = issues.filter((i) => i.stepIndex === null);
  const dirty = !sameSteps(steps, baseSteps);
  const showDraftBanner = !!storedDraft && !sameSteps(storedDraft.steps, steps);
  const current = steps[selected] ?? null;

  const setSteps = (next: FlowStep[]) => {
    setStepsState(next);
    writeDraft(draftKey, sameSteps(next, baseSteps) ? null : { baseVersion, steps: next, savedAt: new Date().toISOString() });
  };

  const select = (i: number) => {
    setSelected(i);
    setFocus((f) => ({ id: steps[i]?.id ?? null, nonce: f.nonce + 1 }));
  };

  const updateStep = (index: number, patch: Partial<FlowStep>) => {
    const prev = steps[index];
    let next = steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    // Keep showIf references in sync when an id or option values are renamed.
    if (patch.id !== undefined && patch.id !== prev.id) {
      next = next.map((s) => (s.showIf?.step === prev.id ? { ...s, showIf: { ...s.showIf, step: patch.id! } } : s));
    }
    if (patch.options && prev.options && patch.options.length === prev.options.length) {
      const renames = new Map<string, string>();
      prev.options.forEach((o, j) => {
        const nv = patch.options![j]?.value;
        if (o.value && nv !== undefined && nv !== o.value) renames.set(o.value, nv);
      });
      if (renames.size) {
        const id = patch.id ?? prev.id;
        next = next.map((s) =>
          s.showIf?.step === id ? { ...s, showIf: { ...s.showIf, in: s.showIf.in.map((v) => renames.get(v) ?? v) } } : s,
        );
      }
    }
    setSteps(next);
  };

  const addStep = () => {
    const step = newFlowStep("single", steps.map((s) => s.id));
    const at = steps.length === 0 ? 0 : selected + 1;
    const next = [...steps.slice(0, at), step, ...steps.slice(at)];
    setSteps(next);
    setSelected(at);
    setFocus((f) => ({ id: step.id, nonce: f.nonce + 1 }));
  };

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[index], next[to]] = [next[to], next[index]];
    setSteps(next);
    if (selected === index) setSelected(to);
    else if (selected === to) setSelected(index);
  };

  const removeStep = (index: number) => {
    const removed = steps[index];
    let cleared = 0;
    const next = steps
      .filter((_, i) => i !== index)
      .map((s) => {
        if (s.showIf?.step === removed.id) {
          cleared++;
          const rest = { ...s };
          delete rest.showIf;
          return rest;
        }
        return s;
      });
    setSteps(next);
    setSelected((sel) => Math.max(0, Math.min(sel > index ? sel - 1 : sel, next.length - 1)));
    if (cleared) toast.message(`${cleared} adımın koşulu kaldırıldı (silinen adıma bağlıydı).`);
  };

  const publish = async () => {
    const cleaned = cleanFlowSchema(steps).steps;
    const res = await run(() => publishFlowAction({ categoryId, steps: cleaned }), {
      onSuccess: (d) => {
        setBaseVersion(d.version);
        setBaseSteps(cleaned);
        setStepsState(cleaned);
        writeDraft(draftKey, null);
      },
    });
    return !!res?.ok;
  };

  const nextVersion = Math.max(0, ...versions.map((v) => v.version)) + 1;

  const publishCard = (
    <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-label="Yayınlama">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">Yayındaki sürüm</p>
          <p className="font-heading text-lg font-bold">{baseVersion ? `Sürüm ${baseVersion}` : "Henüz yok"}</p>
        </div>
        {dirty ? <Badge variant="warning">Kaydedilmemiş değişiklik</Badge> : <Badge variant="success">Güncel</Badge>}
      </div>
      {issues.length > 0 ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {issues.length} sorun düzeltilmeden yayınlanamaz.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <ConfirmDialog
          title={`Sürüm ${nextVersion} yayınlansın mı?`}
          description={
            <>
              {categoryName} için yeni sürüm yayınlanır{baseVersion ? `; sürüm ${baseVersion} yayından kalkar (silinmez)` : ""}. Yeni talepler bu sürümü kullanır, önceki talepler kendi sürümüyle görüntülenmeye devam eder.
            </>
          }
          confirmLabel="Yayınla"
          trigger={
            <Button disabled={pending || issues.length > 0 || !dirty || steps.length === 0}>
              <Rocket aria-hidden /> Yeni sürüm olarak yayınla
            </Button>
          }
          onConfirm={publish}
        />
        {dirty ? (
          <ConfirmDialog
            title="Değişiklikler atılsın mı?"
            description="Düzenleyici yayındaki sürüme döner ve kaydedilmemiş taslak silinir."
            confirmLabel="Değişiklikleri at"
            destructive
            trigger={
              <Button variant="outline" disabled={pending}>
                <RotateCcw aria-hidden /> Geri al
              </Button>
            }
            onConfirm={() => {
              setSteps(baseSteps);
              setSelected(0);
            }}
          />
        ) : null}
      </div>
      {!dirty && steps.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">Yayınlamak için önce bir değişiklik yap.</p> : null}
    </section>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_27rem]">
      <div className="min-w-0 space-y-4">
        {showDraftBanner && storedDraft ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-highlight-soft p-4 text-sm text-highlight-foreground" role="status">
            <History className="size-5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              {formatDateTime(storedDraft.savedAt)} tarihli kaydedilmemiş bir taslağın var{storedDraft.baseVersion ? ` (sürüm ${storedDraft.baseVersion} üzerine)` : ""}.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="highlight"
                onClick={() => {
                  setStepsState(storedDraft.steps);
                  setSelected(0);
                  setFocus((f) => ({ id: storedDraft.steps[0]?.id ?? null, nonce: f.nonce + 1 }));
                }}
              >
                Taslağı yükle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => writeDraft(draftKey, null)}>
                Sil
              </Button>
            </div>
          </div>
        ) : null}

        <div className="lg:hidden">{publishCard}</div>

        <section className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]" aria-label="Adımlar">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="font-heading text-base font-bold">Adımlar ({steps.length})</h2>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-xl bg-muted p-1" role="group" aria-label="Düzenleme görünümü">
                <button
                  type="button"
                  aria-pressed={mode === "form"}
                  onClick={() => setMode("form")}
                  className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold", mode === "form" ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  <ListOrdered className="size-4" aria-hidden /> Form
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "json"}
                  onClick={() => setMode("json")}
                  className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold", mode === "json" ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  <Braces className="size-4" aria-hidden /> JSON
                </button>
              </div>
              {mode === "form" ? (
                <Button variant="outline" onClick={addStep} disabled={steps.length >= 40}>
                  <Plus aria-hidden /> Adım ekle
                </Button>
              ) : null}
            </div>
          </header>

          {globalIssues.length ? (
            <ul className="border-b px-4 py-2 text-sm text-destructive">
              {globalIssues.map((i) => (
                <li key={i.message}>{i.message}</li>
              ))}
            </ul>
          ) : null}

          {mode === "json" ? (
            <JsonPanel
              steps={steps}
              onApply={(next) => {
                setSteps(next);
                setSelected(0);
                setMode("form");
                toast.success("JSON düzenleyiciye uygulandı.");
              }}
            />
          ) : steps.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="font-semibold">Bu kategoride henüz soru yok.</p>
              <p className="mt-1 text-sm text-muted-foreground">İlk soruyu ekleyerek başla. Mahalle, zaman, not ve fotoğraf adımları sistem tarafından eklenir.</p>
              <Button className="mt-4" onClick={addStep}>
                <Plus aria-hidden /> İlk soruyu ekle
              </Button>
            </div>
          ) : (
            <ol className="divide-y">
              {steps.map((s, i) => {
                const n = issuesByStep.get(i)?.length ?? 0;
                const typeLabel = FLOW_STEP_TYPES.find((t) => t.value === s.type)?.label ?? s.type;
                return (
                  <li key={i} className={cn("flex items-center gap-1 px-2 py-1.5", i === selected && "bg-brand-soft/60")}>
                    <button
                      type="button"
                      onClick={() => select(i)}
                      aria-current={i === selected ? "step" : undefined}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                          i === selected ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{s.title || "Başlıksız soru"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.id || "kimliksiz"} · {typeLabel}
                          {s.required ? " · zorunlu" : ""}
                          {s.showIf ? ` · koşullu (${s.showIf.step})` : ""}
                        </span>
                      </span>
                      {n > 0 ? (
                        <Badge variant="destructive" className="shrink-0">
                          {n} sorun
                        </Badge>
                      ) : null}
                    </button>
                    <Button size="icon" variant="ghost" aria-label={`${i + 1}. adımı yukarı taşı`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`${i + 1}. adımı aşağı taşı`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <ConfirmDialog
                      title="Adım silinsin mi?"
                      description={`"${s.title || s.id}" adımı taslaktan çıkarılır. Yayındaki sürüm değişmez.`}
                      confirmLabel="Sil"
                      destructive
                      trigger={
                        <Button size="icon" variant="ghost" aria-label={`${i + 1}. adımı sil`}>
                          <Trash2 aria-hidden />
                        </Button>
                      }
                      onConfirm={() => removeStep(i)}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {mode === "form" && current ? (
          <StepForm
            key={selected}
            index={selected}
            step={current}
            steps={steps}
            issues={issuesByStep.get(selected) ?? []}
            onChange={(patch) => updateStep(selected, patch)}
          />
        ) : null}
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="hidden lg:block">{publishCard}</div>
        <FlowPreview steps={steps} focusId={focus.id} focusNonce={focus.nonce} />
        <VersionHistory
          versions={versions}
          onLoad={(v) => {
            setSteps(v.steps);
            setSelected(0);
            setMode("form");
            setFocus((f) => ({ id: v.steps[0]?.id ?? null, nonce: f.nonce + 1 }));
            toast.success(`Sürüm ${v.version} düzenleyiciye yüklendi. Yayınlarsan yeni bir sürüm oluşur.`);
          }}
        />
      </aside>
    </div>
  );
}

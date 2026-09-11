"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuestionRenderer } from "@/components/wizard/question-renderer";
import { summarizeAnswers, validateStep, visibleSteps, type FlowAnswers, type FlowAnswerValue, type FlowStep } from "@/core/flow";

/**
 * Live preview of the flow with the real QuestionRenderer. Walks through visible steps (showIf applied);
 * selecting a step in the editor jumps here (focusNonce changes).
 */
export function FlowPreview({ steps, focusId, focusNonce }: { steps: FlowStep[]; focusId: string | null; focusNonce: number }) {
  const [answers, setAnswers] = React.useState<FlowAnswers>({});
  const answersRef = React.useRef<FlowAnswers>({});
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [finished, setFinished] = React.useState(false);
  const [seenNonce, setSeenNonce] = React.useState(focusNonce);

  // Derived-state jump when the editor selects another step (no effect needed).
  if (seenNonce !== focusNonce) {
    setSeenNonce(focusNonce);
    setCurrentId(focusId);
    setError(null);
    setFinished(false);
  }

  const schema = React.useMemo(() => ({ steps: steps.filter((s) => s.id) }), [steps]);
  const visible = visibleSteps(schema, answers);
  const current = (currentId ? schema.steps.find((s) => s.id === currentId) : undefined) ?? visible[0] ?? null;
  const pos = current ? visible.findIndex((s) => s.id === current.id) : -1;
  const hiddenNow = !!current && pos === -1;

  const setAnswer = (id: string, v: FlowAnswerValue) => {
    const next = { ...answersRef.current, [id]: v };
    answersRef.current = next;
    setAnswers(next);
    setError(null);
  };

  const next = () => {
    if (!current) return;
    const err = validateStep(current, answersRef.current[current.id]);
    if (err) {
      setError(err);
      return;
    }
    const vis = visibleSteps(schema, answersRef.current);
    const i = vis.findIndex((s) => s.id === current.id);
    if (i >= 0 && i < vis.length - 1) setCurrentId(vis[i + 1].id);
    else if (i === -1 && vis.length) setCurrentId(vis[0].id);
    else setFinished(true);
  };

  const back = () => {
    const vis = visibleSteps(schema, answersRef.current);
    const i = current ? vis.findIndex((s) => s.id === current.id) : -1;
    if (finished) setFinished(false);
    else if (i > 0) setCurrentId(vis[i - 1].id);
    setError(null);
  };

  const reset = () => {
    answersRef.current = {};
    setAnswers({});
    setCurrentId(null);
    setError(null);
    setFinished(false);
  };

  return (
    <section className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]" aria-label="Canlı önizleme">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="inline-flex items-center gap-2 font-heading text-base font-bold">
          <Eye className="size-4" aria-hidden /> Canlı önizleme
        </h2>
        <Button size="sm" variant="ghost" onClick={reset}>
          <RotateCcw aria-hidden /> Baştan
        </Button>
      </header>
      <div className="p-4">
        <div className="mx-auto max-w-sm rounded-media border-8 border-foreground/10 bg-background p-4">
          {schema.steps.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Önizleme için soru ekle.</p>
          ) : finished ? (
            <div className="py-2">
              <p className="font-heading text-lg font-bold">Özet</p>
              <dl className="mt-3 space-y-2 text-sm">
                {summarizeAnswers(schema, answers).map((r) => (
                  <div key={r.stepId}>
                    <dt className="text-muted-foreground">{r.title}</dt>
                    <dd className="font-semibold">{r.answer}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">Gerçek formda ardından konum (ilçe), zaman, not ve fotoğraf adımları gelir.</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={back}>
                  <ArrowLeft aria-hidden /> Geri
                </Button>
                <Button onClick={reset}>Yeniden dene</Button>
              </div>
            </div>
          ) : current ? (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>{hiddenNow ? "Koşullu adım" : `Adım ${pos + 1} / ${visible.length}`}</span>
                {current.required ? <span>Zorunlu</span> : <span>İsteğe bağlı</span>}
              </div>
              <Progress value={hiddenNow ? 0 : ((pos + 1) / Math.max(1, visible.length)) * 100} className="mt-2 h-1.5" aria-label="İlerleme" />
              {hiddenNow ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-highlight-soft p-2.5 text-xs text-highlight-foreground">
                  <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Bu soru şu anki cevaplara göre gizli ({current.showIf?.step} sorusuna bağlı). Yalnızca görünümü gösteriliyor.
                </p>
              ) : null}
              <h3 className="mt-4 text-xl leading-snug font-extrabold text-balance">{current.title || "Başlıksız soru"}</h3>
              {current.help ? <p className="mt-1.5 text-sm text-muted-foreground">{current.help}</p> : null}
              <div className="mt-4">
                <QuestionRenderer
                  key={current.id}
                  step={current}
                  value={answers[current.id]}
                  onChange={(v) => setAnswer(current.id, v)}
                  onAutoAdvance={hiddenNow ? undefined : next}
                  error={error}
                />
              </div>
              {error ? (
                <p className="mt-3 text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-5 flex gap-2">
                <Button variant="outline" onClick={back} disabled={pos <= 0}>
                  <ArrowLeft aria-hidden /> Geri
                </Button>
                <Button className="flex-1" onClick={next} disabled={hiddenNow}>
                  {pos === visible.length - 1 ? "Bitir" : "Devam"} <ArrowRight aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Görünür soru yok. Koşulları kontrol et.</p>
          )}
        </div>
      </div>
    </section>
  );
}

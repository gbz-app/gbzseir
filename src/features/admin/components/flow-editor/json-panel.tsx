"use client";

import * as React from "react";
import { Check, Copy, RefreshCw, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FlowStep } from "@/core/flow";
import { cleanFlowSchema, stepsFromUnknown, validateFlowDraft } from "../../lib/flow-draft";

const pretty = (steps: FlowStep[]) => JSON.stringify(cleanFlowSchema(steps), null, 2);

/** Raw JSON view with parse + validation feedback. Applying replaces the editor steps. */
export function JsonPanel({ steps, onApply }: { steps: FlowStep[]; onApply: (steps: FlowStep[]) => void }) {
  const [text, setText] = React.useState(() => pretty(steps));
  const [parseError, setParseError] = React.useState<string | null>(null);

  const parsed = React.useMemo(() => {
    try {
      const s = stepsFromUnknown(text);
      return { steps: s, error: null as string | null };
    } catch (e) {
      return { steps: null, error: e instanceof SyntaxError ? `JSON sözdizimi hatası: ${e.message}` : e instanceof Error ? e.message : "JSON okunamadı." };
    }
  }, [text]);
  const issues = parsed.steps ? validateFlowDraft(parsed.steps) : [];

  return (
    <div className="grid gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        Biçim: <code className="rounded bg-muted px-1 font-mono text-xs">{'{"steps":[{"id","type","title","help","required","options","min","max","placeholder","showIf"}]}'}</code>
      </p>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParseError(null);
        }}
        spellCheck={false}
        autoCapitalize="off"
        rows={22}
        aria-label="Soru akışı JSON"
        aria-invalid={!!parsed.error || undefined}
        className="min-h-80 font-mono text-xs leading-relaxed"
      />
      {parsed.error || parseError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {parseError ?? parsed.error}
        </p>
      ) : issues.length ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-destructive" role="alert">
          {issues.map((i, k) => (
            <li key={k}>{i.stepIndex === null ? i.message : `${i.stepIndex + 1}. adım: ${i.message}`}</li>
          ))}
        </ul>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <Check className="size-4" aria-hidden /> JSON geçerli.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!parsed.steps}
          onClick={() => {
            if (!parsed.steps) {
              setParseError(parsed.error);
              return;
            }
            onApply(parsed.steps);
          }}
        >
          <Check aria-hidden /> Düzenleyiciye uygula
        </Button>
        <Button variant="outline" disabled={!parsed.steps} onClick={() => parsed.steps && setText(pretty(parsed.steps))}>
          <WandSparkles aria-hidden /> Biçimlendir
        </Button>
        <Button variant="outline" onClick={() => setText(pretty(steps))}>
          <RefreshCw aria-hidden /> Düzenleyiciden al
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast.success("JSON kopyalandı.");
            } catch {
              toast.error("Kopyalanamadı.");
            }
          }}
        >
          <Copy aria-hidden /> Kopyala
        </Button>
      </div>
    </div>
  );
}

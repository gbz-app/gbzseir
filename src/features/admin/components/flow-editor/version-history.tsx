"use client";

import { History, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FlowStep } from "@/core/flow";
import { formatDateTime } from "@/core/format";

export type FlowVersionData = {
  id: string;
  version: number;
  published: boolean;
  created_at: string;
  /** Pre-formatted on the server (avoids hydration differences). */
  createdLabel: string;
  steps: FlowStep[];
  /** Raw schema could not be parsed into steps. */
  invalid?: boolean;
};

/** Every version of the flow (newest first). Published versions are read-only: loading one only fills the editor. */
export function VersionHistory({ versions, onLoad }: { versions: FlowVersionData[]; onLoad: (v: FlowVersionData) => void }) {
  return (
    <section className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]" aria-label="Sürüm geçmişi">
      <header className="border-b px-4 py-3">
        <h2 className="inline-flex items-center gap-2 font-heading text-base font-bold">
          <History className="size-4" aria-hidden /> Sürüm geçmişi
        </h2>
      </header>
      {versions.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Henüz yayınlanmış sürüm yok.</p>
      ) : (
        <ol className="divide-y">
          {versions.map((v) => (
            <li key={v.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Sürüm {v.version}{" "}
                    {v.published ? (
                      <Badge variant="success" className="ml-1">
                        Yayında
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-1">
                        Arşiv
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground" title={formatDateTime(v.created_at)}>
                    {v.createdLabel} · {v.invalid ? "okunamadı" : `${v.steps.length} soru`}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={v.invalid} onClick={() => onLoad(v)} className="min-h-11 sm:min-h-9">
                  <Upload aria-hidden /> Düzenleyiciye yükle
                </Button>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-primary select-none">JSON</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-2 font-mono text-[11px] leading-relaxed">
                  {JSON.stringify({ steps: v.steps }, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

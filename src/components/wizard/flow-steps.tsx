"use client";

import { isStepVisible, validateStep, type FlowAnswerValue, type FlowAnswers, type FlowSchema } from "@/core/flow";
import { QuestionRenderer } from "./question-renderer";
import type { WizardStep } from "./wizard";

export type BuildFlowStepsOptions<T> = {
  /** Read the answers object from the wizard data. */
  getAnswers: (data: T) => FlowAnswers;
  /** Return new wizard data with the given answers. */
  setAnswers: (data: T, answers: FlowAnswers) => T;
  /** Wizard step id prefix (default "q_") so flow ids never collide with system steps. */
  idPrefix?: string;
};

const hasValue = (v: FlowAnswerValue | undefined) => !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));

/**
 * Turn a question-flow JSON (core/flow contract) into Wizard steps. Combine with your own system steps:
 *   steps = [...buildFlowSteps(schema, { getAnswers: d => d.answers, setAnswers: (d, a) => ({ ...d, answers: a }) }), locationStep, ...]
 * Single-choice steps auto-advance and hide the footer until answered.
 */
export function buildFlowSteps<T extends object>(schema: FlowSchema, opts: BuildFlowStepsOptions<T>): WizardStep<T>[] {
  const prefix = opts.idPrefix ?? "q_";
  return schema.steps.map((fs) => ({
    id: `${prefix}${fs.id}`,
    title: fs.title,
    help: fs.help,
    isVisible: (d: T) => isStepVisible(schema, fs, opts.getAnswers(d)),
    validate: (d: T) => validateStep(fs, opts.getAnswers(d)[fs.id]),
    hideFooter: (d: T) => fs.type === "single" && !hasValue(opts.getAnswers(d)[fs.id]),
    render: (ctx) => (
      <QuestionRenderer
        step={fs}
        value={opts.getAnswers(ctx.data)[fs.id]}
        error={ctx.error}
        onChange={(v) => ctx.setData((d) => opts.setAnswers(d, { ...opts.getAnswers(d), [fs.id]: v }))}
        onAutoAdvance={() => void ctx.next()}
      />
    ),
  }));
}

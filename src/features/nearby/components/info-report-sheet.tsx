"use client";

import * as React from "react";
import { CircleEllipsis, Clock, DoorClosed, Flag, Loader2, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import {
  NoteField,
  REPORT_CTA,
  REPORT_SHEET_CLASS,
  ReasonChips,
  ReportAlert,
  ReportStep,
  ReportSuccess,
  ReportSummary,
  type ReportOption,
} from "@/components/shared/report-sheet-ui";
import { createClient } from "@/lib/supabase/client";

/** submit_contact_message accepts 10-2000 characters (char_length). */
const MIN = 10;
const MAX = 500;

type Problem = "telefon" | "adres" | "kapandi" | "saatler" | "diger";

const PROBLEMS: ReportOption<Problem>[] = [
  { value: "telefon", label: "Telefon yanlış", icon: Phone },
  { value: "adres", label: "Adres yanlış", icon: MapPin },
  { value: "kapandi", label: "Kapandı", icon: DoorClosed },
  { value: "saatler", label: "Saatler yanlış", icon: Clock },
  { value: "diger", label: "Diğer", icon: CircleEllipsis },
];

const COPY = {
  correction: {
    trigger: "Bilgi hatalı mı? Bildir",
    title: "Bilgi hatalı mı?",
    description: "Ne yanlışsa seç; kontrol edip güncelleyelim.",
    placeholder: "Örn. Numara değişmiş ya da harita konumu yanlış.",
    hint: "Kişisel bilgi paylaşma.",
  },
  phone: {
    trigger: "Numarasını biliyor musun? Bildir",
    title: "Numarasını biliyor musun?",
    description: "Bu durağın telefonunu biliyorsan yaz; kontrol edip ekleyelim.",
    placeholder: "Örn. 0262 123 45 67, durağın tabelasında yazıyor.",
    hint: "Numarayı ve nereden bildiğini yaz.",
  },
} as const;

type SendError = "rate_limited" | "invalid_message" | "banned" | "failed";

const ERROR_COPY: Record<SendError, string> = {
  rate_limited: "Çok fazla bildirim gönderildi. Biraz sonra tekrar dene.",
  invalid_message: `En az ${MIN} karakter yaz.`,
  banned: "Hesabın kısıtlı olduğu için bildirim gönderemezsin.",
  failed: "Gönderilemedi. Bağlantını kontrol edip tekrar dene.",
};

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
 * Correction mode: problem chip + optional note (required for "Diğer"). Phone mode: the number as free text.
 */
export function InfoReportSheet({ subject, path, mode = "correction", className }: InfoReportSheetProps) {
  const copy = COPY[mode];
  const withProblems = mode === "correction";
  const [open, setOpen] = React.useState(false);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<SendError | null>(null);
  const [done, setDone] = React.useState(false);
  const noteId = React.useId();
  const problemsId = React.useId();
  const doneRef = React.useRef<HTMLDivElement>(null);

  // Count characters like the RPC (char_length), not UTF-16 units.
  const length = Array.from(text.trim()).length;
  const noteRequired = !withProblems || problem === "diger";
  const tooShort = noteRequired && length > 0 && length < MIN;
  const valid = (!withProblems || !!problem) && (!noteRequired || length >= MIN);

  const openSheet = () => {
    // A sent note starts over; an unsent draft is kept.
    if (done) {
      setDone(false);
      setProblem(null);
      setText("");
    }
    setError(null);
    setOpen(true);
  };

  /** The chip is written into the message ("Sorun: Kapandı"), which also keeps it above the 10-character minimum. */
  const message = () => {
    const note = text.trim();
    if (!withProblems) return note;
    const label = PROBLEMS.find((p) => p.value === problem)?.label ?? "Diğer";
    return note ? `Sorun: ${label}\n${note}` : `Sorun: ${label}`;
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await createClient().rpc("submit_contact_message", {
        p_topic: "bilgi_duzeltme",
        p_subject: subject,
        p_message: message(),
        p_page_path: path,
      });
      if (rpcError || !data) {
        const hint = rpcError?.hint;
        setError(hint === "rate_limited" || hint === "invalid_message" || hint === "banned" ? hint : "failed");
        return;
      }
      setDone(true);
      window.requestAnimationFrame(() => doneRef.current?.focus({ preventScroll: true }));
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  };

  const noteLabel = !withProblems ? "Telefon numarası" : problem === "diger" ? "Kısaca anlat" : "Not ekle (isteğe bağlı)";
  const noteHint = tooShort ? `En az ${MIN} karakter yaz.` : withProblems && problem === "diger" ? "Ne yanlış, kısaca yaz." : copy.hint;

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
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={done ? "Bildirimin alındı" : copy.title}
        description={done ? undefined : copy.description}
        hideHeader={done}
        className={REPORT_SHEET_CLASS}
        footer={
          done ? (
            <Button type="button" size="lg" className={REPORT_CTA} onClick={() => setOpen(false)}>
              Kapat
            </Button>
          ) : (
            <Button type="button" size="lg" className={REPORT_CTA} onClick={submit} disabled={!valid || busy} aria-busy={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Gönder
            </Button>
          )
        }
      >
        {done ? (
          <ReportStep ref={doneRef} key="done" label="Bildirimin alındı">
            <ReportSuccess />
          </ReportStep>
        ) : (
          <div className="flex flex-col gap-4">
            <ReportSummary icon={withProblems ? MapPin : Phone} eyebrow="Bildirdiğin yer" title={subject} />
            {withProblems ? (
              <div>
                <p id={problemsId} className="mb-2 px-1 text-sm font-semibold">
                  Ne yanlış?
                </p>
                <ReasonChips
                  options={PROBLEMS}
                  value={problem}
                  onSelect={(v) => {
                    setProblem(v);
                    setError(null);
                  }}
                  labelledBy={problemsId}
                />
              </div>
            ) : null}
            <NoteField
              id={noteId}
              label={noteLabel}
              value={text}
              onChange={(v) => {
                setText(v);
                if (error === "invalid_message") setError(null);
              }}
              max={MAX}
              placeholder={copy.placeholder}
              hint={noteHint}
              invalid={tooShort}
            />
            {error ? <ReportAlert>{ERROR_COPY[error]}</ReportAlert> : null}
          </div>
        )}
      </BottomSheet>
    </>
  );
}

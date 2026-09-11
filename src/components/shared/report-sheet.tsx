"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleEllipsis, Flag, Loader2, MessageSquareWarning, ShieldAlert, Tags, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { ReportReasonValue, ReportTargetType } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { routes } from "@/core/routes";
import { BottomSheet } from "./bottom-sheet";
import {
  NoteField,
  REPORT_CTA,
  REPORT_SHEET_CLASS,
  ReasonRows,
  ReportAlert,
  ReportProgress,
  ReportStep,
  ReportSuccess,
  ReportSummary,
} from "./report-sheet-ui";

export type ReportReason = { value: ReportReasonValue; label: string };

/** Target types the sheet can send. 'event' needs the events migration (reports_target_type_check + submit_report). */
export type ReportSheetTargetType = ReportTargetType | "event";

/** Values must match the reports_reason_check constraint. */
export const DEFAULT_REPORT_REASONS: ReportReason[] = [
  { value: "dolandiricilik", label: "Dolandırıcılık şüphesi (kapora, ön ödeme…)" },
  { value: "yaniltici", label: "Yanlış ya da yanıltıcı bilgi" },
  { value: "yanlis_kategori", label: "Yanlış kategori / yasaklı ürün" },
  { value: "uygunsuz", label: "Uygunsuz veya saldırgan içerik" },
  { value: "diger", label: "Diğer" },
];

/** Reasons that fit a review (no "yanlış kategori"). */
export const REVIEW_REPORT_REASONS: ReportReason[] = [
  { value: "yaniltici", label: "Sahte ya da yanıltıcı yorum" },
  { value: "uygunsuz", label: "Hakaret, küfür veya uygunsuz ifade" },
  { value: "dolandiricilik", label: "Dolandırıcılık ya da reklam" },
  { value: "diger", label: "Diğer" },
];

/** Reasons that fit an event (same DB values). */
export const EVENT_REPORT_REASONS: ReportReason[] = [
  { value: "dolandiricilik", label: "Dolandırıcılık şüphesi (sahte bilet, ön ödeme…)" },
  { value: "yaniltici", label: "Yanlış ya da yanıltıcı bilgi (tarih, yer, fiyat)" },
  { value: "uygunsuz", label: "Uygunsuz veya saldırgan içerik" },
  { value: "diger", label: "Diğer" },
];

const REASON_ICONS: Record<ReportReasonValue, LucideIcon> = {
  dolandiricilik: ShieldAlert,
  yaniltici: CircleAlert,
  yanlis_kategori: Tags,
  uygunsuz: MessageSquareWarning,
  diger: CircleEllipsis,
};

const TARGET_LABEL: Record<ReportSheetTargetType, string> = {
  listing: "İlan",
  business: "İşletme",
  review: "Yorum",
  user: "Kullanıcı",
  event: "Etkinlik",
};

function defaultReasons(targetType: ReportSheetTargetType): ReportReason[] {
  if (targetType === "review") return REVIEW_REPORT_REASONS;
  if (targetType === "event") return EVENT_REPORT_REASONS;
  return DEFAULT_REPORT_REASONS;
}

export type ReportSheetProps = {
  /** 'listing' (2. el + iş ilanı) | 'business' | 'review' | 'user' | 'event'. */
  targetType: ReportSheetTargetType;
  targetId: string;
  /** Controlled state; omit to use the default "Şikayet et" trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger element (asChild). */
  trigger?: React.ReactNode;
  reasons?: ReportReason[];
  /** Name of the reported item for the summary on the note step (e.g. the firm name). */
  subject?: string;
  /**
   * Author / owner of the target when the caller knows it: the trigger is hidden for them (the RPC rejects own content).
   * Omit it to let the sheet look it up for reviews and businesses.
   */
  ownerId?: string | null;
  className?: string;
};

const NOTE_MAX = 500;

type Step = "reason" | "note" | "done";

type ReportError =
  | "login_required"
  | "rate_limited"
  | "already_reported"
  | "own_content"
  | "not_found"
  | "restricted"
  | "unavailable"
  | "failed";

const ERROR_COPY: Record<Exclude<ReportError, "login_required">, string> = {
  rate_limited: "Bugünlük şikayet sınırına ulaştın. Yarın tekrar deneyebilirsin.",
  already_reported: "Bunu zaten bildirmiştin. Ekibimiz inceliyor.",
  own_content: "Kendi içeriğini şikayet edemezsin.",
  not_found: "Bu içerik artık yayında değil.",
  restricted: "Hesabın kısıtlı olduğu için şikayet gönderemezsin.",
  unavailable: "Bu içerik için şu an şikayet alınamıyor.",
  failed: "Gönderilemedi. Bağlantını kontrol edip tekrar dene.",
};

/** Sending again cannot help after these: the CTA turns into "Kapat". */
const FINAL_ERRORS: ReportError[] = ["rate_limited", "already_reported", "own_content", "not_found", "restricted", "unavailable"];

/** submit_report error -> kind (hints from 2026091301_reports_hardening; 23505 = one open report per target). */
function toReportError(e: { code?: string; hint?: string | null }): ReportError {
  if (e.hint === "login_required") return "login_required";
  if (e.code === "23505" || e.hint === "already_reported") return "already_reported";
  if (e.hint === "rate_limited") return "rate_limited";
  if (e.hint === "own_content") return "own_content";
  if (e.hint === "not_found" || e.code === "P0002") return "not_found";
  if (e.hint === "restricted" || e.hint === "banned") return "restricted";
  // e.g. an 'event' report before the events migration adds that target type.
  if (e.hint === "invalid_target" || e.hint === "invalid_reason") return "unavailable";
  return "failed";
}

/** Current page incl. the tab hash ("#yorumlar"), to come back to after login. */
const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

// ---------------------------------------------------------------------------
// Own content lookup: one batched query per table for every sheet mounted together (e.g. 30 reviews on a firm page).
// ---------------------------------------------------------------------------

type OwnCheckType = "review" | "business";
type OwnRequest = { uid: string; type: OwnCheckType; id: string; resolve: (own: boolean) => void };

const OWN_CHUNK = 40;
const ownCache = new Map<string, Promise<boolean>>();
let ownQueue: OwnRequest[] = [];

const ownKey = (uid: string, type: OwnCheckType, id: string) => `${uid}:${type}:${id}`;

async function fetchOwned(uid: string, type: OwnCheckType, ids: string[]): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } =
    type === "review"
      ? await supabase.from("reviews").select("id").eq("author_id", uid).in("id", ids)
      : await supabase.from("businesses").select("id").eq("owner_id", uid).in("id", ids);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id));
}

function flushOwnQueue() {
  const batch = ownQueue;
  ownQueue = [];
  const groups = new Map<string, OwnRequest[]>();
  for (const r of batch) {
    const k = `${r.uid}|${r.type}`;
    const group = groups.get(k);
    if (group) group.push(r);
    else groups.set(k, [r]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const ids = [...new Set(group.map((r) => r.id))];
    for (let i = 0; i < ids.length; i += OWN_CHUNK) {
      const chunk = new Set(ids.slice(i, i + OWN_CHUNK));
      const requests = group.filter((r) => chunk.has(r.id));
      fetchOwned(first.uid, first.type, [...chunk]).then(
        (owned) => requests.forEach((r) => r.resolve(owned.has(r.id))),
        () =>
          requests.forEach((r) => {
            // Not cached on failure: the next mount asks again. Meanwhile the entry stays visible (the RPC still guards).
            ownCache.delete(ownKey(r.uid, r.type, r.id));
            r.resolve(false);
          }),
      );
    }
  }
}

function isOwned(uid: string, type: OwnCheckType, id: string): Promise<boolean> {
  const key = ownKey(uid, type, id);
  let p = ownCache.get(key);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      ownQueue.push({ uid, type, id, resolve });
      if (ownQueue.length === 1) window.setTimeout(flushOwnQueue, 0);
    });
    ownCache.set(key, p);
  }
  return p;
}

/**
 * Whether the signed-in viewer owns the target (their review, business or profile): true / false, or null while unknown
 * (auth loading or the lookup running). `ownerId` skips the lookup when the caller already knows the owner.
 */
export function useIsOwnContent(targetType: ReportSheetTargetType, targetId: string, ownerId?: string | null): boolean | null {
  const { user, loading } = useAuth();
  const uid = user?.id ?? null;
  const lookupType: OwnCheckType | null = uid && ownerId === undefined && (targetType === "review" || targetType === "business") ? targetType : null;
  const key = uid && lookupType ? ownKey(uid, lookupType, targetId) : null;
  const [resolved, setResolved] = React.useState<{ key: string; own: boolean } | null>(null);

  React.useEffect(() => {
    if (!uid || !lookupType || !key) return;
    let active = true;
    void isOwned(uid, lookupType, targetId).then((own) => {
      if (active) setResolved({ key, own });
    });
    return () => {
      active = false;
    };
  }, [uid, lookupType, targetId, key]);

  if (!uid) return loading ? null : false;
  if (ownerId !== undefined) return ownerId === uid;
  if (targetType === "user") return targetId === uid;
  if (!key) return false;
  return resolved?.key === key ? resolved.own : null;
}

// ---------------------------------------------------------------------------

/**
 * "Şikayet et" sheet: 1) reason rows, 2) optional note + summary, then the result inside the sheet -> rpc submit_report.
 * Requires login (redirects back). The default trigger is hidden on the viewer's own review / business / profile.
 */
export function ReportSheet({
  targetType,
  targetId,
  open: openProp,
  onOpenChange,
  trigger,
  reasons: reasonsProp,
  subject,
  ownerId,
  className,
}: ReportSheetProps) {
  const reasons = reasonsProp ?? defaultReasons(targetType);
  const { user, loading } = useAuth();
  const router = useRouter();
  const controlled = openProp !== undefined;
  // A controlled sheet has no trigger to hide (its menu decides), so it skips the ownership lookup.
  const own = useIsOwnContent(targetType, targetId, controlled ? null : ownerId);
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = openProp ?? innerOpen;
  const [step, setStep] = React.useState<Step>("reason");
  const [reason, setReason] = React.useState<ReportReasonValue | "">("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ReportError | null>(null);
  const stepRef = React.useRef<HTMLDivElement>(null);
  const advanceTimer = React.useRef<number | undefined>(undefined);
  const noteId = React.useId();

  React.useEffect(() => {
    const timer = advanceTimer;
    return () => window.clearTimeout(timer.current);
  }, []);

  // Every opening starts at the reasons. After a sent report it starts over; an unsent draft (reason + note) is kept.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      if (step === "done") {
        setReason("");
        setNote("");
      }
      setStep("reason");
      setError(null);
    }
  }

  if (own === true && !controlled) return null;

  const setOpen = (o: boolean) => {
    if (o && !user && !loading) {
      router.push(routes.auth.login(here()));
      return;
    }
    if (!controlled) setInnerOpen(o);
    onOpenChange?.(o);
  };

  const focusStep = () => window.requestAnimationFrame(() => stepRef.current?.focus({ preventScroll: true }));

  const pick = (value: ReportReasonValue) => {
    setReason(value);
    setError(null);
    window.clearTimeout(advanceTimer.current);
    // A short beat so the check is seen, then the note step.
    advanceTimer.current = window.setTimeout(() => {
      setStep("note");
      focusStep();
    }, 180);
  };

  const back = () => {
    setError(null);
    setStep("reason");
    focusStep();
  };

  const submit = async () => {
    if (!reason || busy) return;
    if (!user) {
      setError("login_required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createClient().rpc("submit_report", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_reason: reason,
        p_detail: note.trim() || undefined,
      });
      if (rpcError) {
        setError(toReportError(rpcError));
        return;
      }
      setStep("done");
      focusStep();
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  };

  const options = reasons.map((r) => ({ ...r, icon: REASON_ICONS[r.value] }));
  const selected = reasons.find((r) => r.value === reason);
  const finalError = error !== null && FINAL_ERRORS.includes(error);
  const close = () => setOpen(false);

  const header =
    step === "reason"
      ? { title: "Şikayet et", description: "Neden bildiriyorsun? Bildirimin gizli tutulur." }
      : step === "note"
        ? { title: "Biraz daha anlat", description: "Not eklemek isteğe bağlı. Hazırsan gönder." }
        : { title: "Bildirimin alındı", description: undefined };

  const footer =
    step === "note" ? (
      finalError ? (
        <Button type="button" size="lg" className={REPORT_CTA} onClick={close}>
          Kapat
        </Button>
      ) : (
        <Button type="button" size="lg" className={REPORT_CTA} onClick={submit} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Gönder
        </Button>
      )
    ) : step === "done" ? (
      <Button type="button" size="lg" className={REPORT_CTA} onClick={close}>
        Kapat
      </Button>
    ) : undefined;

  return (
    <>
      {!controlled ? (
        trigger ? (
          <span onClickCapture={() => setOpen(true)} className={cn("contents", own === null && "invisible")}>
            {trigger}
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // Hidden (space kept) until we know the viewer is not the author, so their own review never flashes it.
            className={cn("text-muted-foreground", own === null && "invisible", className)}
            onClick={() => setOpen(true)}
          >
            <Flag /> Şikayet et
          </Button>
        )
      ) : null}
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={header.title}
        description={header.description}
        hideHeader={step === "done"}
        className={REPORT_SHEET_CLASS}
        footer={footer}
      >
        {step === "done" ? (
          <ReportStep ref={stepRef} key="done" label="Bildirimin alındı">
            <ReportSuccess />
          </ReportStep>
        ) : (
          <>
            <ReportProgress index={step === "reason" ? 0 : 1} count={2} />
            {step === "reason" ? (
              <ReportStep ref={stepRef} key="reason" label="Adım 1 / 2: Şikayet nedeni">
                <ReasonRows options={options} value={reason} onSelect={pick} ariaLabel="Şikayet nedeni" />
              </ReportStep>
            ) : (
              <ReportStep ref={stepRef} key="note" label="Adım 2 / 2: Not ve gönder" className="flex flex-col gap-4">
                <ReportSummary
                  icon={selected ? REASON_ICONS[selected.value] : Flag}
                  eyebrow={subject ? `${TARGET_LABEL[targetType]} · ${subject}` : `${TARGET_LABEL[targetType]} şikayeti`}
                  title={selected?.label ?? "Neden seçilmedi"}
                  action={
                    <Button type="button" variant="ghost" size="sm" className="-mr-1 shrink-0 text-primary" onClick={back} disabled={busy}>
                      Değiştir
                    </Button>
                  }
                />
                <NoteField
                  id={noteId}
                  label="Not ekle (isteğe bağlı)"
                  value={note}
                  onChange={setNote}
                  max={NOTE_MAX}
                  placeholder="Kısaca ne olduğunu yazabilirsin."
                  hint="Kişisel bilgi paylaşma."
                />
                {error === "login_required" ? (
                  <ReportAlert>
                    Şikayet göndermek için giriş yapmalısın.{" "}
                    <button
                      type="button"
                      onClick={() => router.push(routes.auth.login(here()))}
                      className="rounded-sm font-semibold underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      Giriş yap
                    </button>
                  </ReportAlert>
                ) : error ? (
                  <ReportAlert tone={error === "already_reported" ? "info" : "error"}>{ERROR_COPY[error]}</ReportAlert>
                ) : null}
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">Bildirimin gizli tutulur; adın içerik sahibine gösterilmez.</p>
              </ReportStep>
            )}
          </>
        )}
      </BottomSheet>
    </>
  );
}

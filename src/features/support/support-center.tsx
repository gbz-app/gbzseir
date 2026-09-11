"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleCheck, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { formatPhoneInputTR, normalizePhoneTR } from "@/core/phone";
import { createClient } from "@/lib/supabase/client";
import { canGoBack } from "@/lib/navigation-history";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { Field } from "@/features/business/components/editor/field";
import {
  GUEST_STEPS,
  MAX,
  MIN,
  STEP_LABEL,
  STEP_TITLE,
  USER_STEPS,
  charLength,
  resolveStep,
  stepError,
  stepUrl,
  type Draft,
  type FieldKey,
  type StepError,
  type StepId,
} from "./flow";
import { MyMessages, type MyMessage } from "./my-messages";
import { SUPPORT_TOPICS, TOPIC_INFO, type SupportTopic } from "./topics";

const FIELD_ID: Record<FieldKey, string> = { message: "destek-mesaj", phone: "destek-tel", email: "destek-eposta" };

type Props = {
  prefill: { name: string; phone: string };
  loggedIn: boolean;
  messages: MyMessage[];
  /** Shown under the topics on the first step (FAQ, contact cards, footer). */
  children?: React.ReactNode;
};

/**
 * /yardim: step-by-step support flow (Konu seç > Mesajın > İletişim (guests) > Gönder) and a success screen.
 * The step lives in the URL (?konu=...&adim=...) via history.pushState, so the browser back gesture goes one step back.
 */
export function SupportCenter(props: Props) {
  return (
    <React.Suspense fallback={<SupportSkeleton />}>
      <SupportFlow {...props} />
    </React.Suspense>
  );
}

function SupportSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-safe" aria-busy="true" aria-label="Yükleniyor">
      <Skeleton className="mt-2.5 size-11 rounded-full" />
      <Skeleton className="mt-2 h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-4 h-24 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-3xl" />
    </div>
  );
}

function SupportFlow({ prefill, loggedIn, messages, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const steps = loggedIn ? USER_STEPS : GUEST_STEPS;

  const [draft, setDraft] = React.useState<Draft>(() => ({ subject: "", message: "", business: "", name: prefill.name, phone: prefill.phone, email: "" }));
  const [errorState, setErrorState] = React.useState<StepError | null>(null);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [sent, setSent] = React.useState<{ id: string; contact: string | null } | null>(null);
  const [sentMessages, setSentMessages] = React.useState<MyMessage[]>([]);
  const [editContact, setEditContact] = React.useState(false);

  // ?konu=... alone (deep link) starts at "Mesajın"; reload / forward never shows a step after an invalid earlier one.
  const { topic, requested, index } = resolveStep(searchParams.get("konu"), searchParams.get("adim"), steps, draft, loggedIn);
  const step = steps[index];
  const error = errorState && errorState.step === step ? errorState : null;

  const urlFor = React.useCallback((i: number, t: SupportTopic | null) => stepUrl(pathname, steps, i, t), [pathname, steps]);
  /** Forward one step; a second tap before the re-render must not push the same entry twice. */
  const pushStep = (i: number, t: SupportTopic | null) => {
    const url = urlFor(i, t);
    if (window.location.pathname + window.location.search === url) return;
    window.history.pushState(null, "", url);
  };

  // History entries pushed by this flow sit above `base` (the step the page was opened on).
  const baseRef = React.useRef(index);
  const indexRef = React.useRef(index);
  const topicRef = React.useRef(topic);
  const pendingPop = React.useRef<(() => void) | null>(null);
  React.useLayoutEffect(() => {
    indexRef.current = index;
    topicRef.current = topic;
  });

  React.useEffect(() => {
    if (sent || pendingPop.current || index === requested) return;
    window.history.replaceState(null, "", urlFor(index, topic));
    if (index < baseRef.current) baseRef.current = index;
  }, [sent, index, requested, topic, urlFor]);

  React.useEffect(
    () => () => {
      if (pendingPop.current) window.removeEventListener("popstate", pendingPop.current);
    },
    [],
  );

  // New step: back to the top, focus the title (screen readers); first render keeps the position.
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const scrollTarget = React.useRef<string | null>(null);
  const screenKey = sent ? "sent" : step;
  const shownKey = React.useRef(screenKey);
  React.useEffect(() => {
    if (shownKey.current === screenKey) return;
    shownKey.current = screenKey;
    const target = scrollTarget.current ? document.getElementById(scrollTarget.current) : null;
    scrollTarget.current = null;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [screenKey]);

  /** Go back to an earlier step: pops our own history entries, replaces the URL below the entry the page was opened on. */
  const popTo = (target: number, after?: () => void) => {
    // A pop is already on its way (e.g. "Tamam" tapped right after sending).
    if (pendingPop.current) return;
    const base = baseRef.current;
    const hops = indexRef.current - Math.max(target, base);
    const finish = () => {
      if (target < base) {
        baseRef.current = target;
        window.history.replaceState(null, "", urlFor(target, topicRef.current));
      }
      after?.();
    };
    if (hops <= 0) return finish();
    const onPop = () => {
      window.removeEventListener("popstate", onPop);
      pendingPop.current = null;
      finish();
    };
    pendingPop.current = onPop;
    window.addEventListener("popstate", onPop);
    window.history.go(-hops);
  };

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrorState(null);
  };

  const showError = (e: StepError) => {
    setErrorState(e);
    if (e.field) document.getElementById(FIELD_ID[e.field])?.focus();
  };

  const selectTopic = (t: SupportTopic) => {
    setErrorState(null);
    pushStep(1, t);
  };

  const back = () => {
    if (busy) return;
    setErrorState(null);
    if (index === 0) {
      if (canGoBack()) router.back();
      else router.push(routes.profile.root());
      return;
    }
    popTo(index - 1);
  };

  const clearMessage = () => setDraft((d) => ({ ...d, subject: "", message: "", business: "" }));

  const cancel = () => {
    if (busy) return;
    setErrorState(null);
    popTo(0, clearMessage);
  };

  const submit = async () => {
    if (!topic || busyRef.current) return;
    const err = stepError("ozet", draft, loggedIn);
    if (err) {
      setErrorState({ step: "ozet", text: err.text, field: err.step === "iletisim" ? err.field : undefined });
      // Signed-in users fix their contact in place on the summary.
      if (loggedIn && err.step === "iletisim" && err.field) {
        const id = FIELD_ID[err.field];
        setEditContact(true);
        requestAnimationFrame(() => document.getElementById(id)?.focus());
      }
      return;
    }
    const info = TOPIC_INFO[topic];
    const phone = draft.phone.trim();
    const email = draft.email.trim();
    let pagePath: string | null = null;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      pagePath = ref && ref.origin === window.location.origin ? ref.pathname : null;
    } catch {
      pagePath = null;
    }
    busyRef.current = true;
    setBusy(true);
    const { data, error: rpcError } = await createClient().rpc("submit_contact_message", {
      p_topic: topic,
      p_message: draft.message.trim(),
      p_subject: draft.subject.trim() || undefined,
      p_name: draft.name.trim() || undefined,
      p_phone: phone ? (normalizePhoneTR(phone, { allowLandline: true }) ?? phone) : undefined,
      p_email: email || undefined,
      p_business_name: info.business ? draft.business.trim() || undefined : undefined,
      p_page_path: pagePath ?? undefined,
      p_user_agent: topic === "teknik_destek" ? navigator.userAgent.slice(0, 300) : undefined,
    });
    busyRef.current = false;
    setBusy(false);
    if (rpcError || !data) {
      const text = rpcError?.message && /[ğüşıöçİ]/i.test(rpcError.message) ? rpcError.message : "Mesaj gönderilemedi, tekrar dene.";
      setErrorState({ step: "ozet", text });
      return;
    }
    const id = String(data);
    if (loggedIn) {
      const mine: MyMessage = { id, topic, subject: draft.subject.trim() || null, message: draft.message.trim(), status: "new", created_at: new Date().toISOString() };
      setSentMessages((list) => [mine, ...list]);
    }
    setSent({ id, contact: loggedIn ? null : phone || email || null });
    setEditContact(false);
    popTo(0);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (step === "ozet") return void submit();
    const err = stepError(step, draft, loggedIn);
    if (err) return showError(err);
    setErrorState(null);
    pushStep(index + 1, topic);
  };

  const closeSuccess = (toMessages?: boolean) => {
    if (toMessages) scrollTarget.current = "mesajlarim";
    clearMessage();
    setSent(null);
    if (indexRef.current !== 0) popTo(0);
  };

  const allMessages = React.useMemo(() => [...sentMessages, ...messages.filter((m) => !sentMessages.some((s) => s.id === m.id))], [sentMessages, messages]);

  // Success screen.
  if (sent) {
    return (
      <div className="flex flex-col gap-5 px-4 pb-10">
        <FlowHeader title="Mesajın bize ulaştı" onBack={() => closeSuccess()} backLabel="Yardım ve destek" titleRef={titleRef} />
        <section className="flex flex-col items-center rounded-3xl bg-card px-6 py-8 text-center" role="status">
          <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CircleCheck className="size-8" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="mt-4 text-lg font-semibold">Teşekkürler!</p>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {sent.contact ? `En kısa sürede ${sent.contact} üzerinden dönüş yapacağız.` : "En kısa sürede dönüş yapacağız."}
          </p>
          <p className="mt-6 text-xs font-medium text-muted-foreground">Takip numaran</p>
          <p className="mt-0.5 font-mono text-xl font-semibold tracking-wider">#{sent.id.slice(0, 8).toUpperCase()}</p>
          {loggedIn ? <p className="mt-4 text-sm text-muted-foreground">Durumunu Mesajlarım bölümünden takip edebilirsin.</p> : null}
        </section>
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={() => closeSuccess()} className={PRIMARY_BUTTON}>
            Tamam
          </button>
          {loggedIn ? (
            <button type="button" onClick={() => closeSuccess(true)} className={SECONDARY_BUTTON}>
              Mesajlarımı gör
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Step 1: topics, then Mesajlarım, FAQ and the footer.
  if (step === "konu" || !topic) {
    return (
      <div className="flex flex-col gap-5 px-4 pb-10">
        <FlowHeader
          title={STEP_TITLE.konu}
          subtitle="Birkaç adımda bize yaz, ekibimiz en kısa sürede dönüş yapsın."
          onBack={back}
          backLabel="Geri"
          titleRef={titleRef}
        />
        <StepProgress steps={steps} index={0} />
        <section aria-labelledby="destek-konular">
          <h2 id="destek-konular" className="mb-2.5 text-lg font-semibold">
            Ne hakkında yazmak istiyorsun?
          </h2>
          <ul className="flex flex-col gap-2.5">
            {SUPPORT_TOPICS.map((t) => {
              const info = TOPIC_INFO[t];
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => selectTopic(t)}
                    className="flex min-h-20 w-full items-center gap-3.5 rounded-3xl bg-card p-3.5 pr-3 text-left transition-transform outline-none active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl", info.tone)}>
                      <info.icon className="size-7" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base leading-snug font-semibold">{info.label}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{info.text}</span>
                    </span>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-hidden>
                      <ArrowRight className="size-5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!loggedIn ? (
            <p className="mt-3 px-2 text-center text-sm text-muted-foreground">
              Giriş yaparsan iletişim adımını atlarsın, mesajlarını da takip edersin.{" "}
              <Link href={routes.auth.login(routes.content.help())} className="font-semibold text-primary">
                Giriş yap
              </Link>
            </p>
          ) : null}
        </section>
        {loggedIn ? <MyMessages messages={allMessages} /> : null}
        {children}
      </div>
    );
  }

  const info = TOPIC_INFO[topic];
  const last = step === "ozet";
  const idx = (k: StepId) => steps.indexOf(k);

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]">
      <HideBottomNav />
      <FlowHeader
        title={STEP_TITLE[step]}
        subtitle={step === "iletisim" ? "Telefon ya da e-posta yaz, biri yeterli." : undefined}
        onBack={back}
        backLabel="Önceki adım"
        titleRef={titleRef}
        right={
          <button type="button" onClick={cancel} disabled={busy} className={cn(PILL, "disabled:opacity-50")}>
            Vazgeç
          </button>
        }
      />
      <StepProgress steps={steps} index={index} />

      {step === "mesaj" ? (
        <>
          <TopicCard topic={topic} hint={info.hint ?? info.text} onChange={() => popTo(0)} />
          {info.business ? (
            <Field label="İşletme adı" htmlFor="destek-isletme" optional>
              <Input id="destek-isletme" value={draft.business} maxLength={120} onChange={(e) => update({ business: e.target.value })} className={INPUT} />
            </Field>
          ) : null}
          <Field label="Başlık" htmlFor="destek-baslik" optional>
            <Input
              id="destek-baslik"
              value={draft.subject}
              maxLength={120}
              onChange={(e) => update({ subject: e.target.value })}
              placeholder={info.subjectPlaceholder}
              className={INPUT}
            />
          </Field>
          <Field label="Mesajın" htmlFor={FIELD_ID.message}>
            <Textarea
              id={FIELD_ID.message}
              rows={7}
              value={draft.message}
              maxLength={MAX}
              onChange={(e) => update({ message: e.target.value })}
              placeholder={info.messagePlaceholder}
              aria-invalid={error?.field === "message" || undefined}
              aria-describedby="destek-mesaj-sayac"
              className={cn(TEXTAREA, "min-h-40")}
            />
            <div id="destek-mesaj-sayac" className="mt-1.5 flex justify-between gap-2 text-xs text-muted-foreground">
              <span>{charLength(draft.message) < MIN ? `En az ${MIN} karakter yaz.` : "Ne kadar ayrıntı, o kadar hızlı çözüm."}</span>
              <span className="tabular-nums">
                {draft.message.length}/{MAX}
              </span>
            </div>
          </Field>
        </>
      ) : null}

      {step === "iletisim" ? (
        <>
          <ContactFields draft={draft} update={update} error={error} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Bilgilerin yalnızca bu talebe dönüş yapmak için kullanılır. Ayrıntılar{" "}
            <Link href={routes.legal.kvkk()} className="font-semibold text-foreground underline underline-offset-2">
              KVKK Aydınlatma Metni
            </Link>
            &apos;nde.
          </p>
        </>
      ) : null}

      {step === "ozet" ? (
        <>
          <SummaryCard label="Konu" onEdit={() => popTo(0)} editLabel="Değiştir" disabled={busy}>
            <div className="flex items-center gap-3">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", info.tone)}>
                <info.icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="font-semibold">{info.label}</span>
            </div>
          </SummaryCard>

          <SummaryCard label="Mesajın" onEdit={() => popTo(idx("mesaj"))} disabled={busy}>
            {info.business && draft.business.trim() ? (
              <p className="text-sm">
                <span className="text-muted-foreground">İşletme: </span>
                {draft.business.trim()}
              </p>
            ) : null}
            {draft.subject.trim() ? <p className="font-semibold break-words">{draft.subject.trim()}</p> : null}
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{draft.message.trim()}</p>
          </SummaryCard>

          <SummaryCard
            label="İletişim"
            onEdit={loggedIn ? () => setEditContact((v) => !v) : () => popTo(idx("iletisim"))}
            editLabel={loggedIn && editContact ? "Tamam" : "Düzenle"}
            disabled={busy}
          >
            {loggedIn && editContact ? (
              <ContactFields draft={draft} update={update} error={error} optional onEnter={() => setEditContact(false)} />
            ) : (
              <ContactSummary draft={draft} loggedIn={loggedIn} />
            )}
          </SummaryCard>

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            {topic === "teknik_destek" ? "Cihaz ve tarayıcı bilgin mesaja otomatik eklenir. " : null}
            Saatte en fazla 5 mesaj gönderebilirsin.
          </p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error.text}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl bg-linear-to-t from-background via-background/95 to-background/0 px-4 pt-6 pb-[calc(0.9rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            disabled={busy}
            aria-label="Önceki adım"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <ArrowLeft className="size-5" strokeWidth={2.2} />
          </button>
          <button type="submit" disabled={busy} className={cn(PRIMARY_BUTTON, "flex-1")}>
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {last ? (
              <>
                {busy ? null : <Send className="size-5" aria-hidden />}
                Gönder
              </>
            ) : (
              <>
                Devam
                <ArrowRight className="size-5" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

const PRIMARY_BUTTON =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-base font-semibold text-background outline-none transition-transform active:scale-[0.98] hover:bg-foreground/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";
const SECONDARY_BUTTON =
  "inline-flex h-14 w-full items-center justify-center rounded-full bg-card px-6 text-base font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";
const PILL =
  "inline-flex h-11 shrink-0 items-center rounded-full bg-card px-4 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";
/** White fields on the lavender background, no border. */
const INPUT = "h-12 rounded-2xl border-transparent bg-card px-4 text-[15px]";
const TEXTAREA = "rounded-2xl border-transparent bg-card px-4 py-3 text-[15px]";

/** Round back button, big title, optional subtitle and a right slot (the /kesfet header style). */
function FlowHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  right,
  titleRef,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel: string;
  right?: React.ReactNode;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="pt-safe">
      <div className="flex h-(--topbar-h) items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground backdrop-blur-md transition-colors outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-5" strokeWidth={2.2} />
        </button>
        {right}
      </div>
      <h1 ref={titleRef} tabIndex={-1} className="mt-1 text-[1.75rem] leading-tight font-semibold tracking-tight outline-none">
        {title}
      </h1>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

/** Slim segmented progress with the step names under it. */
function StepProgress({ steps, index }: { steps: readonly StepId[]; index: number }) {
  return (
    <div>
      <p className="sr-only" aria-live="polite">
        Adım {index + 1} / {steps.length}: {STEP_LABEL[steps[index]]}
      </p>
      <ol className="flex gap-1.5" aria-hidden>
        {steps.map((s, i) => (
          <li key={s} className="min-w-0 flex-1">
            <span className={cn("block h-1.5 rounded-full transition-colors", i <= index ? "bg-primary" : "bg-foreground/10")} />
            <span
              className={cn(
                "mt-1.5 block truncate text-[11px] font-semibold",
                i === index ? "text-foreground" : i < index ? "text-primary" : "text-muted-foreground",
              )}
            >
              {STEP_LABEL[s]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Chosen topic with its hint and a "Değiştir" button (back to step 1). */
function TopicCard({ topic, hint, onChange }: { topic: SupportTopic; hint: string; onChange: () => void }) {
  const info = TOPIC_INFO[topic];
  return (
    <div className="flex items-start gap-3 rounded-3xl bg-card p-4">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", info.tone)}>
        <info.icon className="size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{info.label}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="-mt-1 -mr-1 inline-flex h-10 shrink-0 items-center rounded-full bg-muted px-3 text-[13px] font-semibold outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Değiştir
      </button>
    </div>
  );
}

/** White summary block with a small label and an edit button. */
function SummaryCard({
  label,
  onEdit,
  editLabel = "Düzenle",
  disabled,
  children,
}: {
  label: string;
  onEdit: () => void;
  editLabel?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h2>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="-my-1.5 -mr-1 inline-flex h-10 shrink-0 items-center rounded-full bg-muted px-3 text-[13px] font-semibold outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {editLabel}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function ContactSummary({ draft, loggedIn }: { draft: Draft; loggedIn: boolean }) {
  const rows = [draft.name.trim(), draft.phone.trim(), draft.email.trim()].filter(Boolean);
  return (
    <>
      {rows.map((r, i) => (
        <p key={i} className="text-[15px] break-words">
          {r}
        </p>
      ))}
      {loggedIn ? (
        <p className="text-sm text-muted-foreground">
          {rows.length ? "Hesabındaki bilgilerle gönderiyorsun." : "Hesabınla gönderiyorsun; mesajın Mesajlarım bölümünde görünür."}
        </p>
      ) : null}
    </>
  );
}

/** Name, phone and e-mail (step 3 for guests; inline edit on the summary for signed-in users). */
function ContactFields({
  draft,
  update,
  error,
  optional,
  onEnter,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  error: StepError | null;
  optional?: boolean;
  /** Inline editor: Enter closes it instead of sending the message. */
  onEnter?: () => void;
}) {
  const onKeyDown = onEnter
    ? (e: React.KeyboardEvent) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        onEnter();
      }
    : undefined;
  return (
    <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
      <Field label="Adın" htmlFor="destek-ad" optional>
        <Input id="destek-ad" value={draft.name} maxLength={80} onChange={(e) => update({ name: e.target.value })} autoComplete="name" className={INPUT} />
      </Field>
      <Field label="Telefon" htmlFor={FIELD_ID.phone} optional={optional}>
        <Input
          id={FIELD_ID.phone}
          type="tel"
          inputMode="tel"
          value={draft.phone}
          maxLength={20}
          onChange={(e) => update({ phone: formatPhoneInputTR(e.target.value) })}
          placeholder="5xx xxx xx xx"
          autoComplete="tel-national"
          aria-invalid={error?.field === "phone" || undefined}
          className={INPUT}
        />
      </Field>
      <Field label="E-posta" htmlFor={FIELD_ID.email} optional={optional}>
        <Input
          id={FIELD_ID.email}
          type="email"
          inputMode="email"
          value={draft.email}
          maxLength={120}
          onChange={(e) => update({ email: e.target.value })}
          placeholder="ornek@eposta.com"
          autoComplete="email"
          aria-invalid={error?.field === "email" || undefined}
          className={INPUT}
        />
      </Field>
    </div>
  );
}

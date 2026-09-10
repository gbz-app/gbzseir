"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/core/format";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormScreen } from "@/components/shared/form-screen";
import { CharCount, Field } from "@/features/business/components/editor/field";
import { MESSAGE_STATUS_LABELS, SUPPORT_TOPICS, TOPIC_INFO, type SupportTopic } from "./topics";

export type MyMessage = { id: string; topic: string; subject: string | null; message: string; status: string; created_at: string };

const PRIMARY: SupportTopic[] = ["sikayet", "teknik_destek", "reklam"];
const SECONDARY = SUPPORT_TOPICS.filter((t) => !PRIMARY.includes(t));

/** /yardim: topic cards that open a contact form; the signed-in user's previous messages below. */
export function SupportCenter({
  initialTopic,
  prefill,
  loggedIn,
  messages,
}: {
  initialTopic: SupportTopic | null;
  prefill: { name: string; phone: string };
  loggedIn: boolean;
  messages: MyMessage[];
}) {
  const [topic, setTopic] = React.useState<SupportTopic | null>(initialTopic);
  const [sent, setSent] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {PRIMARY.map((t) => {
          const info = TOPIC_INFO[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              className="flex items-center gap-3.5 rounded-3xl bg-card p-4 text-left shadow-soft ring-1 ring-foreground/[0.05] transition-transform outline-none active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", info.tone)}>
                <info.icon className="size-6" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{info.label}</span>
                <span className="block text-sm text-muted-foreground">{info.text}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          );
        })}
        <div className="grid grid-cols-3 gap-2">
          {SECONDARY.map((t) => {
            const info = TOPIC_INFO[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-card px-2 py-3 text-center shadow-soft ring-1 ring-foreground/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className={cn("flex size-10 items-center justify-center rounded-xl", info.tone)}>
                  <info.icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-xs leading-tight font-semibold">{t === "isletme" ? "İşletme ekletme" : info.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {sent ? (
        <div role="status" className="flex items-start gap-3 rounded-3xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/20">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <p>
            <strong className="block">Mesajın bize ulaştı.</strong>
            Takip numaran <span className="font-mono font-semibold">#{sent.slice(0, 8).toUpperCase()}</span>. En kısa sürede dönüş yapacağız.
          </p>
        </div>
      ) : null}

      {loggedIn ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Mesajlarım</h2>
          {messages.length ? (
            <ul className="divide-y rounded-3xl bg-card shadow-soft ring-1 ring-foreground/[0.05]">
              {messages.map((m) => {
                const st = MESSAGE_STATUS_LABELS[m.status] ?? MESSAGE_STATUS_LABELS.new;
                const info = TOPIC_INFO[(m.topic as SupportTopic) in TOPIC_INFO ? (m.topic as SupportTopic) : "diger"];
                return (
                  <li key={m.id} className="flex items-start gap-3 p-4">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", info.tone)}>
                      <info.icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold">{m.subject || info.label}</p>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{m.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        #{m.id.slice(0, 8).toUpperCase()} · {formatRelativeTime(m.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl bg-muted/60 px-4 py-4 text-sm text-muted-foreground">Henüz mesaj göndermedin.</p>
          )}
        </section>
      ) : null}

      {topic ? (
        <ContactForm
          key={topic}
          topic={topic}
          prefill={prefill}
          loggedIn={loggedIn}
          onClose={() => setTopic(null)}
          onSent={(id) => {
            setTopic(null);
            setSent(id);
          }}
        />
      ) : null}
    </div>
  );
}

function ContactForm({
  topic,
  prefill,
  loggedIn,
  onClose,
  onSent,
}: {
  topic: SupportTopic;
  prefill: { name: string; phone: string };
  loggedIn: boolean;
  onClose: () => void;
  onSent: (id: string) => void;
}) {
  const router = useRouter();
  const info = TOPIC_INFO[topic];
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [name, setName] = React.useState(prefill.name);
  const [phone, setPhone] = React.useState(prefill.phone);
  const [email, setEmail] = React.useState("");
  const [business, setBusiness] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (message.trim().length < 10) return toast.error("Mesajın en az 10 karakter olmalı.");
    if (!loggedIn && !phone.trim() && !email.trim()) return toast.error("Sana ulaşabilmemiz için telefon ya da e-posta yaz.");
    setBusy(true);
    let pagePath: string | null = null;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      pagePath = ref && ref.origin === window.location.origin ? ref.pathname : null;
    } catch {
      pagePath = null;
    }
    const { data, error } = await createClient().rpc("submit_contact_message", {
      p_topic: topic,
      p_message: message.trim(),
      p_subject: subject.trim() || undefined,
      p_name: name.trim() || undefined,
      p_phone: phone.trim() || undefined,
      p_email: email.trim() || undefined,
      p_business_name: info.business ? business.trim() || undefined : undefined,
      p_page_path: pagePath ?? undefined,
      p_user_agent: topic === "teknik_destek" ? navigator.userAgent.slice(0, 300) : undefined,
    });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message && /[ğüşıöçİ]/i.test(error.message) ? error.message : "Mesaj gönderilemedi, tekrar dene.");
      return;
    }
    toast.success("Mesajın gönderildi");
    onSent(String(data));
    router.refresh();
  };

  return (
    <FormScreen title={info.label} onClose={onClose} onSubmit={submit} busy={busy} submitLabel="Gönder">
      <div className="flex items-start gap-3 rounded-2xl bg-card p-3.5 text-sm shadow-soft ring-1 ring-foreground/[0.05]">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", info.tone)}>
          <info.icon className="size-5" aria-hidden />
        </span>
        <p className="text-muted-foreground">{info.hint ?? info.text}</p>
      </div>
      {info.business ? (
        <Field label="İşletme adı" htmlFor="destek-isletme" optional>
          <Input id="destek-isletme" value={business} maxLength={120} onChange={(e) => setBusiness(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Konu" htmlFor="destek-konu" optional>
        <Input id="destek-konu" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder={info.subjectPlaceholder} />
      </Field>
      <Field label="Mesajın" htmlFor="destek-mesaj">
        <Textarea id="destek-mesaj" autoFocus rows={6} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} placeholder={info.messagePlaceholder} />
        <CharCount value={message} max={2000} />
      </Field>
      <Field label="Adın" htmlFor="destek-ad" optional>
        <Input id="destek-ad" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefon" htmlFor="destek-tel" optional={loggedIn}>
          <Input id="destek-tel" type="tel" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" autoComplete="tel" />
        </Field>
        <Field label="E-posta" htmlFor="destek-eposta" optional>
          <Input id="destek-eposta" type="email" inputMode="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Bilgilerin yalnızca bu talebe dönüş yapmak için kullanılır. Saatte en fazla 5 mesaj gönderebilirsin.
      </p>
      <Button type="button" variant="ghost" className="self-start px-0 text-muted-foreground" onClick={onClose}>
        Vazgeç
      </Button>
    </FormScreen>
  );
}

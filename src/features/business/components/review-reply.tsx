"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquareReply, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { refreshMyBusinessPages } from "../actions";

const REPLY_MAX = 1000;

/** H7 - Public reply of the business to one review (rpc reply_review). */
export function ReviewReply({ reviewId, initialReply }: { reviewId: string; initialReply: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(!initialReply);
  const [text, setText] = React.useState(initialReply ?? "");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    const reply = text.trim();
    if (reply.length < 2) {
      toast.error("Yanıtını yaz.");
      return;
    }
    setSaving(true);
    const { data, error } = await createClient().rpc("reply_review", { p_review_id: reviewId, p_reply: reply });
    setSaving(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      toast.error(error?.message ?? "Yanıt kaydedilemedi.");
      return;
    }
    await refreshMyBusinessPages().catch(() => undefined);
    toast.success("Yanıtın yayında");
    setEditing(false);
    router.refresh();
  };

  if (!editing && initialReply) {
    return (
      <div className="mt-3 rounded-xl bg-brand-soft/70 px-3 py-2.5">
        <p className="text-xs font-bold text-primary">İşletmenin yanıtı</p>
        <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-line">{initialReply}</p>
        <Button variant="link" size="sm" className="h-auto px-0 pt-1" onClick={() => setEditing(true)}>
          <Pencil /> Yanıtı düzenle
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Textarea
        value={text}
        maxLength={REPLY_MAX}
        rows={3}
        placeholder="Teşekkür et ya da açıklama yap. Yanıtın herkese açık görünür."
        onChange={(e) => setText(e.target.value)}
        aria-label="Yoruma yanıt"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {text.length}/{REPLY_MAX}
        </span>
        <div className="flex gap-2">
          {initialReply ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Vazgeç
            </Button>
          ) : null}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <MessageSquareReply />}
            Yanıtla
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { Check, RotateCcw, Save, Search, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setSupportStatusAction } from "../actions/support";
import { useAdminAction } from "./use-admin-action";

type Status = "new" | "in_progress" | "resolved" | "spam";

/** Status buttons + internal note (stored in support_notes; the sender never sees it). */
export function SupportActions({ id, status, note }: { id: string; status: string; note: string | null }) {
  const { pending, run } = useAdminAction();
  const noteId = React.useId();
  const [text, setText] = React.useState(note ?? "");
  const current = (["new", "in_progress", "resolved", "spam"].includes(status) ? status : "new") as Status;
  const set = (s: Status) => run(() => setSupportStatusAction({ id, status: s, note: text }), { refresh: true });
  const closed = current === "resolved" || current === "spam";

  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor={noteId} className="mb-1 block text-xs font-semibold text-muted-foreground">
          İç not (kullanıcı görmez)
        </Label>
        <Textarea id={noteId} rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="ör. Aradım, yarın dönüş yapacağım." />
      </div>
      <div className="flex flex-wrap gap-2">
        {current === "new" ? (
          <Button variant="outline" disabled={pending} onClick={() => set("in_progress")}>
            <Search aria-hidden /> İnceleniyor
          </Button>
        ) : null}
        {!closed ? (
          <Button variant="success" disabled={pending} onClick={() => set("resolved")}>
            <Check aria-hidden /> Çözüldü
          </Button>
        ) : null}
        {!closed ? (
          <Button variant="ghost" disabled={pending} onClick={() => set("spam")}>
            <ShieldX aria-hidden /> Spam
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => set("new")}>
            <RotateCcw aria-hidden /> Yeniden aç
          </Button>
        )}
        <Button variant="ghost" disabled={pending || text === (note ?? "")} onClick={() => set(current)}>
          <Save aria-hidden /> Notu kaydet
        </Button>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { Eye, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/core/format";
import { cn } from "@/lib/utils";
import { LegalBody } from "@/features/legal/legal-body";
import { LEGAL_BODY_MAX, LEGAL_LABELS, LEGAL_TITLE_MAX, type LegalSlug } from "@/features/legal/meta";
import { deleteLegalTextAction, saveLegalTextAction } from "../actions/legal-texts";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type LegalTextValue = {
  id: string;
  version: string;
  title: string;
  body: string;
  pending_review: boolean;
  published_at: string | null;
};

type Props = {
  slug: LegalSlug;
  /** Edit this version (a published one is read-only except its draft note). */
  value?: LegalTextValue;
  /** New version: start from this text (the current one); `version` is the suggested next version number. */
  base?: { version: string; title: string; body: string };
  trigger: React.ReactElement;
};

/** Add / edit one version of a legal text: version, title, plain-text body with preview, draft note and publish switch. */
export function LegalTextDialog({ slug, value, base, trigger }: Props) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [version, setVersion] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pendingReview, setPendingReview] = React.useState(true);
  const [published, setPublished] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const ids = { version: React.useId(), title: React.useId(), body: React.useId() };
  const locked = !!value?.published_at;

  // Fresh values on every open (props change after a save refreshes the page).
  const load = () => {
    setVersion(value?.version ?? base?.version ?? "");
    setTitle(value?.title ?? base?.title ?? LEGAL_LABELS[slug]);
    setBody(value?.body ?? base?.body ?? "");
    setPendingReview(value?.pending_review ?? true);
    setPublished(locked);
    setPreview(locked);
  };

  const onOpenChange = (o: boolean) => {
    if (pending) return;
    if (o) load();
    setOpen(o);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(() => saveLegalTextAction({ id: value?.id, slug, version, title, body, pendingReview, published }), {
      onSuccess: () => setOpen(false),
      refresh: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {LEGAL_LABELS[slug]} · {value ? `sürüm ${value.version}` : "yeni sürüm"}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? "Yayınlanan sürüm, kullanıcıların onayladığı metnin kanıtıdır; değiştirilemez ve silinemez. Değişiklik için yeni sürüm oluştur."
              : "Uygulamada her metnin en yeni yayınlanan sürümü görünür. Yeni kayıt olanların onayı bu sürümle saklanır."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <div>
              <Label htmlFor={ids.version} className="mb-1 block text-xs font-semibold">
                Sürüm
              </Label>
              <Input
                id={ids.version}
                value={version}
                maxLength={20}
                placeholder="1.0"
                onChange={(e) => setVersion(e.target.value)}
                readOnly={locked}
                required
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor={ids.title} className="mb-1 block text-xs font-semibold">
                Başlık
              </Label>
              <Input id={ids.title} value={title} minLength={3} maxLength={LEGAL_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} readOnly={locked} required />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">Yayında</span>
                <span className="block text-xs text-muted-foreground">
                  {locked ? "Yayınlandı; geri alınamaz." : published ? "Kaydedince yayınlanır ve kilitlenir." : "Taslak: yalnızca burada görünür."}
                </span>
              </span>
              <Switch checked={published} onCheckedChange={setPublished} disabled={locked} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">Hukuki inceleme bekliyor</span>
                <span className="block text-xs text-muted-foreground">Sayfada &quot;Taslak - hukuki inceleme bekliyor&quot; notu görünür.</span>
              </span>
              <Switch checked={pendingReview} onCheckedChange={setPendingReview} />
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label htmlFor={ids.body} className="text-xs font-semibold">
                Metin
              </Label>
              {locked ? null : (
                <div className="flex gap-1" role="group" aria-label="Görünüm">
                  <Button type="button" size="sm" variant={preview ? "ghost" : "secondary"} onClick={() => setPreview(false)} aria-pressed={!preview}>
                    <Pencil /> Düzenle
                  </Button>
                  <Button type="button" size="sm" variant={preview ? "secondary" : "ghost"} onClick={() => setPreview(true)} aria-pressed={preview}>
                    <Eye /> Önizle
                  </Button>
                </div>
              )}
            </div>
            {preview ? (
              <div className="max-h-[55dvh] overflow-y-auto rounded-xl bg-muted/40 p-4">
                {body.trim() ? <LegalBody body={body} /> : <p className="text-sm text-muted-foreground">Metin boş.</p>}
              </div>
            ) : (
              <Textarea
                id={ids.body}
                rows={18}
                maxLength={LEGAL_BODY_MAX}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-80 font-mono text-[13px] leading-relaxed"
              />
            )}
            <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Düz metin. Paragrafları boş bir satırla ayır; başlık satırını &quot;## &quot;, maddeleri &quot;- &quot; ile başlat.</span>
              <span className="shrink-0 tabular-nums">
                {formatNumber(body.length)}/{formatNumber(LEGAL_BODY_MAX)}
              </span>
            </p>
          </div>

          {!locked && published ? (
            <p className="rounded-xl bg-highlight-soft px-3 py-2 text-xs font-medium text-highlight-foreground">
              Yayınladıktan sonra bu sürümün sürüm numarası, başlığı ve metni değiştirilemez; sonraki değişiklikler yeni sürümle yapılır.
            </p>
          ) : null}

          <div className={cn("flex flex-wrap gap-2", value && !locked ? "justify-between" : "justify-end")}>
            {value && !locked ? <DeleteLegalDraft id={value.id} version={value.version} onDone={() => setOpen(false)} /> : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {locked ? "Kapat" : "Vazgeç"}
              </Button>
              <Button type="submit" disabled={pending || (locked && pendingReview === value?.pending_review)}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {locked ? "Kaydet" : published ? "Yayınla" : "Taslak kaydet"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteLegalDraft({ id, version, onDone }: { id: string; version: string; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Taslak silinsin mi?"
      description={`Sürüm ${version} taslağı kalıcı olarak silinir.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => {
        const res = await run(() => deleteLegalTextAction({ id }), { refresh: true });
        if (res?.ok) onDone();
        return !!res?.ok;
      }}
    />
  );
}

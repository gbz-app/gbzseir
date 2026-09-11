"use client";

import * as React from "react";
import { FileCheck, FileUp, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { uuid } from "@/lib/images";

export const PRIVATE_DOCS_BUCKET = "private-docs";
const ALLOWED: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024;

/** A file in the private-docs bucket (never public; admins read it through signed URLs). */
export type UploadedDoc = { path: string; name: string; size: number };

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Optional vergi levhası upload to private-docs/<uid>/business/... (PDF, JPG, PNG or WebP, max 10 MB). */
export function DocUpload({ value, onChange, onUploadingChange }: { value: UploadedDoc | null; onChange: (v: UploadedDoc | null) => void; onUploadingChange?: (b: boolean) => void }) {
  const { user } = useAuth();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const upload = async (file: File) => {
    if (!user) return;
    const ext = ALLOWED[file.type];
    if (!ext) {
      toast.error("PDF, JPG, PNG ya da WebP bir dosya seç.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Dosya en fazla 10 MB olabilir.");
      return;
    }
    setBusy(true);
    onUploadingChange?.(true);
    const path = `${user.id}/business/vergi-levhasi-${uuid()}.${ext}`;
    const bucket = createClient().storage.from(PRIVATE_DOCS_BUCKET);
    const { error } = await bucket.upload(path, file, { upsert: false, contentType: file.type });
    setBusy(false);
    onUploadingChange?.(false);
    if (error) {
      toast.error("Belge yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      return;
    }
    const previous = value;
    onChange({ path, name: file.name.slice(0, 120), size: file.size });
    if (previous?.path.startsWith(`${user.id}/`)) void bucket.remove([previous.path]).catch(() => undefined);
  };

  const remove = () => {
    if (value && user && value.path.startsWith(`${user.id}/`)) void createClient().storage.from(PRIVATE_DOCS_BUCKET).remove([value.path]).catch(() => undefined);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
            <FileCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{value.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(value.size)} · Yüklendi</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={remove} aria-label="Belgeyi kaldır" className="text-muted-foreground">
            <Trash2 />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || !user}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-brand-soft/40 p-5 text-center text-primary outline-none hover:bg-brand-soft focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-7 animate-spin" aria-hidden /> : <FileUp className="size-7" aria-hidden />}
          <span className="text-[15px] font-bold">{busy ? "Yükleniyor…" : "Vergi levhası yükle"}</span>
          <span className="text-xs text-muted-foreground">PDF ya da fotoğraf, en fazla 10 MB</span>
        </button>
      )}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Belgeler herkese açık değildir; yalnızca Gebzem ekibi görebilir. Vergi levhanı yüklersen ekibimiz işletmeni
        doğrulayabilir ve sayfanda &quot;Onaylı&quot; rozeti görünür.
      </p>
    </div>
  );
}

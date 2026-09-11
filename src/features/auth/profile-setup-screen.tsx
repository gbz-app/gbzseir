"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UploadedImage } from "@/components/shared/image-uploader";
import { FULL_NAME_MAX, formatFullNameTr, fullNameError, nameWords } from "@/core/name";
import { routes } from "@/core/routes";
import { createClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { MARKETING_CONSENT_SESSION_KEY } from "@/lib/auth/otp";
import { readString, removeItem } from "@/lib/storage";
import { AuthStepHeader } from "./auth-step-header";
import { AvatarCirclePicker } from "./avatar-circle-picker";

export type ProfileSetupInitial = {
  fullName?: string | null;
  avatarUrl?: string | null;
};

/** Current URL with or without ?adim=foto (keeps ?next=...). */
function stepUrl(pathname: string, photo: boolean): string {
  const p = new URLSearchParams(window.location.search);
  if (photo) p.set("adim", "foto");
  else p.delete("adim");
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * B3 /giris/profil: a new user's profile in two steps - full name ("Ad SOYAD"), then an optional round photo.
 * The photo step lives in the URL (?adim=foto, history.pushState), so the back gesture returns to the name step.
 */
export function ProfileSetupScreen({ next, initial }: { next: string; initial?: ProfileSetupInitial }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, refreshProfile } = useAuth();
  const [name, setName] = React.useState(() => formatFullNameTr(initial?.fullName));
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [avatar, setAvatar] = React.useState<UploadedImage | null>(() =>
    initial?.avatarUrl ? { url: initial.avatarUrl, thumbUrl: initial.avatarUrl, path: "", thumbPath: "" } : null,
  );
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState<"photo" | "skip" | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pushedRef = React.useRef(false);
  const inputId = React.useId();

  const formatted = formatFullNameTr(name);
  const valid = fullNameError(name) === null;
  // Never show the photo step without a valid name (reload, forward).
  const step: "name" | "photo" = searchParams.get("adim") === "foto" && valid ? "photo" : "name";

  // The name is not saved until the end: a reload on the photo step starts from the name again.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).has("adim")) window.history.replaceState(null, "", stepUrl(pathname, false));
  }, [pathname]);

  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    const err = fullNameError(name);
    setName(formatted);
    setNameError(err);
    if (!err) {
      pushedRef.current = true;
      window.history.pushState(null, "", stepUrl(pathname, true));
      window.scrollTo({ top: 0 });
    }
  };

  const backToName = () => {
    if (saving) return;
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", stepUrl(pathname, false));
    }
  };

  const save = async (mode: "photo" | "skip") => {
    if (saving) return;
    const fullName = formatFullNameTr(name);
    if (fullNameError(fullName)) return;
    setSubmitError(null);
    setSaving(mode);
    const supabase = createClient();
    const uid = user?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      router.replace(routes.auth.login(next));
      return;
    }
    // KVKK + terms accepted on the login screen. A DB trigger stamps the server time and the live KVKK version
    // (profiles.kvkk_version). E-mail and neighbourhood are optional and edited later in Kişisel bilgiler.
    const row = {
      full_name: fullName,
      avatar_url: avatar?.url ?? null,
      onboarded: true,
      kvkk_accepted_at: new Date().toISOString(),
      marketing_consent: readString(MARKETING_CONSENT_SESSION_KEY, "session") === "1",
    };
    const upd = await supabase.from(TABLES.profiles).update(row).eq("id", uid).select("id");
    let error = upd.error;
    if (!error && (!upd.data || upd.data.length === 0)) {
      error = (await supabase.from(TABLES.profiles).upsert({ id: uid, ...row })).error;
    }
    if (error) {
      setSaving(null);
      setSubmitError("Profil kaydedilemedi. Lütfen tekrar dene.");
      return;
    }
    removeItem(MARKETING_CONSENT_SESSION_KEY, "session");
    await refreshProfile();
    toast.success(`Hoş geldin ${nameWords(fullName)[0]}`);
    router.replace(next);
    router.refresh();
  };

  if (step === "name") {
    return (
      <div className="flex flex-1 flex-col">
        <AuthStepHeader step={3} fill={0.5} title="Adın ne?" description="Adını ve soyadını yaz. Soyadını biz büyük harfle yazarız." />

        <form onSubmit={submitName} noValidate className="flex flex-col">
          <label htmlFor={inputId} className="mb-2 text-sm font-semibold">
            Ad soyad
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            autoFocus
            maxLength={FULL_NAME_MAX + 10}
            placeholder="Örn. Ayşe Nur Yılmaz"
            value={name}
            aria-invalid={!!nameError || undefined}
            aria-describedby={nameError ? `${inputId}-err` : `${inputId}-preview`}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            onBlur={() => setName(formatted)}
            className={cn(
              "h-14 w-full rounded-2xl bg-card px-5 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
              nameError && "ring-2 ring-destructive/50",
            )}
          />
          {nameError ? (
            <p id={`${inputId}-err`} role="alert" className="mt-2 text-sm font-medium text-destructive">
              {nameError}
            </p>
          ) : null}

          <p id={`${inputId}-preview`} className="mt-3 flex min-h-6 items-center gap-2 text-[15px]">
            {formatted ? (
              <>
                <BadgeCheck className={cn("size-5 shrink-0", valid ? "text-primary" : "text-muted-foreground/60")} aria-hidden />
                <span className="shrink-0 text-muted-foreground">Profilinde:</span>
                <span className="min-w-0 truncate font-semibold">{formatted}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Profilinde böyle görünür: Ayşe Nur YILMAZ</span>
            )}
          </p>

          <Button type="submit" size="lg" className="mt-7 h-13 w-full text-base shadow-none">
            Devam et
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        </form>
      </div>
    );
  }

  const busy = uploading || saving !== null;

  return (
    <div className="flex flex-1 flex-col">
      <AuthStepHeader
        step={3}
        title="Profil fotoğrafı"
        description="Profilinde görünür. İstersen sonra da ekleyebilirsin."
        onBack={backToName}
        backLabel="Ad soyad adımına dön"
      />

      <div className="flex flex-col items-center">
        <AvatarCirclePicker value={avatar} onChange={setAvatar} onUploadingChange={setUploading} inputRef={fileRef} />
        <p className="mt-1 max-w-full truncate text-center text-lg font-semibold">{formatted}</p>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-10">
        {submitError ? (
          <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="h-13 w-full text-base shadow-none"
          disabled={busy}
          onClick={() => (avatar ? void save("photo") : fileRef.current?.click())}
        >
          {saving === "photo" || (uploading && !avatar) ? <Loader2 className="animate-spin" /> : avatar ? null : <Camera aria-hidden />}
          {avatar ? "Devam et" : "Fotoğraf seç"}
        </Button>
        {avatar ? null : (
          <Button type="button" variant="ghost" size="lg" className="h-12 w-full text-base text-muted-foreground" disabled={busy} onClick={() => void save("skip")}>
            {saving === "skip" ? <Loader2 className="animate-spin" /> : null}
            Şimdilik geç
          </Button>
        )}
      </div>
    </div>
  );
}

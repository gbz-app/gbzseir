"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { createClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { MARKETING_CONSENT_SESSION_KEY } from "@/lib/auth/otp";
import { getDefaultNeighbourhood } from "@/lib/location/store";
import { readString, removeItem } from "@/lib/storage";

const NAME_RE = /^[\p{L}][\p{L}\s'.-]*$/u;

const schema = z.object({
  firstName: z.string().trim().min(2, "Adını yaz (en az 2 harf).").max(40, "En fazla 40 karakter.").regex(NAME_RE, "Sadece harf kullan."),
  lastName: z.string().trim().min(2, "Soyadını yaz (en az 2 harf).").max(40, "En fazla 40 karakter.").regex(NAME_RE, "Sadece harf kullan."),
  email: z.union([z.literal(""), z.email("Geçerli bir e-posta adresi gir.")]),
  neighbourhoodId: z.string().nullable(),
});

type FormValues = z.infer<typeof schema>;

export type ProfileSetupInitial = {
  fullName?: string | null;
  email?: string | null;
  neighbourhoodId?: string | null;
  avatarUrl?: string | null;
};

function splitName(full?: string | null): [string, string] {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  if (parts.length === 1) return [parts[0], ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

/** B3 /giris/profil: complete the profile of a new user (name, neighbourhood, optional e-mail + avatar). */
export function ProfileSetupScreen({ next, initial }: { next: string; initial?: ProfileSetupInitial }) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [first, last] = splitName(initial?.fullName);
  const [avatar, setAvatar] = React.useState<UploadedImage[]>(() =>
    initial?.avatarUrl ? [{ url: initial.avatarUrl, thumbUrl: initial.avatarUrl, path: "", thumbPath: "" }] : [],
  );
  const [uploading, setUploading] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: first,
      lastName: last,
      email: initial?.email ?? "",
      neighbourhoodId: initial?.neighbourhoodId ?? null,
    },
  });

  // Pre-fill Mahalle from the neighbourhood chosen during onboarding / in the top bar (client only).
  React.useEffect(() => {
    if (!getValues("neighbourhoodId")) {
      const stored = getDefaultNeighbourhood();
      if (stored) setValue("neighbourhoodId", stored.id);
    }
  }, [getValues, setValue]);

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    const supabase = createClient();
    const uid = user?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      router.replace(`/giris?next=${encodeURIComponent(next)}`);
      return;
    }
    const clean = (s: string) => s.trim().replace(/\s+/g, " ");
    const payload = {
      full_name: `${clean(values.firstName)} ${clean(values.lastName)}`,
      email: values.email ? values.email.trim().toLowerCase() : null,
      neighbourhood_id: values.neighbourhoodId,
      avatar_url: avatar[0]?.url ?? null,
      onboarded: true,
      kvkk_accepted_at: new Date().toISOString(),
      marketing_consent: readString(MARKETING_CONSENT_SESSION_KEY, "session") === "1",
    };
    const upd = await supabase.from(TABLES.profiles).update(payload).eq("id", uid).select("id");
    let error = upd.error;
    if (!error && (!upd.data || upd.data.length === 0)) {
      error = (await supabase.from(TABLES.profiles).upsert({ id: uid, ...payload })).error;
    }
    if (error) {
      setSubmitError("Profil kaydedilemedi. Lütfen tekrar dene.");
      return;
    }
    removeItem(MARKETING_CONSENT_SESSION_KEY, "session");
    await refreshProfile();
    toast.success(`Hoş geldin ${clean(values.firstName)} 👋`);
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="flex flex-1 flex-col pt-4">
      <div className="mb-7">
        <h1 className="text-[1.75rem] leading-tight font-extrabold">Seni tanıyalım</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Profilini tamamla; sana yakın içerikleri gösterelim.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <ImageUploader variant="avatar" value={avatar} onChange={setAvatar} fileNamePrefix="avatar-" onUploadingChange={setUploading} />

        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <div>
            <Label htmlFor="firstName" className="mb-1.5 block text-sm font-semibold">
              Ad
            </Label>
            <Input id="firstName" autoComplete="given-name" autoCapitalize="words" aria-invalid={!!errors.firstName || undefined} {...register("firstName")} />
            {errors.firstName ? <p className="mt-1.5 text-sm text-destructive">{errors.firstName.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="lastName" className="mb-1.5 block text-sm font-semibold">
              Soyad
            </Label>
            <Input id="lastName" autoComplete="family-name" autoCapitalize="words" aria-invalid={!!errors.lastName || undefined} {...register("lastName")} />
            {errors.lastName ? <p className="mt-1.5 text-sm text-destructive">{errors.lastName.message}</p> : null}
          </div>
        </div>

        <div>
          <Label htmlFor="neighbourhood" className="mb-1.5 block text-sm font-semibold">
            Mahalle
          </Label>
          <Controller
            control={control}
            name="neighbourhoodId"
            render={({ field }) => (
              <NeighbourhoodPicker id="neighbourhood" value={field.value} onChange={(n) => field.onChange(n ? String(n.id) : null)} showUseLocation />
            )}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Yakınındaki eczane, usta ve ilanları öne çıkarmak için kullanırız.</p>
        </div>

        <div>
          <Label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
            E-posta <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
          </Label>
          <Input id="email" type="email" inputMode="email" autoComplete="email" placeholder="ornek@eposta.com" aria-invalid={!!errors.email || undefined} {...register("email")} />
          {errors.email ? <p className="mt-1.5 text-sm text-destructive">{errors.email.message}</p> : null}
        </div>

        {submitError ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="mt-2 h-13 w-full text-base" disabled={isSubmitting || uploading}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          Kaydet ve devam et
        </Button>
      </form>
    </div>
  );
}

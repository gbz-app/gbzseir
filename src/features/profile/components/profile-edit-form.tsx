"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { routes } from "@/core/routes";
import { formatPhoneTR } from "@/core/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { useAuth } from "@/lib/auth/auth-provider";
import { applyProfileNeighbourhood } from "@/lib/location/store";
import { createClient } from "@/lib/supabase/client";
import type { Neighbourhood } from "@/lib/types";

const NAME_RE = /^[\p{L}][\p{L}\s'.-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ProfileEditInitial = {
  fullName: string | null;
  email: string | null;
  neighbourhoodId: string | null;
  avatarUrl: string | null;
  phone: string | null;
};

function splitName(full: string | null): [string, string] {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [parts[0] ?? "", ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

/** G3 - Profili düzenle: only name, neighbourhood, e-mail and photo (consents are not touched). */
export function ProfileEditForm({ initial }: { initial: ProfileEditInitial }) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [first0, last0] = splitName(initial.fullName);
  const [firstName, setFirstName] = React.useState(first0);
  const [lastName, setLastName] = React.useState(last0);
  const [email, setEmail] = React.useState(initial.email ?? "");
  const [neighbourhoodId, setNeighbourhoodId] = React.useState<string | null>(initial.neighbourhoodId);
  const [picked, setPicked] = React.useState<Neighbourhood | null>(null);
  const [avatar, setAvatar] = React.useState<UploadedImage[]>(() =>
    initial.avatarUrl ? [{ url: initial.avatarUrl, thumbUrl: initial.avatarUrl, path: "", thumbPath: "" }] : [],
  );
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const validate = (): string | null => {
    const f = firstName.trim();
    const l = lastName.trim();
    if (f.length < 2 || !NAME_RE.test(f)) return "Adını yaz (en az 2 harf).";
    if (l.length < 2 || !NAME_RE.test(l)) return "Soyadını yaz (en az 2 harf).";
    if (email.trim() && !EMAIL_RE.test(email.trim())) return "Geçerli bir e-posta adresi gir.";
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    setError(v);
    if (v || !user) return;
    setSaving(true);
    const clean = (s: string) => s.trim().replace(/\s+/g, " ");
    const { error: upError } = await createClient()
      .from("profiles")
      .update({
        full_name: `${clean(firstName)} ${clean(lastName)}`,
        email: email.trim() ? email.trim().toLowerCase() : null,
        neighbourhood_id: neighbourhoodId,
        avatar_url: avatar[0]?.url ?? null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (upError) {
      setError("Profil kaydedilemedi. Lütfen tekrar dene.");
      return;
    }
    // Mirror a changed neighbourhood in the top-bar choice (untouched field: the local choice stays).
    if (!neighbourhoodId || picked) {
      applyProfileNeighbourhood(
        initial.neighbourhoodId,
        neighbourhoodId && picked ? { id: neighbourhoodId, name: picked.name, district: picked.district, lat: picked.lat, lng: picked.lng } : null,
      );
    }
    await refreshProfile();
    toast.success("Profilin güncellendi");
    router.push(routes.profile.root());
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 px-4 pt-4 pb-8" noValidate>
      <div className="flex justify-center">
        <ImageUploader variant="avatar" value={avatar} onChange={setAvatar} fileNamePrefix="avatar-" onUploadingChange={setUploading} label="Profil fotoğrafı" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad">Ad</Label>
          <Input id="ad" autoComplete="given-name" value={firstName} maxLength={40} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="soyad">Soyad</Label>
          <Input id="soyad" autoComplete="family-name" value={lastName} maxLength={40} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Mahalle</Label>
        <NeighbourhoodPicker
          value={neighbourhoodId}
          onChange={(n) => {
            setNeighbourhoodId(n ? String(n.id) : null);
            setPicked(n);
          }}
          persistDefault={false}
          allowClear
          showUseLocation
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="eposta">E-posta (isteğe bağlı)</Label>
        <Input id="eposta" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <Link
        href={routes.profile.changePhone()}
        className="flex min-h-14 items-center gap-3 rounded-2xl bg-card px-4 py-3 transition-colors hover:bg-muted/60"
      >
        <Smartphone className="size-5 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Telefon numarası</span>
          <span className="block font-medium tabular-nums">{initial.phone ? formatPhoneTR(initial.phone) : "-"}</span>
        </span>
        <span className="text-sm font-semibold text-primary">Değiştir</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={saving || uploading}>
        {saving ? <Loader2 className="animate-spin" /> : null}
        Kaydet
      </Button>
    </form>
  );
}

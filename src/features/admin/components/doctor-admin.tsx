"use client";

import * as React from "react";
import { Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-provider";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { uuid, type ProcessedImage } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DemoBadge } from "@/components/shared/badges";
import { FilterChip } from "@/components/shared/explore-header";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { formatDate } from "@/core/format";
import { DoctorAvatar } from "@/features/business/components/doctors/doctor-card";
import {
  DEFAULT_DOCTOR_BRANCH,
  DOCTOR_TITLES,
  branchLabel,
  doctorDisplayName,
  formatDoctorDays,
  type Doctor,
  type DoctorBranch,
  type DoctorTitle,
} from "@/features/business/components/doctors/doctor-meta";
import { DAY_KEYS, DAY_SHORT_LABELS, type DayKey } from "@/features/business/lib/hours";
import { deleteDoctorAction, saveDoctorAction, setDoctorActiveAction } from "../actions/doctors";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

/** A doctor as the admin reads it: the public fields plus when the KVKK consent was confirmed. */
export type AdminDoctor = Doctor & { consentAt: string | null };

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const NAME_MAX = 80;
const HOURS_MAX = 80;
const BIO_MAX = 300;
const CONSENT_REQUIRED = "Yayınlamak için bu kişinin onayının alındığını işaretle.";

/** A saved photo has an empty path, so the uploader and discardFresh never delete it. */
const toImages = (url: string | null | undefined): UploadedImage[] => (url ? [{ url, thumbUrl: url, path: "", thumbPath: "" }] : []);

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold">
      {children}
    </Label>
  );
}

/**
 * Upload for the shared ImageUploader: only the 480 px rendition, to media/<uid>/business/doktor-<id>.webp (the owner
 * picker's naming, so deleteDoctorAction can take it down). A round avatar never needs the 1600 px original.
 */
function useDoctorPhotoUpload() {
  const { user } = useAuth();
  return React.useCallback(
    async (p: ProcessedImage): Promise<UploadedImage | null> => {
      if (!user) return null;
      const img = p.thumb;
      const path = `${user.id}/business/doktor-${uuid()}.${img.ext}`;
      const bucket = createClient().storage.from(STORAGE_BUCKETS.media);
      const { error } = await bucket.upload(path, img.blob, { cacheControl: "31536000", upsert: false, contentType: img.mime });
      if (error) throw new Error("Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      const url = bucket.getPublicUrl(path).data.publicUrl;
      return { url, thumbUrl: url, path, thumbPath: "", width: img.width, height: img.height };
    },
    [user],
  );
}

/**
 * "Doktorlar" block of a business on /admin/isletmeler: each doctor with photo or initials, title + name, branch, days
 * and a visibility switch; add / edit / delete in dialogs. `canAdd` is false when the business is not sağlık (its old
 * rows can still be edited, hidden or deleted).
 */
export function BusinessDoctors({
  businessId,
  businessName,
  canAdd,
  doctors,
  branches,
}: {
  businessId: string;
  businessName: string;
  canAdd: boolean;
  doctors: AdminDoctor[];
  branches: readonly DoctorBranch[];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Doktorlar{doctors.length ? ` (${doctors.length})` : ""}</h3>
        {canAdd ? (
          <DoctorDialog
            businessId={businessId}
            businessName={businessName}
            branches={branches}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Plus aria-hidden /> Doktor ekle
              </Button>
            }
          />
        ) : null}
      </div>
      {doctors.length ? (
        <ul className="mt-1 divide-y">
          {doctors.map((d) => (
            // The key follows is_active, so the switch takes the saved value after a refresh.
            <DoctorRow key={`${d.id}:${d.is_active ? 1 : 0}`} doctor={d} businessId={businessId} businessName={businessName} branches={branches} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Henüz doktor eklenmemiş. Eklenen doktorlar işletme sayfasının Doktorlar sekmesinde görünür.</p>
      )}
      {canAdd ? null : (
        <p className="mt-1 text-xs text-muted-foreground">Bu işletme sağlık türünde değil: yeni doktor eklenemez. Mevcut kayıtları gizleyebilir ya da silebilirsin.</p>
      )}
    </div>
  );
}

function DoctorRow({ doctor, businessId, businessName, branches }: { doctor: AdminDoctor; businessId: string; businessName: string; branches: readonly DoctorBranch[] }) {
  const { pending, run } = useAdminAction();
  const [active, setActive] = React.useState(doctor.is_active);
  const display = doctorDisplayName(doctor);

  const toggle = (next: boolean) => {
    setActive(next);
    void run(() => setDoctorActiveAction({ id: doctor.id, active: next }), { refresh: true, onError: () => setActive(!next) });
  };

  return (
    <li className="flex items-center gap-3 py-2.5">
      <DoctorAvatar doctor={doctor} className={cn("size-11", !active && "opacity-55")} textClassName="text-sm" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={cn("truncate font-semibold", !active && "text-muted-foreground")}>{display}</span>
          {doctor.is_demo ? <DemoBadge label="Örnek" className="h-5 px-1.5 text-[11px]" /> : null}
          {active ? null : <Badge variant="secondary">Gizli</Badge>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {branchLabel(doctor.branch, branches)} · {formatDoctorDays(doctor.days) ?? "Gün seçilmedi"}
        </span>
      </span>
      <Switch checked={active} disabled={pending} onCheckedChange={toggle} aria-label={`${display} işletme sayfasında görünsün`} />
      <DoctorDialog
        businessId={businessId}
        businessName={businessName}
        branches={branches}
        item={doctor}
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label={`${display} düzenle`}>
            <Pencil />
          </Button>
        }
      />
    </li>
  );
}

/** Add / edit a doctor: photo, title, name, branch, days, hours note, short bio, visibility; the KVKK box when adding. */
function DoctorDialog({
  businessId,
  businessName,
  branches,
  item,
  trigger,
}: {
  businessId: string;
  businessName: string;
  branches: readonly DoctorBranch[];
  item?: AdminDoctor;
  trigger: React.ReactElement;
}) {
  const { pending, run } = useAdminAction();
  const upload = useDoctorPhotoUpload();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState<DoctorTitle>("Dr.");
  const [name, setName] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [days, setDays] = React.useState<DayKey[]>([]);
  const [hours, setHours] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [photo, setPhoto] = React.useState<UploadedImage[]>([]);
  const [active, setActive] = React.useState(true);
  const [consent, setConsent] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const ids = { title: React.useId(), name: React.useId(), branch: React.useId(), hours: React.useId(), bio: React.useId(), consent: React.useId() };
  const busy = pending || uploading;

  // Active branches, plus the doctor's own one when it was turned off (or is unknown) later.
  const options: DoctorBranch[] = branches.filter((b) => b.active || b.key === item?.branch);
  if (item && !options.some((b) => b.key === item.branch)) options.push({ key: item.branch, label: branchLabel(item.branch), icon: null, active: false });
  if (!options.some((b) => b.key === DEFAULT_DOCTOR_BRANCH)) options.push({ key: DEFAULT_DOCTOR_BRANCH, label: "Diğer", icon: null, active: true });

  /** Fill the form from the saved row each time the dialog opens. */
  const load = () => {
    setTitle(item?.title ?? "Dr.");
    setName(item?.name ?? "");
    setBranch(item?.branch ?? "");
    setDays(item?.days ?? []);
    setHours(item?.hours_note ?? "");
    setBio(item?.bio ?? "");
    setPhoto(toImages(item?.photo_url));
    setActive(item?.is_active ?? true);
    setConsent(false);
  };

  /** A photo uploaded in this dialog but not saved is deleted when the dialog closes without saving. */
  const discardFresh = () => {
    const paths = photo.map((p) => p.path).filter(Boolean);
    if (paths.length) void createClient().storage.from(STORAGE_BUCKETS.media).remove(paths);
  };

  const onOpenChange = (next: boolean) => {
    if (busy) return;
    if (next) load();
    else discardFresh();
    setOpen(next);
  };

  const toggleDay = (d: DayKey) => setDays((s) => DAY_KEYS.filter((k) => (k === d ? !s.includes(k) : s.includes(k))));

  const submit = () => {
    if (!branch) return void toast.error("Branş seç.");
    if (!item && !consent) return void toast.error(CONSENT_REQUIRED);
    void run(
      () =>
        saveDoctorAction({
          id: item?.id,
          businessId,
          title,
          name,
          branch,
          days,
          hoursNote: hours,
          bio,
          photoUrl: photo[0]?.url ?? null,
          active,
          consent: item ? true : consent,
        }),
      { refresh: true, onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? `${doctorDisplayName(item)} düzenle` : "Doktor ekle"}</DialogTitle>
          <DialogDescription>
            {businessName} sayfasının Doktorlar sekmesinde görünür. Doktorun kendi telefonu yok; hastalar &quot;Randevu için ara&quot; dediğinde işletmenin numarası aranır.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-4"
        >
          <ImageUploader
            variant="avatar"
            value={photo}
            onChange={setPhoto}
            upload={upload}
            onUploadingChange={setUploading}
            label="Fotoğraf"
            hint="İsteğe bağlı. Yüzün net göründüğü bir fotoğraf seç; yoksa baş harfler görünür."
          />
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
            <div>
              <FieldLabel htmlFor={ids.title}>Unvan</FieldLabel>
              <select id={ids.title} value={title} onChange={(e) => setTitle(e.target.value as DoctorTitle)} className={SELECT}>
                {DOCTOR_TITLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor={ids.name}>Ad soyad</FieldLabel>
              <Input id={ids.name} value={name} minLength={2} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="ör. Ayşe Yılmaz" autoComplete="off" required />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor={ids.branch}>Branş</FieldLabel>
            <select id={ids.branch} value={branch} onChange={(e) => setBranch(e.target.value)} className={SELECT} required>
              <option value="" disabled>
                Branş seç
              </option>
              {options.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.active ? b.label : `${b.label} (pasif)`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Çalıştığı günler</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Çalıştığı günler">
              {DAY_KEYS.map((d) => (
                <FilterChip key={d} active={days.includes(d)} onClick={() => toggleDay(d)}>
                  {DAY_SHORT_LABELS[d]}
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel htmlFor={ids.hours}>Saat notu (isteğe bağlı)</FieldLabel>
            <Input id={ids.hours} value={hours} maxLength={HOURS_MAX} onChange={(e) => setHours(e.target.value)} placeholder="ör. 09:00 - 17:00 ya da Randevu ile" />
          </div>
          <div>
            <FieldLabel htmlFor={ids.bio}>Kısa bilgi (isteğe bağlı)</FieldLabel>
            <Textarea id={ids.bio} rows={3} value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="Uzmanlık alanı, ilgilendiği tedaviler" />
            <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
              {bio.length}/{BIO_MAX}
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <span>
              <span className="block font-semibold">İşletme sayfasında görünsün</span>
              <span className="text-muted-foreground">Kapalıysa doktor gizlenir ama silinmez.</span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
          {item ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              {item.consentAt ? `Yayın onayı ${formatDate(item.consentAt)} tarihinde işaretlendi.` : "Yayın onayı kayıtlı."}
            </p>
          ) : (
            <label htmlFor={ids.consent} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3 text-sm">
              <Checkbox id={ids.consent} checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" aria-required />
              <span className="min-w-0">
                <span className="block font-semibold">Bu kişinin bilgilerini yayınlamak için onayı alındı</span>
                <span className="mt-1 flex items-start gap-1.5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Ad, unvan, fotoğraf ve çalışma günleri herkese açık görünür (KVKK). Onay zamanı kaydedilir; kişi isterse kaydı silebilirsin.
                </span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            {item ? (
              <DeleteDoctor
                id={item.id}
                name={doctorDisplayName(item)}
                onDone={() => {
                  discardFresh();
                  setOpen(false);
                }}
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={busy}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {item ? "Kaydet" : "Ekle"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDoctor({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Doktor silinsin mi?"
      description={`"${name}" bilgileri ve fotoğrafıyla birlikte işletme sayfasından kalkar; geri alınamaz. Geçici gizlemek için görünürlüğü kapatabilirsin.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => {
        const res = await run(() => deleteDoctorAction({ id }), { refresh: true });
        if (res?.ok) onDone();
        return !!res?.ok;
      }}
    />
  );
}

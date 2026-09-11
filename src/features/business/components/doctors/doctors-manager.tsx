"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Plus, ShieldCheck, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DemoBadge } from "@/components/shared/badges";
import { FilterChip } from "@/components/shared/explore-header";
import { FormScreen } from "@/components/shared/form-screen";
import { refreshMyBusinessPages } from "../../actions";
import { DAY_KEYS, DAY_SHORT_LABELS, type DayKey } from "../../lib/hours";
import { CharCount, Field } from "../editor/field";
import { BusinessImagePicker, mediaPathFromUrl, type PickedImage } from "../editor/image-picker";
import { DoctorAvatar } from "./doctor-card";
import {
  DEFAULT_DOCTOR_BRANCH,
  DOCTOR_BRANCHES,
  DOCTOR_COLUMNS,
  DOCTOR_TITLES,
  branchLabel,
  doctorDisplayName,
  formatDoctorDays,
  toDoctor,
  type Doctor,
  type DoctorBranch,
  type DoctorTitle,
  type RawDoctor,
} from "./doctor-meta";

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const NAME_MAX = 80;
const BIO_MAX = 300;
const HOURS_MAX = 80;

/**
 * Owner doctors editor (sağlık): add, edit, reorder, show / hide, delete. Saved immediately through RLS (owner of a
 * sağlık business). Calls on the public page go to the business phone; doctors have no phone field.
 */
export function DoctorsManager({
  businessId,
  initial,
  branches = DOCTOR_BRANCHES,
  pageHref,
}: {
  businessId: string;
  initial: Doctor[];
  branches?: readonly DoctorBranch[];
  /** Public firm page, Doktorlar tab. */
  pageHref: string;
}) {
  const [doctors, setDoctors] = React.useState<Doctor[]>(initial);
  const [editing, setEditing] = React.useState<Doctor | "new" | null>(null);
  const supabase = React.useMemo(() => createClient(), []);
  const { user } = useAuth();
  const done = () => void refreshMyBusinessPages().catch(() => undefined);
  const fail = () => toast.error("İşlem yapılamadı, tekrar dene.");

  /** Deletes a photo we uploaded (our own media folder); other URLs are left alone. */
  const removePhoto = React.useCallback(
    (url: string | null | undefined) => {
      const path = mediaPathFromUrl(url, user?.id);
      if (path) void supabase.storage.from(STORAGE_BUCKETS.media).remove([path]).catch(() => undefined);
    },
    [supabase, user?.id],
  );

  const move = async (index: number, dir: -1 | 1) => {
    const a = doctors[index];
    const b = doctors[index + dir];
    if (!a || !b) return;
    // Equal sort values (older rows) would not swap: give both their list position first.
    const sa = a.sort === b.sort ? index : a.sort;
    const sb = a.sort === b.sort ? index + dir : b.sort;
    const next = [...doctors];
    next[index] = { ...b, sort: sa };
    next[index + dir] = { ...a, sort: sb };
    setDoctors(next);
    const res = await Promise.all([
      supabase.from("business_staff").update({ sort: sb }).eq("id", a.id),
      supabase.from("business_staff").update({ sort: sa }).eq("id", b.id),
    ]);
    if (res.some((r) => r.error)) fail();
    else done();
  };

  const toggle = async (d: Doctor) => {
    const next = !d.is_active;
    setDoctors((all) => all.map((x) => (x.id === d.id ? { ...x, is_active: next } : x)));
    const { error } = await supabase.from("business_staff").update({ is_active: next }).eq("id", d.id);
    if (error) {
      setDoctors((all) => all.map((x) => (x.id === d.id ? { ...x, is_active: d.is_active } : x)));
      return fail();
    }
    toast.success(next ? `${doctorDisplayName(d)} sayfanda görünüyor` : `${doctorDisplayName(d)} gizlendi`);
    done();
  };

  const remove = async (d: Doctor) => {
    if (!window.confirm(`"${doctorDisplayName(d)}" silinsin mi? Bilgileri ve fotoğrafı sayfandan kalkar.`)) return;
    const { error } = await supabase.from("business_staff").delete().eq("id", d.id);
    if (error) return fail();
    removePhoto(d.photo_url);
    setDoctors((all) => all.filter((x) => x.id !== d.id));
    setEditing(null);
    toast.success("Silindi");
    done();
  };

  const visible = doctors.filter((d) => d.is_active).length;

  return (
    <div className="flex flex-col gap-3">
      {doctors.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-5 py-8 text-center">
          <Stethoscope className="size-10 text-primary/50" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 font-semibold">Henüz doktor eklemedin</p>
          <p className="mt-1 text-sm text-muted-foreground">Doktorlarını unvan, branş ve çalışma günleriyle ekle. Hastalar sayfanda görüp seni arasın.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {doctors.map((d, i) => (
            <li key={d.id} className="flex items-center gap-2 rounded-3xl bg-card p-2 pr-3">
              <button
                type="button"
                onClick={() => setEditing(d)}
                className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left hover:bg-muted/60", !d.is_active && "opacity-55")}
              >
                <DoctorAvatar doctor={d} className="size-14" textClassName="text-base" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold">{doctorDisplayName(d)}</span>
                    {d.is_demo ? <DemoBadge label="Örnek" className="h-5 shrink-0 px-1.5 text-[11px]" /> : null}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{branchLabel(d.branch, branches)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDoctorDays(d.days) ?? "Gün seçilmedi"}
                    {!d.is_active ? " · gizli" : ""}
                  </span>
                </span>
              </button>
              <span className="flex flex-col">
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`${d.name} yukarı`}
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
                  onClick={() => move(i, 1)}
                  disabled={i === doctors.length - 1}
                  aria-label={`${d.name} aşağı`}
                >
                  <ChevronDown className="size-4" />
                </button>
              </span>
              <Switch checked={d.is_active} onCheckedChange={() => toggle(d)} aria-label={`${d.name} sayfada görünsün`} />
            </li>
          ))}
        </ul>
      )}

      <Button size="lg" onClick={() => setEditing("new")}>
        <Plus /> Doktor ekle
      </Button>

      {visible > 0 ? (
        <Link href={pageHref} className="flex min-h-14 items-center gap-3 rounded-3xl bg-card px-4 py-3 text-[15px] font-medium outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50">
          <Stethoscope className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">Sayfandaki Doktorlar sekmesini gör</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Doktor kartında telefon yok: hastalar &quot;Randevu için ara&quot; dediğinde işletmenin numarası aranır.
      </p>

      {editing ? (
        <DoctorForm
          key={editing === "new" ? "new" : editing.id}
          businessId={businessId}
          doctor={editing === "new" ? null : editing}
          branches={branches}
          nextSort={doctors.reduce((m, d) => Math.max(m, d.sort), -1) + 1}
          onClose={() => setEditing(null)}
          onDelete={remove}
          onSaved={(d, previousPhoto) => {
            if (previousPhoto && previousPhoto !== d.photo_url) removePhoto(previousPhoto);
            setDoctors((all) => (all.some((x) => x.id === d.id) ? all.map((x) => (x.id === d.id ? d : x)) : [...all, d]));
            setEditing(null);
            done();
          }}
        />
      ) : null}
    </div>
  );
}

function DoctorForm({
  businessId,
  doctor,
  branches,
  nextSort,
  onClose,
  onSaved,
  onDelete,
}: {
  businessId: string;
  doctor: Doctor | null;
  branches: readonly DoctorBranch[];
  nextSort: number;
  onClose: () => void;
  onSaved: (d: Doctor, previousPhoto: string | null) => void;
  onDelete: (d: Doctor) => void;
}) {
  const [title, setTitle] = React.useState<DoctorTitle>(doctor?.title ?? "Dr.");
  const [name, setName] = React.useState(doctor?.name ?? "");
  const [branch, setBranch] = React.useState(doctor?.branch ?? "");
  const [days, setDays] = React.useState<DayKey[]>(doctor?.days ?? []);
  const [hours, setHours] = React.useState(doctor?.hours_note ?? "");
  const [bio, setBio] = React.useState(doctor?.bio ?? "");
  const [photo, setPhoto] = React.useState<PickedImage | null>(doctor?.photo_url ? { url: doctor.photo_url, path: null } : null);
  const [active, setActive] = React.useState(doctor?.is_active ?? true);
  // An existing row was published with consent; a new one needs the box ticked.
  const [consent, setConsent] = React.useState(!!doctor);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Active branches, plus the current one when an admin turned it off later.
  const branchOptions = branches.filter((b) => b.active || b.key === doctor?.branch);
  const toggleDay = (d: DayKey) => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : DAY_KEYS.filter((k) => k === d || s.includes(k))));

  const submit = async () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (n.length < 2 || n.length > NAME_MAX) return toast.error(`Ad soyad 2-${NAME_MAX} karakter olmalı.`);
    if (!branch) return toast.error("Branş seç.");
    if (hours.trim().length > HOURS_MAX) return toast.error(`Saat notu en fazla ${HOURS_MAX} karakter olabilir.`);
    if (bio.trim().length > BIO_MAX) return toast.error(`Kısa bilgi en fazla ${BIO_MAX} karakter olabilir.`);
    if (!consent) return toast.error("Yayınlamak için bu kişinin onayı olduğunu işaretle.");
    setSaving(true);
    const values = {
      title,
      name: n,
      branch,
      days,
      hours_note: hours.trim() || null,
      bio: bio.trim() || null,
      photo_url: photo?.url ?? null,
      is_active: active,
    };
    const supabase = createClient();
    const { data, error } = doctor
      ? await supabase.from("business_staff").update(values).eq("id", doctor.id).select(DOCTOR_COLUMNS).single()
      : await supabase
          .from("business_staff")
          // The server stamps the consent time; this value only says the box was ticked.
          .insert({ ...values, business_id: businessId, sort: nextSort, consent_confirmed_at: new Date().toISOString() })
          .select(DOCTOR_COLUMNS)
          .single();
    setSaving(false);
    if (error || !data) {
      if (error?.code === "42501") return toast.error("Bu işletmeye doktor ekleyemezsin. Doktorlar yalnızca sağlık işletmelerinde var.");
      if (error?.hint === "consent_required") return toast.error(error.message);
      return toast.error("Doktor kaydedilemedi, tekrar dene.");
    }
    toast.success(doctor ? "Doktor güncellendi" : "Doktor eklendi");
    onSaved(toDoctor(data as unknown as RawDoctor), doctor?.photo_url ?? null);
  };

  return (
    <FormScreen
      title={doctor ? "Doktoru düzenle" : "Doktor ekle"}
      onClose={onClose}
      onSubmit={submit}
      busy={saving || uploading}
      footerExtra={
        doctor ? (
          <Button type="button" variant="outline" size="lg" className="text-destructive" onClick={() => onDelete(doctor)} aria-label="Doktoru sil">
            <Trash2 />
          </Button>
        ) : null
      }
    >
      <BusinessImagePicker
        value={photo}
        onChange={setPhoto}
        onUploadingChange={setUploading}
        deleteReplaced
        label="Fotoğraf"
        hint="Yüzün net göründüğü bir fotoğraf. İsteğe bağlı; yoksa baş harfler görünür."
        prefix="doktor-"
      />
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
        <Field label="Unvan" htmlFor="dr-unvan">
          <select id="dr-unvan" value={title} onChange={(e) => setTitle(e.target.value as DoctorTitle)} className={SELECT}>
            {DOCTOR_TITLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ad soyad" htmlFor="dr-ad">
          <Input id="dr-ad" autoFocus={!doctor} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="ör. Ayşe Yılmaz" autoComplete="off" />
        </Field>
      </div>
      <Field label="Branş" htmlFor="dr-brans">
        <select id="dr-brans" value={branch} onChange={(e) => setBranch(e.target.value)} className={SELECT}>
          <option value="" disabled>
            Branş seç
          </option>
          {branchOptions.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
          {branchOptions.some((b) => b.key === DEFAULT_DOCTOR_BRANCH) ? null : <option value={DEFAULT_DOCTOR_BRANCH}>Diğer</option>}
        </select>
      </Field>
      <Field label="Çalıştığı günler" optional hint="Kartta ve doktorun ayrıntısında görünür.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Çalıştığı günler">
          {DAY_KEYS.map((d) => (
            <FilterChip key={d} active={days.includes(d)} onClick={() => toggleDay(d)}>
              {DAY_SHORT_LABELS[d]}
            </FilterChip>
          ))}
        </div>
      </Field>
      <Field label="Saat notu" htmlFor="dr-saat" optional>
        <Input id="dr-saat" value={hours} maxLength={HOURS_MAX} onChange={(e) => setHours(e.target.value)} placeholder="ör. 09:00 - 17:00 ya da Randevu ile" />
      </Field>
      <Field label="Kısa bilgi" htmlFor="dr-bio" optional>
        <Textarea id="dr-bio" rows={3} value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="Uzmanlık alanı, ilgilendiği tedaviler" />
        <CharCount value={bio} max={BIO_MAX} />
      </Field>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4">
        <span>
          <span className="block font-semibold">Sayfamda görünsün</span>
          <span className="text-sm text-muted-foreground">Kapalıysa doktor gizlenir ama silinmez.</span>
        </span>
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
      <label htmlFor="dr-onay" className="flex items-start gap-3 rounded-2xl bg-card p-4">
        <Checkbox id="dr-onay" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" aria-required />
        <span className="min-w-0">
          <span className="block font-semibold">Bu kişinin bilgilerini yayınlamak için onayı var</span>
          <span className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Ad, unvan, fotoğraf ve çalışma günleri sayfanda herkese açık görünür. Kişi isterse bilgilerini buradan silebilirsin.
          </span>
        </span>
      </label>
    </FormScreen>
  );
}

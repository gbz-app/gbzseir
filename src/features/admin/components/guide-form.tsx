"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus, SkipForward, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { KOCAELI_DISTRICTS, districtBySlug } from "@/config/districts";
import { formatPhoneTR } from "@/core/format";
import type { LatLng } from "@/core/geo";
import { routes } from "@/core/routes";
import { districtForPoint } from "@/lib/location/use-approx-location";
import { LocationPicker } from "@/features/business/components/editor/location-picker";
import { GUIDE_KIND_META, GUIDE_LIST_KINDS, OWNERSHIP_LABELS, SOCKET_LABELS } from "@/features/guide/lib/constants";
import type { GuideListKind, GuidePhoto, Ownership } from "@/features/guide/lib/types";
import { deleteGuideAction, saveGuideAction } from "../actions/guide";
import {
  GUIDE_CATEGORY_FIELD_LABELS,
  SOCKET_TYPES,
  guideCategoryField,
  guideCategoryOptions,
  guideDeletable,
  istanbulDate,
  type GuideFormValue,
  type GuideVocab,
} from "../lib/guide-admin";
import { ConfirmDialog } from "./confirm-dialog";
import { GuideOptions } from "./guide-options";
import { useAdminAction } from "./use-admin-action";

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const MAX_PHONES = 8;

type Draft = {
  kind: GuideListKind;
  name: string;
  address: string;
  /** District slug, "" when not chosen. */
  districtId: string;
  location: LatLng | null;
  phones: string[];
  fax: string;
  email: string;
  website: string;
  hours: string;
  description: string;
  fee: string;
  category: string;
  subkind: string;
  ownership: Ownership | "";
  bank: string;
  brand: string;
  operator: string;
  sockets: Record<string, string>;
  powerKw: string;
  capacity: string;
  atmCount: string;
  curated: boolean;
  verified: boolean;
  verifiedDate: string;
  sourceUrls: string;
  hidden: boolean;
  locked: boolean;
};

const numText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** Stored phone for editing: "0262 123 45 67"; the import's "+90444XXXX" lines as "444 X XXX"; short codes as they are. */
function phoneText(p: string): string {
  const short = /^\+90(444|850)(\d)(\d{3})$/.exec(p);
  return short ? `${short[1]} ${short[2]} ${short[3]}` : formatPhoneTR(p);
}

function toDraft(v: GuideFormValue | undefined, kind: GuideListKind): Draft {
  return {
    kind: v?.kind ?? kind,
    name: v?.name ?? "",
    address: v?.address ?? "",
    districtId: v?.districtId ?? "",
    location: v && v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng } : null,
    phones: v?.phones.length ? v.phones.map(phoneText) : [""],
    fax: v?.fax ? phoneText(v.fax) : "",
    email: v?.email ?? "",
    website: v?.website ?? "",
    hours: v?.hours ?? "",
    description: v?.description ?? "",
    fee: v?.fee ?? "",
    category: v?.category ?? "",
    subkind: v?.subkind ?? "",
    ownership: v?.ownership ?? "",
    bank: v?.bank ?? "",
    brand: v?.brand ?? "",
    operator: v?.operator ?? "",
    sockets: Object.fromEntries(SOCKET_TYPES.map((t) => [t, numText(v?.sockets[t])])),
    powerKw: numText(v?.powerKw),
    capacity: numText(v?.capacity),
    atmCount: numText(v?.atmCount),
    curated: v?.curated ?? false,
    verified: !!v?.verifiedAt,
    verifiedDate: v?.verifiedAt ? istanbulDate(v.verifiedAt) : "",
    sourceUrls: (v?.sourceUrls ?? []).join("\n"),
    hidden: v?.hidden ?? false,
    // Saving locks the row so the city guide import and data syncs keep the admin's edits.
    locked: true,
  };
}

/** "" -> null, a non-negative number (integer when `int`), or undefined when it is not one. */
function parseNum(s: string, int = false): number | null | undefined {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || (int && !Number.isInteger(n))) return undefined;
  return n;
}

export type GuideQueue = {
  /** Next record without a pin (null: this is the last one). */
  nextHref: string | null;
  /** Where "Kaydet" goes when the queue is done. */
  doneHref: string;
};

/**
 * Add / edit a city guide record: basics per kind (institution / place category, bank, fuel brand, EV operator and
 * sockets), map pin (Google Maps with address search), address and district, phones, e-mail, website, hours,
 * texts, photos, verification with its sources, hiding and the import lock.
 */
export function GuideForm({
  value,
  initialKind,
  vocab,
  openMap = false,
  queue = null,
  backHref,
}: {
  value?: GuideFormValue;
  /** Kind of a new record (?tur=). */
  initialKind: GuideListKind;
  vocab: GuideVocab;
  /** Open the map pin at once ("Konumu eksik" queue). */
  openMap?: boolean;
  queue?: GuideQueue | null;
  /** Where to go after deleting. */
  backHref: string;
}) {
  const router = useRouter();
  const { pending, run } = useAdminAction();
  const uid = React.useId();
  const fid = (name: string) => `${uid}-${name}`;
  const [d, setD] = React.useState<Draft>(() => toDraft(value, initialKind));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const [photos, setPhotos] = React.useState<UploadedImage[]>(() =>
    // Saved photos: `path` only has to be unique (the uploader never deletes a URL-shaped path).
    (value?.photos ?? []).map((p) => ({ url: p.url, thumbUrl: p.url, path: p.url, thumbPath: "" })),
  );
  const [uploading, setUploading] = React.useState(false);
  const [addressHint, setAddressHint] = React.useState<string | null>(null);
  const [today] = React.useState(() => istanbulDate());
  const credits = React.useMemo(() => new Map<string, GuidePhoto>((value?.photos ?? []).map((p) => [p.url, p])), [value]);

  const kind = d.kind;
  const field = guideCategoryField(kind);
  const fieldLabels = GUIDE_CATEGORY_FIELD_LABELS[field];
  const categoryValue = d[field];
  const options = guideCategoryOptions(kind, vocab, { current: categoryValue || null });
  const placeSubkinds = kind === "place" ? (vocab.placeCategories.find((c) => c.key === d.category)?.subkinds ?? []) : [];
  const subkindOptions = d.subkind && !placeSubkinds.some((s) => s.key === d.subkind) ? [...placeSubkinds, { key: d.subkind, label: d.subkind }] : placeSubkinds;
  const districtCenter = districtBySlug(d.districtId)?.center ?? null;
  const imported = !!value && (!!value.sourceRef || value.source === "osm" || value.source === "kbb");
  const deletable = value ? guideDeletable(value.source, value.sourceRef) : false;
  const busy = pending || uploading;
  const commonsCredits = photos.map((p) => credits.get(p.url)).filter((p): p is GuidePhoto => !!p?.credit);

  const onAddress = (a: string) => {
    if (!d.address.trim()) set("address", a);
    else if (a.trim() !== d.address.trim()) setAddressHint(a);
  };

  // A confirmed pin fills in its district (district polygons); the select below can still change it.
  const onPin = (p: LatLng | null) => {
    set("location", p);
    if (!p) return;
    void districtForPoint(p).then((slug) => {
      if (slug) set("districtId", slug);
    });
  };

  const submit = (goNext: boolean) => {
    const powerKw = parseNum(d.powerKw);
    const capacity = parseNum(d.capacity, true);
    const atmCount = parseNum(d.atmCount, true);
    if (powerKw === undefined || capacity === undefined || atmCount === undefined) {
      toast.error("Sayı alanlarına yalnızca rakam yaz.");
      return;
    }
    const sockets: Record<string, number | null> = {};
    for (const t of SOCKET_TYPES) {
      const n = parseNum(d.sockets[t] ?? "", true);
      if (n === undefined) {
        toast.error("Soket sayısı tam sayı olmalı.");
        return;
      }
      if (n !== null) sockets[t] = n;
    }
    const withCategory = kind === "institution" || kind === "place";
    const withBank = kind === "atm" || kind === "bank";
    const input = {
      id: value?.id,
      kind,
      name: d.name,
      address: d.address,
      districtId: d.districtId || null,
      lat: d.location?.lat ?? null,
      lng: d.location?.lng ?? null,
      phones: d.phones.map((p) => p.trim()).filter(Boolean),
      fax: kind === "institution" ? d.fax : "",
      email: d.email,
      website: d.website,
      hours: d.hours,
      description: d.description,
      fee: kind === "place" ? d.fee : "",
      category: withCategory ? d.category || null : null,
      subkind: kind === "place" ? d.subkind || null : null,
      ownership: kind === "institution" ? d.ownership || null : null,
      bank: withBank ? d.bank || null : null,
      brand: kind === "fuel" ? d.brand || null : null,
      operator: kind === "ev_charge" ? d.operator || null : null,
      sockets: kind === "ev_charge" ? sockets : {},
      powerKw: kind === "ev_charge" ? powerKw : null,
      capacity: kind === "ev_charge" ? capacity : null,
      atmCount: kind === "atm" ? atmCount : null,
      curated: kind === "place" && d.curated,
      photos: photos.map(
        (p) => credits.get(p.url) ?? { url: p.url, alt: d.name.trim() || null, credit: null, author: null, licence: null, licenceUrl: null, sourcePage: null },
      ),
      verified: d.verified,
      verifiedDate: d.verified ? d.verifiedDate || today : null,
      sourceUrls: d.sourceUrls
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
      hidden: d.hidden,
      locked: d.locked,
    };
    void run(() => saveGuideAction(input), {
      onSuccess: (data) => {
        if (goNext && queue) router.push(queue.nextHref ?? queue.doneHref);
        else if (!value) router.replace(routes.admin.guideItem(data.id));
        else router.refresh();
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="grid max-w-3xl gap-4"
    >
      <Section title="Temel bilgiler">
        {value ? null : (
          <Field label="Tür" htmlFor={fid("kind")}>
            <select
              id={fid("kind")}
              value={kind}
              // Institution and place categories are different lists: start the category over.
              onChange={(e) => setD((p) => ({ ...p, kind: e.target.value as GuideListKind, category: "", subkind: "" }))}
              className={SELECT}
            >
              {GUIDE_LIST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {GUIDE_KIND_META[k].label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ad" htmlFor={fid("name")}>
            <Input id={fid("name")} value={d.name} maxLength={200} required onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={fieldLabels.label} htmlFor={fid("cat")} hint={kind === "institution" ? "Boş bırakırsan Diğer kamu kurumu olur." : undefined}>
            <select id={fid("cat")} value={categoryValue} onChange={(e) => set(field, e.target.value)} className={SELECT} required={kind === "place"}>
              <option value="">{field === "category" ? "Kategori seç" : fieldLabels.none}</option>
              <GuideOptions options={options} />
            </select>
          </Field>
        </div>
        {kind === "place" && subkindOptions.length ? (
          <Field label="Alt tür" htmlFor={fid("sub")}>
            <select id={fid("sub")} value={d.subkind} onChange={(e) => set("subkind", e.target.value)} className={SELECT}>
              <option value="">Yok</option>
              {subkindOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {kind === "institution" ? (
          <Field label="Sahiplik" htmlFor={fid("own")}>
            <select id={fid("own")} value={d.ownership} onChange={(e) => set("ownership", e.target.value as Ownership | "")} className={SELECT}>
              <option value="">Belirtilmemiş</option>
              {(Object.keys(OWNERSHIP_LABELS) as Ownership[]).map((o) => (
                <option key={o} value={o}>
                  {OWNERSHIP_LABELS[o]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </Section>

      <Section title="Konum" description="İğnesi olmayan kayıt listede görünür; haritada ve Yakınımda'da görünmez.">
        <LocationPicker
          value={d.location}
          onChange={onPin}
          fallbackCenter={districtCenter}
          onAddress={onAddress}
          hint={d.address.trim() ? `Adres: ${d.address.trim()}` : "Haritayı kaydırarak iğneyi kaydın tam üzerine getir."}
          autoOpen={openMap}
        />
        <Field label="Adres" htmlFor={fid("address")}>
          <Input id={fid("address")} value={d.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />
          {addressHint ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
              <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 break-words">Haritadan: {addressHint}</span>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => {
                  set("address", addressHint);
                  setAddressHint(null);
                }}
              >
                Bunu kullan
              </Button>
              <Button type="button" size="icon-xs" variant="ghost" aria-label="Öneriyi kapat" onClick={() => setAddressHint(null)}>
                <X />
              </Button>
            </div>
          ) : null}
        </Field>
        <Field label="İlçe" htmlFor={fid("district")} hint="İğneyi koyunca kendiliğinden seçilir. Boş kalırsa iğnenin ilçesi yazılır.">
          <select id={fid("district")} value={d.districtId} onChange={(e) => set("districtId", e.target.value)} className={SELECT}>
            <option value="">Seçilmedi</option>
            {KOCAELI_DISTRICTS.map((x) => (
              <option key={x.slug} value={x.slug}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="İletişim">
        <div>
          <p className="mb-1 text-xs font-semibold">Telefonlar</p>
          <div className="grid gap-2">
            {d.phones.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  type="tel"
                  inputMode="tel"
                  value={p}
                  maxLength={24}
                  placeholder="0262 123 45 67"
                  aria-label={`Telefon ${i + 1}`}
                  onChange={(e) =>
                    set(
                      "phones",
                      d.phones.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Telefon ${i + 1}: kaldır`}
                  onClick={() => set("phones", d.phones.length > 1 ? d.phones.filter((_, j) => j !== i) : [""])}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {d.phones.length < MAX_PHONES ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => set("phones", [...d.phones, ""])}>
                <Plus /> Telefon ekle
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">İlk numara ana numaradır; Ara butonu onu arar.</p>
          </div>
        </div>
        {kind === "institution" ? (
          <Field label="Faks" htmlFor={fid("fax")}>
            <Input id={fid("fax")} type="tel" inputMode="tel" value={d.fax} maxLength={24} onChange={(e) => set("fax", e.target.value)} />
          </Field>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="E-posta" htmlFor={fid("email")}>
            <Input id={fid("email")} type="email" inputMode="email" value={d.email} maxLength={200} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Web sitesi" htmlFor={fid("web")}>
            <Input id={fid("web")} inputMode="url" value={d.website} maxLength={500} placeholder="https://" onChange={(e) => set("website", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Ayrıntılar">
        <Field label="Çalışma saatleri" htmlFor={fid("hours")}>
          <Input id={fid("hours")} value={d.hours} maxLength={500} placeholder="Hafta içi 08:30-17:30" onChange={(e) => set("hours", e.target.value)} />
        </Field>
        <Field label="Açıklama" htmlFor={fid("desc")}>
          <Textarea id={fid("desc")} rows={4} maxLength={2000} value={d.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        {kind === "place" ? (
          <>
            <Field label="Giriş ücreti" htmlFor={fid("fee")}>
              <Input id={fid("fee")} value={d.fee} maxLength={200} placeholder="Ücretsiz" onChange={(e) => set("fee", e.target.value)} />
            </Field>
            <SwitchRow
              title="Öne çıkan yer"
              hint="Ana sayfada ve Gezilecek Yerler listesinin başında görünür."
              checked={d.curated}
              onCheckedChange={(v) => set("curated", v)}
            />
          </>
        ) : null}
        {kind === "atm" ? (
          <Field label="Aynı noktadaki ATM sayısı" htmlFor={fid("atm")}>
            <Input id={fid("atm")} type="number" inputMode="numeric" min={0} max={50} value={d.atmCount} onChange={(e) => set("atmCount", e.target.value)} />
          </Field>
        ) : null}
        {kind === "ev_charge" ? (
          <>
            <div>
              <p className="mb-1 text-xs font-semibold">Soketler (adet)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {SOCKET_TYPES.map((t) => (
                  <div key={t}>
                    <Label htmlFor={fid(`s-${t}`)} className="mb-1 block text-xs text-muted-foreground">
                      {SOCKET_LABELS[t] ?? t}
                    </Label>
                    <Input
                      id={fid(`s-${t}`)}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={d.sockets[t] ?? ""}
                      onChange={(e) => set("sockets", { ...d.sockets, [t]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="En yüksek güç (kW)" htmlFor={fid("kw")}>
                <Input id={fid("kw")} type="number" inputMode="decimal" min={0} step="any" value={d.powerKw} onChange={(e) => set("powerKw", e.target.value)} />
              </Field>
              <Field label="Şarj noktası sayısı" htmlFor={fid("cap")}>
                <Input id={fid("cap")} type="number" inputMode="numeric" min={0} value={d.capacity} onChange={(e) => set("capacity", e.target.value)} />
              </Field>
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Fotoğraflar" description="İlki kapak olur. Yalnızca kullanım hakkına sahip olduğun fotoğrafları yükle.">
        <ImageUploader value={photos} onChange={setPhotos} max={12} folder="places" onUploadingChange={setUploading} />
        {commonsCredits.length ? (
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Fotoğraf hakları (sayfada gösterilir)</p>
            <ul className="mt-1 grid gap-0.5">
              {commonsCredits.map((p) => (
                <li key={p.url} className="break-words">
                  {p.credit}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="Doğrulama ve kaynaklar">
        <SwitchRow
          title="Bilgiler doğrulandı"
          hint="Telefonu ve adresi resmî bir kaynaktan kontrol ettiysen aç. Sayfada doğrulama tarihi görünür."
          checked={d.verified}
          onCheckedChange={(v) => setD((p) => ({ ...p, verified: v, verifiedDate: v ? p.verifiedDate || today : p.verifiedDate }))}
        />
        {d.verified ? (
          <Field label="Doğrulama tarihi" htmlFor={fid("vdate")}>
            <Input id={fid("vdate")} type="date" value={d.verifiedDate} max={today} onChange={(e) => set("verifiedDate", e.target.value)} className="sm:max-w-56" />
          </Field>
        ) : null}
        <Field label="Kaynak bağlantıları" htmlFor={fid("src")} hint="Her satıra bir adres. Bilginin geldiği resmî sayfalar; en fazla 20.">
          <Textarea id={fid("src")} rows={3} value={d.sourceUrls} placeholder="https://..." onChange={(e) => set("sourceUrls", e.target.value)} />
        </Field>
      </Section>

      <Section title="Görünürlük">
        <SwitchRow
          title="Gizle"
          hint="Uygulamada, haritada ve aramada görünmez; sayfası açılmaz."
          checked={d.hidden}
          onCheckedChange={(v) => set("hidden", v)}
        />
        {imported ? (
          <SwitchRow
            title="İçe aktarma değiştirmesin"
            hint="Açıkken şehir rehberi içe aktarması ve veri eşitlemesi bu kayıtta senin girdiğin bilgileri değiştirmez."
            checked={d.locked}
            onCheckedChange={(v) => set("locked", v)}
          />
        ) : null}
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {value ? <DeleteGuide id={value.id} name={value.name} deletable={deletable} afterHref={backHref} /> : <span />}
        <div className="flex flex-wrap gap-2">
          {queue?.nextHref ? (
            <Button asChild variant="secondary">
              <Link href={queue.nextHref}>
                <SkipForward aria-hidden /> Atla
              </Link>
            </Button>
          ) : null}
          {queue ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => submit(true)}>
              {queue.nextHref ? "Kaydet ve sıradaki" : "Kaydet ve bitir"}
            </Button>
          ) : null}
          <Button type="submit" disabled={busy}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} {value ? "Kaydet" : "Ekle"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 sm:p-5">
      <h2 className="font-heading text-base font-bold">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold">
        {label}
      </Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SwitchRow({ title, hint, checked, onCheckedChange }: { title: string; hint: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function DeleteGuide({ id, name, deletable, afterHref }: { id: string; name: string; deletable: boolean; afterHref: string }) {
  const router = useRouter();
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title={deletable ? "Kayıt silinsin mi?" : "Kayıt kaldırılsın mı?"}
      description={
        deletable
          ? `"${name}" kalıcı olarak silinir.`
          : `"${name}" içe aktarılan veriden geldi. Silinirse bir sonraki içe aktarmada geri gelir; bu yüzden gizlenip kilitlenir ve uygulamada hiç görünmez.`
      }
      confirmLabel={deletable ? "Sil" : "Kaldır"}
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> {deletable ? "Sil" : "Kaldır"}
        </Button>
      }
      onConfirm={async () => {
        const res = await run(() => deleteGuideAction({ id }));
        if (res?.ok) router.push(afterHref);
        return !!res?.ok;
      }}
    />
  );
}

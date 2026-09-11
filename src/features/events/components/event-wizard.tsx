"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarClock, Eye, Gift, ImagePlus, MapPin, PenLine, Phone, Store, Tags, Ticket, UserRound, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { formatPhoneTR } from "@/core/format";
import { formatPhoneInputTR, normalizePhoneTR } from "@/core/phone";
import { istanbulDateKey } from "@/core/time";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Wizard, type WizardStep } from "@/components/wizard/wizard";
import { readWizardDraft } from "@/components/wizard/draft";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/client";
import { CharCount, Field } from "@/features/business/components/editor/field";
import { LocationPicker } from "@/features/business/components/editor/location-picker";
import { istanbulIso, normalizeUrl, parseAmount } from "@/features/business/lib/form-utils";
import { vocabIcon, type EventCategoryDef } from "@/features/business/lib/verticals";
import { refreshEventPages } from "../actions";
import { SELF, emptyEventDraft, type EventDraft } from "../draft";
import { eventDateLabel, eventPriceLabel, eventTimeLabel } from "../format";
import type { EventItem } from "../queries";
import { eventErrorMessage, type EventStatus } from "../status";
import { EventCard } from "./event-card";
import { EventChip } from "./chip";
import { EventCoverPicker } from "./event-cover-picker";

const TITLE_MIN = 3;
const TITLE_MAX = 120;
const DESC_MAX = 3000;
const VENUE_MAX = 120;
const ADDRESS_MAX = 200;
const NOTE_MAX = 80;
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** An approved business of the user (organizer choice + "at my business" place). */
export type WizardBusiness = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  neighbourhoodId: string | null;
};

export type EventWizardEdit = {
  id: string;
  slug: string;
  businessId: string | null;
  status: EventStatus;
  adminHidden: boolean;
  startsAt: string;
  draft: EventDraft;
};

export type EventWizardProps = {
  categories: readonly EventCategoryDef[];
  businesses: WizardBusiness[];
  /** ?isletme=<id> from the business panel: created as that business, the "Kim adına?" step is skipped. */
  presetBusinessId: string | null;
  edit: EventWizardEdit | null;
  /** The user's own phone (E.164) for "Kendi numaramı kullan". */
  profilePhone: string | null;
};

function startIso(d: EventDraft): string | null {
  return DATE_RE.test(d.startDate) && TIME_RE.test(d.startTime) ? istanbulIso(d.startDate, d.startTime) : null;
}

function endIso(d: EventDraft): string | null {
  if (!TIME_RE.test(d.endTime)) return null;
  const date = DATE_RE.test(d.endDate) ? d.endDate : d.startDate;
  return DATE_RE.test(date) ? istanbulIso(date, d.endTime) : null;
}

/** https ticket link: null = none, undefined = invalid (http:// is not accepted). */
function ticketLink(raw: string): string | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  if (/^http:\/\//i.test(t)) return undefined;
  const u = normalizeUrl(t);
  if (u === null) return null;
  return u && u.startsWith("https://") ? u : undefined;
}

/** Contact phone (E.164): null = none, undefined = invalid. */
function contactPhone(raw: string): string | null | undefined {
  if (!raw.trim()) return null;
  return normalizePhoneTR(raw, { allowLandline: true }) ?? undefined;
}

function StepTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary" aria-hidden>
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function ChoiceButton({ icon: Icon, title, text, active, onClick }: { icon: LucideIcon; title: string; text: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-foreground text-background" : "bg-card hover:bg-muted",
      )}
    >
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", active ? "bg-background/15" : "bg-brand-soft text-primary")}>
        <Icon className="size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className={cn("mt-0.5 line-clamp-2 block text-sm leading-snug", active ? "text-background/75" : "text-muted-foreground")}>{text}</span>
      </span>
    </button>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-[15px] break-words">{value}</div>
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="min-h-11 shrink-0 px-1 text-sm font-semibold text-primary outline-none focus-visible:underline">
          Değiştir
        </button>
      ) : null}
    </div>
  );
}

/** /etkinlik-olustur: the step-by-step event flow shared by normal users (admin review) and business owners (published). */
export function EventWizard({ categories, businesses, presetBusinessId, edit, profilePhone }: EventWizardProps) {
  const router = useRouter();
  const [uploading, setUploading] = React.useState(false);
  const [today] = React.useState(() => istanbulDateKey(new Date()));
  const draftKey = edit ? `etkinlik-duzenle-${edit.id}` : `etkinlik-yeni${presetBusinessId ? `-${presetBusinessId}` : ""}`;

  const initialData = React.useMemo<EventDraft>(
    () => edit?.draft ?? emptyEventDraft(presetBusinessId ?? (businesses.length ? null : SELF)),
    // Only the first render matters (the Wizard keeps its own state and draft).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // The organizer decides the button label; the Wizard restores a saved draft, so read it here as well.
  const [organizer, setOrganizer] = React.useState<string | null>(() => {
    const saved = typeof window !== "undefined" ? readWizardDraft<EventDraft>(draftKey) : null;
    return saved?.organizer ?? initialData.organizer;
  });

  const businessOf = (id: string | null) => (id && id !== SELF ? (businesses.find((b) => b.id === id) ?? null) : null);
  const isBusiness = edit ? !!edit.businessId : !!businessOf(organizer);

  const options: EventCategoryDef[] = categories.filter((c) => c.active || c.key === initialData.category);
  if (initialData.category && !options.some((c) => c.key === initialData.category)) {
    options.push({ key: initialData.category, label: initialData.category, icon: null, active: false });
  }

  const editNotice = !edit
    ? undefined
    : edit.businessId
      ? edit.adminHidden
        ? "Bu etkinlik yönetici tarafından yayından kaldırıldı. Kaydedince yeniden onaya gider."
        : undefined
      : edit.status === "published"
        ? "Değişikliklerin onaydan sonra yayına girer. Bu sırada etkinliğin listelerde görünmez."
        : "Kaydedince etkinliğin yeniden onaya gider.";

  const dateError = (d: EventDraft): string | null => {
    const s = startIso(d);
    if (!s) return "Başlangıç tarihini ve saatini seç.";
    const sMs = Date.parse(s);
    const changed = !edit || sMs !== Date.parse(edit.startsAt);
    if (changed && sMs < Date.now() - 3600_000) return "Başlangıç geçmişte olamaz.";
    if (changed && sMs > Date.now() + 400 * DAY) return "En fazla 400 gün sonrası için etkinlik ekleyebilirsin.";
    if (d.endDate && !d.endTime) return "Bitiş saatini de seç.";
    const e = endIso(d);
    if (e) {
      const eMs = Date.parse(e);
      if (eMs < sMs) return "Bitiş, başlangıçtan önce olamaz.";
      if (eMs > sMs + 60 * DAY) return "Etkinlik en fazla 60 gün sürebilir.";
    }
    return null;
  };

  const place = (d: EventDraft) => {
    const biz = businessOf(d.organizer);
    if (biz && d.place === "business") {
      return { venue_name: biz.name, address: biz.address, lat: biz.lat, lng: biz.lng, neighbourhood_id: biz.neighbourhoodId, venue_business_id: biz.id };
    }
    return {
      venue_name: d.venueName.trim() || null,
      address: d.address.trim() || null,
      lat: d.pin?.lat ?? null,
      lng: d.pin?.lng ?? null,
      neighbourhood_id: d.neighbourhoodId,
      venue_business_id: null,
    };
  };

  const previewItem = (d: EventDraft): EventItem => {
    const cat = options.find((c) => c.key === d.category);
    const p = place(d);
    const amount = d.paid ? parseAmount(d.price) : null;
    return {
      id: "onizleme",
      slug: "onizleme",
      title: d.title.trim() || "Etkinlik adı",
      description: d.description.trim() || null,
      category: d.category ?? "diger",
      category_label: cat?.label ?? "Etkinlik",
      category_icon: cat?.icon ?? null,
      starts_at: startIso(d) ?? new Date().toISOString(),
      ends_at: endIso(d),
      venue_name: p.venue_name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      is_free: !d.paid,
      price_try: amount ?? null,
      price_note: d.paid ? d.priceNote.trim() || null : null,
      ticket_url: ticketLink(d.ticketUrl) ?? null,
      phone: null,
      cover_url: d.cover?.url ?? null,
      neighbourhood_name: null,
      business: null,
      is_demo: false,
      organizer_name: null,
      has_contact_phone: false,
      venue_business_id: p.venue_business_id,
    };
  };

  const steps: WizardStep<EventDraft>[] = [
    {
      id: "kim",
      title: <StepTitle icon={Users}>Kim adına?</StepTitle>,
      help: "İşletmen adına eklediğin etkinlik hemen yayına girer. Kendi adına eklediğini ekibimiz onaylar.",
      isVisible: () => !edit && !presetBusinessId && businesses.length > 0,
      validate: (d) => (d.organizer ? null : "Kim adına eklediğini seç."),
      hideFooter: (d) => !d.organizer,
      render: (ctx) => (
        <div className="flex flex-col gap-3">
          {businesses.map((b) => (
            <ChoiceButton
              key={b.id}
              icon={Store}
              title={b.name}
              text="İşletmen adına, hemen yayında"
              active={ctx.data.organizer === b.id}
              onClick={() => {
                ctx.setData({ organizer: b.id, place: "business" });
                void ctx.next();
              }}
            />
          ))}
          <ChoiceButton
            icon={UserRound}
            title="Kendi adıma"
            text="Onaylandıktan sonra yayında"
            active={ctx.data.organizer === SELF}
            onClick={() => {
              ctx.setData({ organizer: SELF, place: "custom" });
              void ctx.next();
            }}
          />
        </div>
      ),
    },
    {
      id: "tur",
      title: <StepTitle icon={Tags}>Ne tür bir etkinlik?</StepTitle>,
      help: editNotice,
      validate: (d) => (d.category ? null : "Bir tür seç."),
      render: (ctx) => (
        <div className="flex flex-wrap gap-2">
          {options.map((c) => (
            <EventChip key={c.key} active={ctx.data.category === c.key} onClick={() => ctx.setData({ category: c.key })} icon={vocabIcon(c.icon, Ticket)}>
              {c.label}
            </EventChip>
          ))}
        </div>
      ),
    },
    {
      id: "baslik",
      title: <StepTitle icon={PenLine}>Başlık ve açıklama</StepTitle>,
      help: "Kısa ve net bir başlık yaz. Açıklamada programı, sanatçıları ya da kontenjanı anlatabilirsin.",
      validate: (d) => {
        const t = d.title.trim();
        if (t.length < TITLE_MIN) return `Başlık en az ${TITLE_MIN} karakter olmalı.`;
        if (t.length > TITLE_MAX) return `Başlık en fazla ${TITLE_MAX} karakter olabilir.`;
        if (d.description.length > DESC_MAX) return `Açıklama en fazla ${DESC_MAX} karakter olabilir.`;
        return null;
      },
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <Field label="Başlık" htmlFor="etk-baslik">
            <Input id="etk-baslik" value={ctx.data.title} maxLength={TITLE_MAX} placeholder="ör. Akustik Akşam" onChange={(e) => ctx.setData({ title: e.target.value })} />
            <CharCount value={ctx.data.title} max={TITLE_MAX} />
          </Field>
          <Field label="Açıklama" htmlFor="etk-aciklama" optional>
            <Textarea
              id="etk-aciklama"
              rows={6}
              value={ctx.data.description}
              maxLength={DESC_MAX}
              placeholder="Program, sanatçılar, kontenjan, yaş sınırı..."
              onChange={(e) => ctx.setData({ description: e.target.value })}
            />
            <CharCount value={ctx.data.description} max={DESC_MAX} />
          </Field>
        </div>
      ),
    },
    {
      id: "tarih",
      title: <StepTitle icon={CalendarClock}>Tarih ve saat</StepTitle>,
      help: "Bitiş isteğe bağlı. Birkaç gün süren etkinliklerde bitiş tarihini de seç.",
      validate: dateError,
      render: (ctx) => (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarih" htmlFor="etk-tarih">
            <Input id="etk-tarih" type="date" min={edit ? undefined : today} value={ctx.data.startDate} onChange={(e) => ctx.setData({ startDate: e.target.value })} />
          </Field>
          <Field label="Başlangıç" htmlFor="etk-saat">
            <Input id="etk-saat" type="time" value={ctx.data.startTime} onChange={(e) => ctx.setData({ startTime: e.target.value })} />
          </Field>
          <Field label="Bitiş tarihi" htmlFor="etk-bitis-tarih">
            <Input
              id="etk-bitis-tarih"
              type="date"
              min={ctx.data.startDate || today}
              value={ctx.data.endDate}
              onChange={(e) => ctx.setData({ endDate: e.target.value })}
            />
          </Field>
          <Field label="Bitiş saati" htmlFor="etk-bitis-saat">
            <Input id="etk-bitis-saat" type="time" value={ctx.data.endTime} onChange={(e) => ctx.setData({ endTime: e.target.value })} />
          </Field>
        </div>
      ),
    },
    {
      id: "yer",
      title: <StepTitle icon={MapPin}>Nerede?</StepTitle>,
      help: "Katılacakların kolayca bulabilmesi için yeri ve adresi yaz.",
      validate: (d) => {
        if (businessOf(d.organizer) && d.place === "business") return null;
        if (d.venueName.trim().length < 2) return "Yerin adını yaz.";
        if (d.address.trim().length < 5) return "Adresi yaz.";
        return null;
      },
      render: (ctx) => {
        const biz = businessOf(ctx.data.organizer);
        const custom = !biz || ctx.data.place === "custom";
        return (
          <div className="flex flex-col gap-5">
            {biz ? (
              <div className="flex flex-col gap-3">
                <ChoiceButton
                  icon={Store}
                  title="İşletmemde"
                  text={biz.address ? `${biz.name}, ${biz.address}` : biz.name}
                  active={ctx.data.place === "business"}
                  onClick={() => ctx.setData({ place: "business" })}
                />
                <ChoiceButton icon={MapPin} title="Başka bir yerde" text="Yerin adını ve adresini yaz" active={ctx.data.place === "custom"} onClick={() => ctx.setData({ place: "custom" })} />
              </div>
            ) : null}
            {custom ? (
              <>
                <Field label="Yerin adı" htmlFor="etk-yer">
                  <Input id="etk-yer" value={ctx.data.venueName} maxLength={VENUE_MAX} placeholder="ör. Gebze Kültür Merkezi" onChange={(e) => ctx.setData({ venueName: e.target.value })} />
                </Field>
                <Field label="Adres" htmlFor="etk-adres">
                  <Input id="etk-adres" value={ctx.data.address} maxLength={ADDRESS_MAX} placeholder="Mahalle, cadde, numara" onChange={(e) => ctx.setData({ address: e.target.value })} />
                </Field>
                <Field label="Haritada konum" optional hint="İğneyi koyarsan etkinlik sayfasında harita ve yol tarifi görünür.">
                  <LocationPicker
                    value={ctx.data.pin}
                    onChange={(pin) => ctx.setData(pin ? { pin } : { pin: null, neighbourhoodId: null })}
                    onNeighbourhood={(n) => ctx.setData({ neighbourhoodId: n.id })}
                  />
                </Field>
              </>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "kapak",
      title: <StepTitle icon={ImagePlus}>Kapak fotoğrafı</StepTitle>,
      help: "Afiş ya da mekandan bir fotoğraf ekle. İstersen bu adımı atlayabilirsin.",
      validate: () => (uploading ? "Fotoğraf yükleniyor, biraz bekle." : null),
      render: (ctx) => <EventCoverPicker value={ctx.data.cover} onChange={(cover) => ctx.setData({ cover })} onUploadingChange={setUploading} />,
    },
    {
      id: "ucret",
      title: <StepTitle icon={Banknote}>Ücret</StepTitle>,
      validate: (d) => {
        if (d.paid === null) return "Ücretsiz mi, ücretli mi? Birini seç.";
        if (d.paid) {
          const amount = parseAmount(d.price);
          if (amount === undefined || amount === null || amount <= 0) return "Ücreti sayı olarak yaz (ör. 350).";
          if (d.priceNote.length > NOTE_MAX) return `Ücret notu en fazla ${NOTE_MAX} karakter olabilir.`;
        }
        if (ticketLink(d.ticketUrl) === undefined) return "Bağlantı https:// ile başlayan geçerli bir adres olmalı.";
        return null;
      },
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ücret">
            <EventChip active={ctx.data.paid === false} onClick={() => ctx.setData({ paid: false })} icon={Gift} className="h-12 justify-center">
              Ücretsiz
            </EventChip>
            <EventChip active={ctx.data.paid === true} onClick={() => ctx.setData({ paid: true })} icon={Banknote} className="h-12 justify-center">
              Ücretli
            </EventChip>
          </div>
          {ctx.data.paid ? (
            <>
              <Field label="Ücret" htmlFor="etk-ucret">
                <div className="relative">
                  <Input
                    id="etk-ucret"
                    inputMode="decimal"
                    value={ctx.data.price}
                    placeholder="ör. 350"
                    className="pr-12 tabular-nums"
                    onChange={(e) => ctx.setData({ price: e.target.value.replace(/[^\d.,]/g, "") })}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-foreground">TL</span>
                </div>
              </Field>
              <Field label="Ücret notu" htmlFor="etk-not" optional>
                <Input id="etk-not" value={ctx.data.priceNote} maxLength={NOTE_MAX} placeholder="ör. Bir içecek dahil" onChange={(e) => ctx.setData({ priceNote: e.target.value })} />
              </Field>
            </>
          ) : null}
          {ctx.data.paid !== null ? (
            <Field label={ctx.data.paid ? "Bilet bağlantısı" : "Kayıt bağlantısı"} htmlFor="etk-bilet" optional hint="https:// ile başlayan bilet ya da kayıt sayfası.">
              <Input
                id="etk-bilet"
                inputMode="url"
                autoCapitalize="none"
                value={ctx.data.ticketUrl}
                placeholder="https://..."
                onChange={(e) => ctx.setData({ ticketUrl: e.target.value })}
              />
            </Field>
          ) : null}
        </div>
      ),
    },
    {
      id: "iletisim",
      title: <StepTitle icon={Phone}>İletişim</StepTitle>,
      help: isBusiness
        ? "Katılmak isteyenler işletmeni arayabilir."
        : "İsteğe bağlı. Numaran sayfada açıkça yazmaz; giriş yapan kullanıcılar \"Numarayı göster\" ile görebilir.",
      validate: (d) => (businessOf(d.organizer) || contactPhone(d.phone) !== undefined ? null : "Telefon numarası geçersiz. Ör. 0532 123 45 67"),
      render: (ctx) => {
        const biz = businessOf(ctx.data.organizer);
        if (biz) {
          return (
            <div className="flex items-center gap-4 rounded-3xl bg-card p-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
                <Phone className="size-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-semibold tabular-nums">{biz.phone ? formatPhoneTR(biz.phone) : "İşletmenin telefonu yok"}</p>
                <p className="text-sm text-muted-foreground">
                  {biz.phone ? "Etkinlik sayfasında işletmenin numarası görünür." : "İşletme bilgilerine telefon eklersen sayfada Ara butonu çıkar."}
                </p>
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-3">
            <Field label="Telefon" htmlFor="etk-tel" optional>
              <Input
                id="etk-tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={ctx.data.phone}
                placeholder="0532 123 45 67"
                onChange={(e) => ctx.setData({ phone: formatPhoneInputTR(e.target.value) })}
              />
            </Field>
            {profilePhone && !ctx.data.phone ? (
              <EventChip active={false} onClick={() => ctx.setData({ phone: formatPhoneInputTR(profilePhone) })} icon={Phone} className="self-start">
                Kendi numaramı kullan
              </EventChip>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "onizleme",
      title: <StepTitle icon={Eye}>Önizleme</StepTitle>,
      help: isBusiness && !edit?.adminHidden ? "Her şey doğruysa yayınla." : "Her şey doğruysa onaya gönder. Ekibimiz onaylayınca yayına girer ve bildirim alırsın.",
      render: (ctx) => {
        const d = ctx.data;
        const biz = businessOf(d.organizer);
        const item = previewItem(d);
        return (
          <div className="flex flex-col gap-4">
            <EventCard event={item} interactive={false} />
            <div className="flex flex-col gap-0.5 rounded-3xl bg-card p-1.5">
              <SummaryRow label="Düzenleyen" value={biz ? biz.name : "Sen"} />
              <SummaryRow label="Tarih" value={`${eventDateLabel(item.starts_at, item.ends_at)} · ${eventTimeLabel(item.starts_at, item.ends_at)}`} onEdit={() => ctx.goTo("tarih")} />
              <SummaryRow label="Yer" value={[item.venue_name, item.address].filter(Boolean).join(", ") || "-"} onEdit={() => ctx.goTo("yer")} />
              <SummaryRow label="Ücret" value={`${eventPriceLabel(item)}${item.price_note ? ` · ${item.price_note}` : ""}`} onEdit={() => ctx.goTo("ucret")} />
              {item.ticket_url ? <SummaryRow label="Bağlantı" value={item.ticket_url} onEdit={() => ctx.goTo("ucret")} /> : null}
              <SummaryRow
                label="İletişim"
                value={biz ? (biz.phone ? formatPhoneTR(biz.phone) : "Telefon yok") : d.phone ? `${d.phone} (giriş yapanlara gösterilir)` : "Telefon eklemedin"}
                onEdit={() => ctx.goTo("iletisim")}
              />
              {d.description.trim() ? (
                <SummaryRow label="Açıklama" value={<span className="line-clamp-4 whitespace-pre-line">{d.description.trim()}</span>} onEdit={() => ctx.goTo("baslik")} />
              ) : null}
            </div>
          </div>
        );
      },
    },
  ];

  const onComplete = async (d: EventDraft): Promise<string | void> => {
    const biz = businessOf(d.organizer);
    const starts = startIso(d);
    if (!starts) return "Başlangıç tarihini ve saatini seç.";
    if (!d.category) return "Bir tür seç.";
    const phone = biz ? null : contactPhone(d.phone);
    if (phone === undefined) return "Telefon numarası geçersiz.";
    const ticket = ticketLink(d.ticketUrl);
    if (ticket === undefined) return "Bağlantı https:// ile başlamalı.";
    const amount = d.paid ? parseAmount(d.price) : null;
    const values = {
      title: d.title.trim(),
      description: d.description.trim() || null,
      category: d.category,
      starts_at: starts,
      ends_at: endIso(d),
      ...place(d),
      is_free: !d.paid,
      price_try: amount ?? null,
      price_note: d.paid ? d.priceNote.trim() || null : null,
      ticket_url: ticket,
      cover_url: d.cover?.url ?? null,
      contact_phone: phone,
    };

    const supabase = createClient();
    // Status is decided by the database for updates (a user's edit goes back to review).
    const res = edit
      ? await supabase.from("events").update(values).eq("id", edit.id).select("id,slug,status").single()
      : await supabase
          .from("events")
          .insert({ ...values, business_id: biz?.id ?? null, status: biz ? "published" : "pending_review" })
          .select("id,slug,status")
          .single();
    if (res.error || !res.data) return eventErrorMessage(res.error);

    const slug = res.data.slug ?? "";
    const businessEvent = edit ? !!edit.businessId : !!biz;
    const back = businessEvent ? routes.business.events() : routes.profile.events();
    await refreshEventPages(slug).catch(() => undefined);
    if (res.data.status === "published") {
      notify.success(edit ? "Etkinlik güncellendi" : "Etkinliğin yayında");
      router.push(edit || !slug ? back : routes.events.detail(slug));
    } else if (res.data.status === "pending_review") {
      notify.success("Onaya gönderildi", "Onaylanınca bildirim alacaksın.");
      router.push(back);
    } else {
      notify.success("Kaydedildi");
      router.push(back);
    }
  };

  const completeLabel = edit ? (edit.businessId && !edit.adminHidden ? "Kaydet" : "Kaydet ve onaya gönder") : isBusiness ? "Yayınla" : "Onaya gönder";
  const exitHref = edit ? (edit.businessId ? routes.business.events() : routes.profile.events()) : presetBusinessId ? routes.business.events() : routes.events.root();

  return (
    <Wizard<EventDraft>
      steps={steps}
      initialData={initialData}
      draftKey={draftKey}
      onComplete={onComplete}
      onDataChange={(d) => setOrganizer(d.organizer)}
      completeLabel={completeLabel}
      title={edit ? "Etkinliği düzenle" : "Etkinlik oluştur"}
      exitHref={exitHref}
    />
  );
}

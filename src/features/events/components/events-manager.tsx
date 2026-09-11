"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarPlus, ChevronRight, ExternalLink, Ticket, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { istanbulDateKey } from "@/core/time";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormScreen } from "@/components/shared/form-screen";
import { refreshMyBusinessPages } from "@/features/business/actions";
import { CharCount, Field } from "@/features/business/components/editor/field";
import { BusinessImagePicker, type PickedImage } from "@/features/business/components/editor/image-picker";
import { amountInput, istanbulIso, istanbulParts, normalizeUrl, parseAmount } from "@/features/business/lib/form-utils";
import { DEFAULT_EVENT_CATEGORY, EVENT_CATEGORIES, eventCategoryInfo, vocabIcon, type EventCategory, type EventCategoryDef } from "@/features/business/lib/verticals";
import { eventPriceLabel, eventWhenShort } from "../format";
import { OWNER_EVENT_COLUMNS, toOwnerEvent, type OwnerEvent } from "../owner-event";
import { EVENT_STATUS_LABELS, EVENT_STATUS_TONES, eventErrorMessage, isEventPast, type EventStatus } from "../status";
import { EventChip } from "./chip";

export type EventOwnerBusiness = {
  /** null = city event created by an admin (no organizer business). */
  id: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  neighbourhoodId: string | null;
};

/** Statuses an admin can pick in the inline form (review states come from the review actions). */
const FORM_STATUSES: EventStatus[] = ["published", "draft", "cancelled"];

/**
 * Events list (upcoming / past) with add / edit / delete.
 * - Business panel: pass `wizardCreateHref`; adding and editing open the shared wizard (/etkinlik-olustur).
 * - Admin city events: without it an inline form is used (admins publish directly).
 * `categories`: event_categories (vocabularies.ts).
 */
export function EventsManager({
  business,
  initial,
  categories = EVENT_CATEGORIES,
  wizardCreateHref,
}: {
  business: EventOwnerBusiness;
  initial: OwnerEvent[];
  categories?: readonly EventCategoryDef[];
  wizardCreateHref?: string;
}) {
  const [events, setEvents] = React.useState<OwnerEvent[]>(initial);
  const [editing, setEditing] = React.useState<OwnerEvent | "new" | null>(null);
  const [now] = React.useState(() => Date.now());
  const done = () => void refreshMyBusinessPages().catch(() => undefined);

  const upcoming = events.filter((e) => !isEventPast(e, now)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => isEventPast(e, now));

  const remove = async (e: OwnerEvent) => {
    if (!window.confirm(`"${e.title}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    const { error } = await createClient().from("events").delete().eq("id", e.id);
    if (error) return notify.error("Etkinlik silinemedi.");
    setEvents((all) => all.filter((x) => x.id !== e.id));
    setEditing(null);
    notify.success("Etkinlik silindi");
    done();
  };

  const rowBody = (e: OwnerEvent) => (
    <>
      {e.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.cover_url} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Ticket className="size-6" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{e.title}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {eventWhenShort(e.starts_at, e.ends_at)} · {eventPriceLabel(e)}
        </span>
        <span className={cn("mt-1 inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold", EVENT_STATUS_TONES[e.status])}>{EVENT_STATUS_LABELS[e.status]}</span>
        {e.admin_hidden ? (
          <span className="mt-1 block text-xs leading-snug text-red-700 dark:text-red-300">
            Yönetici yayından kaldırdı{e.rejection_reason ? `: ${e.rejection_reason}` : ""}. Düzenleyip onaya gönderebilirsin.
          </span>
        ) : null}
      </span>
    </>
  );

  const row = (e: OwnerEvent) =>
    wizardCreateHref ? (
      <li key={e.id} className="flex items-center gap-1 rounded-3xl bg-card p-2.5">
        <Link
          href={routes.events.create({ duzenle: e.id })}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {rowBody(e)}
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`${e.title}: sil`} onClick={() => remove(e)}>
          <Trash2 />
        </Button>
      </li>
    ) : (
      <li key={e.id}>
        <button type="button" onClick={() => setEditing(e)} className="flex w-full items-center gap-3 rounded-3xl bg-card p-2.5 text-left hover:bg-muted/40">
          {rowBody(e)}
        </button>
      </li>
    );

  return (
    <div className="flex flex-col gap-5">
      {wizardCreateHref ? (
        <Button asChild size="lg">
          <Link href={wizardCreateHref}>
            <CalendarPlus /> Etkinlik ekle
          </Link>
        </Button>
      ) : (
        <Button size="lg" onClick={() => setEditing("new")}>
          <CalendarPlus /> Etkinlik ekle
        </Button>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold">Yaklaşan ({upcoming.length})</h2>
        {upcoming.length ? (
          <ul className="flex flex-col gap-2.5">{upcoming.map(row)}</ul>
        ) : (
          <p className="rounded-2xl bg-card px-4 py-4 text-sm text-muted-foreground">
            Yaklaşan etkinliğin yok. Konser, atölye, tadım günü gibi etkinliklerini ekle; Etkinlikler sayfasında ve işletme sayfanda görünsün.
          </p>
        )}
      </section>

      {past.length ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-muted-foreground">Geçmiş ({past.length})</h2>
          <ul className="flex flex-col gap-2.5 opacity-75">{past.map(row)}</ul>
        </section>
      ) : null}

      {editing && !wizardCreateHref ? (
        <EventForm
          key={editing === "new" ? "new" : editing.id}
          business={business}
          event={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDelete={remove}
          onSaved={(e) => {
            setEvents((all) => (all.some((x) => x.id === e.id) ? all.map((x) => (x.id === e.id ? e : x)) : [e, ...all]));
            setEditing(null);
            done();
          }}
        />
      ) : null}
    </div>
  );
}

/** Inline form (admin city events). */
function EventForm({
  business,
  event,
  categories,
  onClose,
  onSaved,
  onDelete,
}: {
  business: EventOwnerBusiness;
  event: OwnerEvent | null;
  categories: readonly EventCategoryDef[];
  onClose: () => void;
  onSaved: (e: OwnerEvent) => void;
  onDelete: (e: OwnerEvent) => void;
}) {
  // Active categories, plus the event's own one if the admin has since turned it off (or the list could not be read).
  const own = event && !categories.some((c) => c.key === event.category) ? [{ ...eventCategoryInfo(event.category, categories), icon: null, active: false }] : [];
  const options: EventCategoryDef[] = [...categories.filter((c) => c.active || c.key === event?.category), ...own];
  const statuses = event && !FORM_STATUSES.includes(event.status) ? [...FORM_STATUSES, event.status] : FORM_STATUSES;
  const start = event ? istanbulParts(event.starts_at) : null;
  const end = event?.ends_at ? istanbulParts(event.ends_at) : null;
  const [title, setTitle] = React.useState(event?.title ?? "");
  const [category, setCategory] = React.useState<EventCategory>(event?.category ?? options[0]?.key ?? DEFAULT_EVENT_CATEGORY);
  const [date, setDate] = React.useState(start?.date ?? "");
  const [time, setTime] = React.useState(start?.time ?? "20:00");
  const [endDate, setEndDate] = React.useState(end?.date ?? "");
  const [endTime, setEndTime] = React.useState(end?.time ?? "");
  const [venue, setVenue] = React.useState(event?.venue_name ?? business.name);
  const [address, setAddress] = React.useState(event?.address ?? business.address ?? "");
  const [isFree, setIsFree] = React.useState(event?.is_free ?? false);
  const [price, setPrice] = React.useState(amountInput(event?.price_try));
  const [priceNote, setPriceNote] = React.useState(event?.price_note ?? "");
  const [ticketUrl, setTicketUrl] = React.useState(event?.ticket_url ?? "");
  const [cover, setCover] = React.useState<PickedImage | null>(event?.cover_url ? { url: event.cover_url, path: null } : null);
  const [description, setDescription] = React.useState(event?.description ?? "");
  const [status, setStatus] = React.useState<EventStatus>(event?.status ?? "published");
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [today] = React.useState(() => istanbulDateKey(new Date()));

  const submit = async () => {
    const t = title.trim();
    if (t.length < 3 || t.length > 120) return notify.error("Etkinlik adı 3-120 karakter olmalı.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return notify.error("Tarih seç.");
    if (!/^\d{2}:\d{2}$/.test(time)) return notify.error("Başlangıç saatini seç.");
    const startsAt = istanbulIso(date, time);
    let endsAt: string | null = null;
    if (endTime) {
      endsAt = istanbulIso(endDate || date, endTime);
      if (new Date(endsAt) < new Date(startsAt)) return notify.error("Bitiş, başlangıçtan önce olamaz.");
    }
    const amount = isFree ? null : parseAmount(price);
    if (amount === undefined) return notify.error("Ücreti sayı olarak yaz (ör. 350).");
    const ticket = normalizeUrl(ticketUrl);
    if (ticket === undefined) return notify.error("Bilet bağlantısı geçersiz.");
    if (description.length > 3000) return notify.error("Açıklama en fazla 3000 karakter olabilir.");

    setSaving(true);
    const values = {
      title: t,
      category,
      starts_at: startsAt,
      ends_at: endsAt,
      venue_name: venue.trim() || null,
      address: address.trim() || null,
      is_free: isFree,
      price_try: amount,
      price_note: priceNote.trim() || null,
      ticket_url: ticket,
      cover_url: cover?.url ?? null,
      description: description.trim() || null,
      status,
    };
    const supabase = createClient();
    const { data, error } = event
      ? await supabase.from("events").update(values).eq("id", event.id).select(OWNER_EVENT_COLUMNS).single()
      : await supabase
          .from("events")
          .insert({ ...values, business_id: business.id, phone: business.phone, lat: business.lat, lng: business.lng, neighbourhood_id: business.neighbourhoodId })
          .select(OWNER_EVENT_COLUMNS)
          .single();
    setSaving(false);
    if (error || !data) return notify.error(eventErrorMessage(error));
    notify.success(event ? "Etkinlik güncellendi" : "Etkinlik eklendi");
    onSaved(toOwnerEvent(data as unknown as Parameters<typeof toOwnerEvent>[0]));
  };

  return (
    <FormScreen
      title={event ? "Etkinliği düzenle" : "Etkinlik ekle"}
      onClose={onClose}
      onSubmit={submit}
      busy={saving || uploading}
      footerExtra={
        event ? (
          <Button type="button" variant="destructive" size="lg" onClick={() => onDelete(event)} aria-label="Etkinliği sil">
            <Trash2 />
          </Button>
        ) : null
      }
    >
      <Field label="Etkinlik adı" htmlFor="etk-ad">
        <Input id="etk-ad" autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="ör. Akustik Akşam" />
      </Field>
      <Field label="Kategori">
        <div className="flex flex-wrap gap-2">
          {options.map((c) => (
            <EventChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)} icon={vocabIcon(c.icon, Ticket)}>
              {c.label}
            </EventChip>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tarih" htmlFor="etk-tarih">
          <Input id="etk-tarih" type="date" min={event ? undefined : today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Başlangıç" htmlFor="etk-saat">
          <Input id="etk-saat" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Bitiş tarihi" htmlFor="etk-bitis-tarih" optional>
          <Input id="etk-bitis-tarih" type="date" min={date || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Bitiş saati" htmlFor="etk-bitis-saat" optional>
          <Input id="etk-bitis-saat" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Yer" htmlFor="etk-yer">
        <Input id="etk-yer" value={venue} maxLength={120} onChange={(e) => setVenue(e.target.value)} />
      </Field>
      <Field label="Adres" htmlFor="etk-adres" optional>
        <Input id="etk-adres" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4">
        <span className="font-semibold">Ücretsiz etkinlik</span>
        <Switch checked={isFree} onCheckedChange={setIsFree} />
      </label>
      {!isFree ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ücret (TL)" htmlFor="etk-ucret" optional>
            <Input id="etk-ucret" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ör. 350" />
          </Field>
          <Field label="Ücret notu" htmlFor="etk-not" optional>
            <Input id="etk-not" value={priceNote} maxLength={80} onChange={(e) => setPriceNote(e.target.value)} placeholder="Bir içecek dahil" />
          </Field>
        </div>
      ) : null}
      <Field label="Bilet bağlantısı" htmlFor="etk-bilet" optional hint="Varsa bilet satış sayfası. Yoksa sayfada Ara butonu görünür.">
        <Input id="etk-bilet" inputMode="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} placeholder="https://..." />
      </Field>
      <BusinessImagePicker value={cover} onChange={setCover} onUploadingChange={setUploading} label="Kapak fotoğrafı" hint="Yatay bir afiş ya da fotoğraf." prefix="event-" />
      <Field label="Açıklama" htmlFor="etk-aciklama" optional>
        <Textarea id="etk-aciklama" rows={5} value={description} maxLength={3000} onChange={(e) => setDescription(e.target.value)} placeholder="Program, sanatçılar, kontenjan..." />
        <CharCount value={description} max={3000} />
      </Field>
      <Field label="Durum">
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <EventChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {EVENT_STATUS_LABELS[s]}
            </EventChip>
          ))}
        </div>
      </Field>
      {event && event.status === "published" ? (
        <Link href={routes.events.detail(event.slug)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          Etkinlik sayfasını gör <ExternalLink className="size-4" aria-hidden />
        </Link>
      ) : null}
    </FormScreen>
  );
}

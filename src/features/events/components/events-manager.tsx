"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarPlus, ExternalLink, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { istanbulDateKey } from "@/core/time";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FilterChip } from "@/components/shared/explore-header";
import { FormScreen } from "@/components/shared/form-screen";
import { refreshMyBusinessPages } from "@/features/business/actions";
import { CharCount, Field } from "@/features/business/components/editor/field";
import { BusinessImagePicker, type PickedImage } from "@/features/business/components/editor/image-picker";
import { amountInput, istanbulIso, istanbulParts, normalizeUrl, parseAmount } from "@/features/business/lib/form-utils";
import { EVENT_CATEGORIES, EVENT_CATEGORY_INFO, type EventCategory } from "@/features/business/lib/verticals";
import { eventPriceLabel, eventWhenShort } from "../format";
import type { EventStatus, OwnerEvent } from "../owner-queries";

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

const COLUMNS = "id,slug,title,description,category,starts_at,ends_at,venue_name,address,is_free,price_try,price_note,ticket_url,cover_url,status";

const STATUS_LABELS: Record<EventStatus, string> = { published: "Yayında", draft: "Taslak", cancelled: "İptal edildi" };
const STATUS_TONES: Record<EventStatus, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

type Raw = Omit<OwnerEvent, "category" | "price_try" | "status"> & { category: string; price_try: unknown; status: string };
function toEvent(r: Raw): OwnerEvent {
  const n = r.price_try === null || r.price_try === undefined ? null : Number(r.price_try);
  return {
    ...r,
    category: (EVENT_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as EventCategory) : "diger",
    price_try: n !== null && Number.isFinite(n) ? n : null,
    status: r.status === "draft" || r.status === "cancelled" ? r.status : "published",
  };
}

const isPast = (e: OwnerEvent, now: number) => new Date(e.ends_at ?? e.starts_at).getTime() < now;

/** Owner events: list (upcoming / past) and add / edit / delete. */
export function EventsManager({ business, initial }: { business: EventOwnerBusiness; initial: OwnerEvent[] }) {
  const [events, setEvents] = React.useState<OwnerEvent[]>(initial);
  const [editing, setEditing] = React.useState<OwnerEvent | "new" | null>(null);
  const [now] = React.useState(() => Date.now());
  const done = () => void refreshMyBusinessPages().catch(() => undefined);

  const upcoming = events.filter((e) => !isPast(e, now)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => isPast(e, now));

  const remove = async (e: OwnerEvent) => {
    if (!window.confirm(`"${e.title}" silinsin mi? İptal etmek istersen durumu "İptal edildi" yapabilirsin.`)) return;
    const { error } = await createClient().from("events").delete().eq("id", e.id);
    if (error) return toast.error("Etkinlik silinemedi.");
    setEvents((all) => all.filter((x) => x.id !== e.id));
    setEditing(null);
    toast.success("Etkinlik silindi");
    done();
  };

  const row = (e: OwnerEvent) => (
    <li key={e.id}>
      <button type="button" onClick={() => setEditing(e)} className="flex w-full items-center gap-3 rounded-3xl bg-card p-2.5 text-left shadow-soft ring-1 ring-foreground/[0.05] hover:bg-muted/40">
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
          <span className={cn("mt-1 inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold", STATUS_TONES[e.status])}>{STATUS_LABELS[e.status]}</span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <Button size="lg" onClick={() => setEditing("new")}>
        <CalendarPlus /> Etkinlik ekle
      </Button>

      <section>
        <h2 className="mb-2 text-base font-semibold">Yaklaşan ({upcoming.length})</h2>
        {upcoming.length ? (
          <ul className="flex flex-col gap-2.5">{upcoming.map(row)}</ul>
        ) : (
          <p className="rounded-2xl bg-muted/60 px-4 py-4 text-sm text-muted-foreground">
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

      {editing ? (
        <EventForm
          key={editing === "new" ? "new" : editing.id}
          business={business}
          event={editing === "new" ? null : editing}
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

function EventForm({
  business,
  event,
  onClose,
  onSaved,
  onDelete,
}: {
  business: EventOwnerBusiness;
  event: OwnerEvent | null;
  onClose: () => void;
  onSaved: (e: OwnerEvent) => void;
  onDelete: (e: OwnerEvent) => void;
}) {
  const start = event ? istanbulParts(event.starts_at) : null;
  const end = event?.ends_at ? istanbulParts(event.ends_at) : null;
  const [title, setTitle] = React.useState(event?.title ?? "");
  const [category, setCategory] = React.useState<EventCategory>(event?.category ?? "konser");
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
    if (t.length < 3 || t.length > 120) return toast.error("Etkinlik adı 3-120 karakter olmalı.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast.error("Tarih seç.");
    if (!/^\d{2}:\d{2}$/.test(time)) return toast.error("Başlangıç saatini seç.");
    const startsAt = istanbulIso(date, time);
    let endsAt: string | null = null;
    if (endTime) {
      endsAt = istanbulIso(endDate || date, endTime);
      if (new Date(endsAt) < new Date(startsAt)) return toast.error("Bitiş, başlangıçtan önce olamaz.");
    }
    const amount = isFree ? null : parseAmount(price);
    if (amount === undefined) return toast.error("Ücreti sayı olarak yaz (ör. 350).");
    const ticket = normalizeUrl(ticketUrl);
    if (ticket === undefined) return toast.error("Bilet bağlantısı geçersiz.");
    if (description.length > 3000) return toast.error("Açıklama en fazla 3000 karakter olabilir.");

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
      ? await supabase.from("events").update(values).eq("id", event.id).select(COLUMNS).single()
      : await supabase
          .from("events")
          .insert({ ...values, business_id: business.id, phone: business.phone, lat: business.lat, lng: business.lng, neighbourhood_id: business.neighbourhoodId })
          .select(COLUMNS)
          .single();
    setSaving(false);
    if (error || !data) return toast.error("Etkinlik kaydedilemedi, tekrar dene.");
    toast.success(event ? "Etkinlik güncellendi" : "Etkinlik eklendi");
    onSaved(toEvent(data as unknown as Raw));
  };

  return (
    <FormScreen
      title={event ? "Etkinliği düzenle" : "Etkinlik ekle"}
      onClose={onClose}
      onSubmit={submit}
      busy={saving || uploading}
      footerExtra={
        event ? (
          <Button type="button" variant="outline" size="lg" className="text-destructive" onClick={() => onDelete(event)} aria-label="Etkinliği sil">
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
          {EVENT_CATEGORIES.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)} icon={EVENT_CATEGORY_INFO[c].icon}>
              {EVENT_CATEGORY_INFO[c].label}
            </FilterChip>
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
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.05]">
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
        <Input id="etk-bilet" inputMode="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} placeholder="biletix.com/..." />
      </Field>
      <BusinessImagePicker value={cover} onChange={setCover} onUploadingChange={setUploading} label="Kapak fotoğrafı" hint="Yatay bir afiş ya da fotoğraf." prefix="event-" />
      <Field label="Açıklama" htmlFor="etk-aciklama" optional>
        <Textarea id="etk-aciklama" rows={5} value={description} maxLength={3000} onChange={(e) => setDescription(e.target.value)} placeholder="Program, sanatçılar, kontenjan..." />
        <CharCount value={description} max={3000} />
      </Field>
      <Field label="Durum">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABELS[s]}
            </FilterChip>
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

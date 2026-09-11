import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { draftFromEvent } from "@/features/events/draft";
import { getEditableEvent, getOwnEventContactPhone } from "@/features/events/owner-queries";
import { EventWizard, type EventWizardEdit, type WizardBusiness } from "@/features/events/components/event-wizard";

export const metadata: Metadata = { title: "Etkinlik oluştur", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** Etkinlik oluştur / düzenle (?duzenle=<id>), kendi adına ya da işletme adına (?isletme=<id>). Misafirler önce giriş yapar. */
export default async function CreateEventPage({ searchParams }: Props) {
  const sp = await searchParams;
  const duzenle = one(sp.duzenle);
  const isletme = one(sp.isletme);
  const { user, profile } = await requireProfile(routes.events.create({ duzenle, isletme }));

  const supabase = await createClient();
  const [vocab, { data: owned }] = await Promise.all([
    getVocabularies(),
    supabase.from("businesses").select("id,name,address,phone,lat,lng,district_id,status").eq("owner_id", user.id).order("created_at"),
  ]);
  const mine = owned ?? [];
  const toWizard = (b: (typeof mine)[number]): WizardBusiness => ({
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    lat: b.lat,
    lng: b.lng,
    districtId: b.district_id,
  });
  const businesses = mine.filter((b) => b.status === "approved").map(toWizard);

  let edit: EventWizardEdit | null = null;
  if (duzenle) {
    const ev = await getEditableEvent(duzenle).catch(() => null);
    if (!ev) notFound();
    // Only the creator of a user event, or the owner of the business of a business event.
    const ownBusiness = ev.business_id ? mine.find((b) => b.id === ev.business_id) : null;
    if (ev.business_id ? !ownBusiness : ev.created_by !== user.id) notFound();
    if (ownBusiness && !businesses.some((b) => b.id === ownBusiness.id)) businesses.push(toWizard(ownBusiness));
    const phone = !ev.business_id && ev.has_contact_phone ? await getOwnEventContactPhone(ev.id) : null;
    edit = {
      id: ev.id,
      slug: ev.slug,
      businessId: ev.business_id,
      status: ev.status,
      adminHidden: ev.admin_hidden,
      startsAt: ev.starts_at,
      draft: draftFromEvent(ev, phone),
    };
  }

  const preset = !edit && isletme && businesses.some((b) => b.id === isletme) ? isletme : null;

  return <EventWizard categories={vocab.eventCategories} businesses={businesses} presetBusinessId={preset} edit={edit} profilePhone={profile.phone ?? null} />;
}

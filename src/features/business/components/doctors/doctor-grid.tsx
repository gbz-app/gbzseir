"use client";

import * as React from "react";
import { Building2, CalendarDays, Clock, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoBadge } from "@/components/shared/badges";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { CallButton } from "@/components/shared/call-button";
import { PRIMARY_CTA } from "@/components/shared/detail-hero";
import { DOCTOR_CARD, DoctorAvatar, DoctorCardBody, branchInfo } from "./doctor-card";
import { doctorDisplayName, formatDoctorDays, type Doctor, type DoctorBranch } from "./doctor-meta";

export type DoctorGridProps = {
  doctors: Doctor[];
  /** public.doctor_branches (queries.ts); the built-in list when omitted. */
  branches?: readonly DoctorBranch[];
  businessId: string;
  businessName: string;
  /** The clinic's phone (null for sample firms and firms without a phone). Doctors have no phone of their own. */
  phone: string | null;
  isDemo?: boolean;
};

/** Firm page "Doktorlar": a two-column card grid; tapping a card opens a small sheet with the bio and the clinic's call button. */
export function DoctorGrid({ doctors, branches, businessId, businessName, phone, isDemo }: DoctorGridProps) {
  const [open, setOpen] = React.useState(false);
  // Kept while the sheet animates closed.
  const [doctor, setDoctor] = React.useState<Doctor | null>(null);

  const show = (d: Doctor) => {
    setDoctor(d);
    setOpen(true);
  };

  return (
    <>
      <ul className="grid grid-cols-2 gap-3">
        {doctors.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => show(d)} aria-haspopup="dialog" aria-label={`${doctorDisplayName(d)}: ayrıntılar`} className={DOCTOR_CARD}>
              <DoctorCardBody doctor={d} branches={branches} />
            </button>
          </li>
        ))}
      </ul>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={doctor ? doctorDisplayName(doctor) : "Doktor"}
        hideHeader
        footer={
          phone ? (
            <CallButton phone={phone} subjectType="business" subjectId={businessId} label="Randevu için ara" variant="default" size="lg" className={cn(PRIMARY_CTA, "w-full")} />
          ) : isDemo ? (
            <p className="flex h-14 items-center justify-center gap-2 rounded-full bg-muted px-4 text-[15px] font-semibold text-muted-foreground">
              <PhoneOff className="size-5 shrink-0" aria-hidden />
              Örnek kayıt - aranamaz
            </p>
          ) : null
        }
      >
        {doctor ? <DoctorDetail key={doctor.id} doctor={doctor} branches={branches} businessName={businessName} hasPhone={!!phone} /> : null}
      </BottomSheet>
    </>
  );
}

function DoctorDetail({ doctor, branches, businessName, hasPhone }: { doctor: Doctor; branches?: readonly DoctorBranch[]; businessName: string; hasPhone: boolean }) {
  const { label, Icon } = branchInfo(doctor.branch, branches);
  const days = formatDoctorDays(doctor.days);
  return (
    <div className="flex flex-col pt-2">
      <div className="flex flex-col items-center text-center">
        <DoctorAvatar doctor={doctor} className="size-24" textClassName="text-2xl" />
        <p className="mt-3 text-xl leading-tight font-semibold text-balance">{doctorDisplayName(doctor)}</p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <Icon className="size-4 shrink-0" aria-hidden />
          {label}
        </p>
        {doctor.is_demo ? <DemoBadge label="Örnek" className="mt-2" /> : null}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-2xl bg-card p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden /> Günler
          </dt>
          <dd className="mt-1 text-sm font-semibold">{days ?? "Kliniğe sor"}</dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-card p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden /> Saatler
          </dt>
          <dd className="mt-1 text-sm font-semibold break-words">{doctor.hours_note ?? "Kliniğe sor"}</dd>
        </div>
      </dl>

      {doctor.bio ? <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{doctor.bio}</p> : null}

      <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
        <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {businessName}
          {hasPhone ? " numarası aranır. Randevu ve bilgi için klinik sana yardımcı olur." : "."}
        </span>
      </p>
    </div>
  );
}

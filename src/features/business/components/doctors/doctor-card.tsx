import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoBadge } from "@/components/shared/badges";
import { branchIcon, doctorDisplayName, doctorInitials, findBranch, formatDoctorDays, type Doctor, type DoctorBranch } from "./doctor-meta";

/** Round photo, or the initials on a soft purple circle. */
export function DoctorAvatar({ doctor, className, textClassName }: { doctor: Pick<Doctor, "name" | "photo_url">; className?: string; textClassName?: string }) {
  if (doctor.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={doctor.photo_url} alt="" loading="lazy" decoding="async" className={cn("shrink-0 rounded-full bg-muted object-cover", className)} />;
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-primary", className, textClassName)} aria-hidden>
      {doctorInitials(doctor.name)}
    </span>
  );
}

/** Branch of a doctor: its label and icon (the built-in list when the key is unknown). */
export function branchInfo(key: string, branches?: readonly DoctorBranch[]) {
  const b = findBranch(key, branches);
  return { label: b?.label ?? "Diğer", Icon: branchIcon(b?.icon) };
}

/**
 * Inside of a half-width doctor card (two per row at 390 px): photo circle or initials, "Uzm. Dr. Ad Soyad", branch,
 * working days and, on the Keşfet list, the clinic. The caller supplies the white card element (button or link).
 */
export function DoctorCardBody({ doctor, branches, clinicName }: { doctor: Doctor; branches?: readonly DoctorBranch[]; clinicName?: string }) {
  const { label, Icon } = branchInfo(doctor.branch, branches);
  const days = formatDoctorDays(doctor.days);
  return (
    <>
      <span className="relative">
        <DoctorAvatar doctor={doctor} className="size-20" textClassName="text-xl" />
        {doctor.is_demo ? <DemoBadge label="Örnek" className="absolute -bottom-1.5 left-1/2 h-5 -translate-x-1/2 px-1.5 text-[11px]" /> : null}
      </span>
      <span className="mt-3 line-clamp-2 text-[15px] leading-snug font-semibold">{doctorDisplayName(doctor)}</span>
      <span className="mt-1 flex max-w-full items-start justify-center gap-1 text-[13px] leading-snug font-medium text-primary">
        <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="line-clamp-2">{label}</span>
      </span>
      {days ? <span className="mt-1 text-xs text-muted-foreground">{days}</span> : null}
      {clinicName ? (
        <span className="mt-auto flex max-w-full items-center gap-1 pt-2.5 text-xs font-medium text-foreground/80">
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{clinicName}</span>
        </span>
      ) : null}
    </>
  );
}

/** White card surface of the doctor grid (no border, no shadow). */
export const DOCTOR_CARD = cn(
  "flex h-full w-full flex-col items-center rounded-3xl bg-card px-3 pt-4 pb-3.5 text-center transition-transform outline-none active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50",
);

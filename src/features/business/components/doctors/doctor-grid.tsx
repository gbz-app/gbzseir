import { routes } from "@/core/routes";
import { DoctorCard } from "./doctor-card";
import { formatDoctorDays, type Doctor, type DoctorBranch } from "./doctor-meta";

export type DoctorGridProps = {
  doctors: Doctor[];
  /** public.doctor_branches (queries.ts); the built-in list when omitted. */
  branches?: readonly DoctorBranch[];
  /**
   * Still passed by the firm page but no longer used here: each card opens the doctor's own page (/doktor/<slug>),
   * which carries the clinic's call button (hidden for sample clinics).
   */
  businessId?: string;
  businessName?: string;
  phone?: string | null;
  isDemo?: boolean;
};

/**
 * Firm page "Doktorlar": two-column cards, each opening the doctor's profile page. The clinic is the page itself, so
 * the card's bottom line shows the working days instead. Server-safe.
 */
export function DoctorGrid({ doctors, branches }: DoctorGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {doctors.map((d) => (
        <li key={d.id}>
          <DoctorCard doctor={d} branches={branches} href={d.slug ? routes.doctors.detail(d.slug) : null} meta={formatDoctorDays(d.days)} />
        </li>
      ))}
    </ul>
  );
}

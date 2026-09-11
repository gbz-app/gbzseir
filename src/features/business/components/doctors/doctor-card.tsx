import Link from "next/link";
import { cn } from "@/lib/utils";
import { branchIcon, doctorInitials, findBranch, type Doctor, type DoctorBranch } from "./doctor-meta";

/** Round photo, or the initials on a soft purple circle. `priority`: the large photo of the profile page (loaded first). */
export function DoctorAvatar({
  doctor,
  className,
  textClassName,
  priority,
}: {
  doctor: Pick<Doctor, "name" | "photo_url">;
  className?: string;
  textClassName?: string;
  priority?: boolean;
}) {
  if (doctor.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={doctor.photo_url}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={cn("shrink-0 rounded-full bg-muted object-cover", className)}
      />
    );
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

/** White card surface (no border, no shadow). */
const CARD = "flex h-full w-full flex-col items-start rounded-3xl bg-card p-4 text-left";
const CARD_LINK = cn(CARD, "outline-none transition-transform hover:bg-muted/40 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50");

/**
 * Half-width doctor card (two per row at 390 px): photo or initials, title, name, branch and one quiet bottom line
 * (`meta`: the clinic on Keşfet, the working days on the clinic's own page). Opens the doctor's profile page; a row
 * without a profile slug renders the same card without a link.
 */
export function DoctorCard({
  doctor,
  href,
  branches,
  meta,
}: {
  doctor: Doctor;
  href: string | null;
  branches?: readonly DoctorBranch[];
  meta?: string | null;
}) {
  const { label, Icon } = branchInfo(doctor.branch, branches);
  const body = (
    <>
      <DoctorAvatar doctor={doctor} className="size-16" textClassName="text-lg" />
      {/* Title on its own quiet line (kept as a spacer for the "Diğer" title so names line up across a row). */}
      <span className="mt-4 block min-h-4 text-xs leading-4 font-medium text-muted-foreground">{doctor.title === "Diğer" ? null : doctor.title}</span>
      <span className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-semibold">{doctor.name}</span>
      <span className="mt-1.5 flex max-w-full items-start gap-1.5 text-[13px] leading-snug font-medium text-primary">
        <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="line-clamp-2">{label}</span>
      </span>
      {meta ? <span className="mt-auto block w-full truncate pt-3 text-xs text-muted-foreground">{meta}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={CARD_LINK}>
      {body}
    </Link>
  ) : (
    <div className={CARD}>{body}</div>
  );
}

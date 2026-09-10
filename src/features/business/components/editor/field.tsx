import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** Label + control + optional hint, used by the application wizard and the edit form. */
export function Field({
  label,
  htmlFor,
  optional,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (isteğe bağlı)</span> : null}
      </Label>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** "12/80" counter under text inputs. */
export function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums" aria-hidden>
      {value.length}/{max}
    </p>
  );
}

import { cn } from "@/lib/utils";
import { formatPrice, formatPriceRange } from "@/core/format";

export type PriceTextProps = {
  /** Amount in TRY (number or numeric string). */
  amount?: number | string | null;
  /** Range mode (salary): min/max instead of amount. */
  min?: number | null;
  max?: number | null;
  /** Text when no price ("Fiyat belirtilmemiş"). */
  fallback?: string;
  /** Appended after the price, e.g. "/ay". */
  suffix?: string;
  className?: string;
};

/** tr-TR price: "1.250 TL", "25.000 - 30.000 TL". Server-safe. */
export function PriceText({ amount, min, max, fallback, suffix, className }: PriceTextProps) {
  const isRange = min !== undefined || max !== undefined;
  const text = isRange ? formatPriceRange(min, max, { fallback }) : formatPrice(amount, { fallback });
  const empty = isRange ? min == null && max == null : amount === null || amount === undefined || amount === "";
  return (
    <span className={cn("tabular-nums", empty ? "font-medium text-muted-foreground" : "font-bold", className)}>
      {text}
      {!empty && suffix ? <span className="font-medium text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}

/** Formatting helpers used by the admin request list (thin re-exports of src/core so the list stays consistent with the app). */
import { telHref } from "@/core/phone";

export { formatDate, formatDateTime, formatPhoneTR, formatPrice } from "@/core/format";

/** tel: link for a phone number, or undefined when there is no usable number. */
export function telHrefSafe(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  try {
    return telHref(phone);
  } catch {
    return undefined;
  }
}

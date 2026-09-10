/** Small pure helpers of the services module (client + server safe). */

/** service_requests.public_code: 8 chars from [A-Z2-9] (no 0/O/1/I). */
export const REQUEST_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeRequestCode(input: string | string[] | null | undefined): string | null {
  const v = (Array.isArray(input) ? input[0] : input)?.trim().toUpperCase() ?? "";
  return REQUEST_CODE_RE.test(v) ? v : null;
}

type RpcError = { message?: string; hint?: string | null; code?: string | null } | null | undefined;

/**
 * User-facing text for a PostgREST/RPC error. Our RPCs raise Turkish messages with a machine `hint`
 * (and SQLSTATE P0001); everything else (network, permission) gets a generic Turkish text.
 */
export function rpcErrorMessage(error: RpcError, fallback = "İşlem tamamlanamadı. Lütfen tekrar dene."): string {
  if (!error) return fallback;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "İnternet bağlantın yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.";
  if ((error.hint || error.code === "P0001") && error.message) return error.message;
  if (!error.code || /fetch|network|timeout|abort/i.test(error.message ?? "")) return "Bağlantı sorunu oluştu. Lütfen tekrar dene.";
  return fallback;
}

/** "Hacıhalil" -> "Hacıhalil Mah." (neighbourhood names are stored short). */
export function neighbourhoodLabel(name: string | null | undefined): string {
  if (!name) return "Gebze";
  return /\bmah/i.test(name) ? name : `${name} Mah.`;
}

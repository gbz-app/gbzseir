/**
 * Result shape of every admin Server Action (serialisable; safe to import from client components).
 * warning: saved, but something around it did not go through (set by withAdmin; shown as a warning toast).
 */
export type ActionResult<T = null> = { ok: true; data: T; message?: string; warning?: string } | { ok: false; error: string; hint?: string };

export const ok = <T>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string, hint?: string): { ok: false; error: string; hint?: string } => ({ ok: false, error, hint });

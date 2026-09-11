/** Service catalog rows (hizmet firmaları). Pure TS: shared by the server queries and the owner editor. */
export type BusinessService = {
  id: string;
  name: string;
  description: string | null;
  price_try: number | null;
  price_max_try: number | null;
  price_unit: string;
  duration_text: string | null;
  photo_url: string | null;
  is_active: boolean;
  sort: number;
};

export type RawBusinessService = Omit<BusinessService, "price_try" | "price_max_try"> & { price_try: unknown; price_max_try: unknown };

export const SERVICE_COLUMNS = "id,name,description,price_try,price_max_try,price_unit,duration_text,photo_url,is_active,sort";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function toBusinessService(r: RawBusinessService): BusinessService {
  return { ...r, price_try: num(r.price_try), price_max_try: num(r.price_max_try) };
}

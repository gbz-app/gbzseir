// Seed DEMO finance entries (is_demo = true) for the last three months so the Muhasebe screen can be explored.
// Idempotent (deterministic ids). Removed by scripts/db/remove-demo.mjs.
// Usage: node --env-file=.env.local scripts/db/seed-finance.mjs
import { createHash } from "node:crypto";
import { sql, lit } from "./lib.mjs";

function demoId(key) {
  const h = createHash("md5").update(`gebzem-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// [key, kind, category, amount, vat, daysAgo, description, counterparty, businessSlug, payment]
const ENTRIES = [
  ["f1", "income", "Reklam geliri", 4500, 20, 3, "Ana sayfa vitrini (1 hafta)", "Kule Kahve", "kule-kahve", "havale"],
  ["f2", "income", "Öne çıkarma", 1800, 20, 9, "Keşfet listesinde öne çıkarma", "Kıyı Balık Evi", "kiyi-balik-evi", "kart"],
  ["f3", "income", "Etkinlik tanıtımı", 1200, 20, 14, "Teras Caz Gecesi tanıtımı", "Mor Salkım Otel", "mor-salkim-otel", "havale"],
  ["f4", "income", "Sponsorluk", 15000, 20, 40, "Sahil koşusu sponsorluğu", "Örnek sponsor", null, "havale"],
  ["f5", "income", "Reklam geliri", 6000, 20, 70, "Kategori sponsorluğu (Otel)", "Eskihisar Kıyı Butik Otel", "eskihisar-kiyi-butik-otel", "havale"],
  ["g1", "expense", "Sunucu ve altyapı", 2150, 20, 2, "Vercel + Supabase aylık", "Bulut sağlayıcı", null, "kart"],
  ["g2", "expense", "SMS ve bildirim", 890, 20, 6, "Doğrulama SMS paketi", "SMS sağlayıcı", null, "kart"],
  ["g3", "expense", "Pazarlama", 3500, 20, 12, "Sosyal medya reklamı", "Reklam platformu", null, "kart"],
  ["g4", "expense", "Yazılım ve lisans", 750, 20, 20, "Tasarım aracı aboneliği", "Yazılım firması", null, "kart"],
  ["g5", "expense", "Sunucu ve altyapı", 2100, 20, 33, "Vercel + Supabase aylık", "Bulut sağlayıcı", null, "kart"],
  ["g6", "expense", "Personel", 22000, 0, 35, "Serbest çalışan içerik editörü", "Editör", null, "havale"],
  ["g7", "expense", "Sunucu ve altyapı", 2050, 20, 63, "Vercel + Supabase aylık", "Bulut sağlayıcı", null, "kart"],
  ["g8", "expense", "Vergi ve harçlar", 1400, 0, 66, "Muhasebe ve harç", "Mali müşavir", null, "havale"],
];

for (const [key, kind, cat, amount, vat, daysAgo, desc, cp, slug, pay] of ENTRIES) {
  await sql(`insert into public.finance_entries (id, kind, category_id, amount, vat_rate, occurred_on, description, counterparty, business_id, payment_method, is_demo, created_by)
    values (${lit(demoId(`finance-${key}`))}, ${lit(kind)},
      (select id from public.finance_categories where kind = ${lit(kind)} and name = ${lit(cat)}),
      ${amount}, ${vat}, (now() at time zone 'Europe/Istanbul')::date - ${daysAgo}, ${lit(desc)}, ${lit(cp)},
      ${slug ? `(select id from public.businesses where slug = ${lit(slug)})` : "null"}, ${lit(pay)}, true,
      (select id from public.profiles where role = 'admin' order by created_at limit 1))
    on conflict (id) do update set amount = excluded.amount, vat_rate = excluded.vat_rate, occurred_on = excluded.occurred_on,
      description = excluded.description, counterparty = excluded.counterparty, category_id = excluded.category_id, is_demo = true`);
}
const [s] = await sql(`select count(*)::int as n, sum(amount) filter (where kind = 'income') as income, sum(amount) filter (where kind = 'expense') as expense from public.finance_entries where is_demo`);
console.log("demo finance entries:", JSON.stringify(s));

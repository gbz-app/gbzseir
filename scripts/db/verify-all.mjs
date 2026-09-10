// Functional + RLS verification against the live project, using the ANON key and real user sessions
// (demo OTP). Creates test data and removes it again (test requests, throwaway user, contact events).
// Usage (after dot-sourcing secrets.ps1):
//   $env:ADMIN_OTP_FILE='...\admin-otp.txt'; node --env-file=.env.local scripts/db/verify-all.mjs
import { readFileSync, existsSync } from "node:fs";
import { otpLogin } from "./verify-auth.mjs";
import { sql, lit, SUPABASE_URL as URL, ANON_KEY as ANON, adminFetch } from "./lib.mjs";

const results = [];
let failed = 0;
function check(name, cond, info = "") {
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? `  -- ${info}` : ""}`);
  if (!cond) failed++;
}
async function rest(path, { method = "GET", body, token, headers = {} } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, "Content-Type": "application/json", Prefer: "return=representation", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}
const rpc = (fn, args, token) => rest(`rpc/${fn}`, { method: "POST", body: args ?? {}, token });
const short = (v) => JSON.stringify(v)?.slice(0, 220);

const t0 = (await sql(`select now() as t`))[0].t;
const [ref] = await sql(`select
  (select id from public.service_categories where slug = 'ev-temizligi') as ev_id,
  (select id from public.neighbourhoods where slug = 'hacihalil') as hh_id,
  (select id from public.businesses where slug = 'parlak-temizlik') as parlak_id,
  (select id from public.businesses where slug = 'kombi-servis-41') as kombi_id,
  (select id from public.listing_categories where slug = 'telefon') as tel_cat,
  (select id from public.listing_categories where slug = 'emlak') as emlak_cat,
  (select id from public.listing_categories where slug = 'is-diger') as job_cat`);
await sql(`update public.service_categories set auto_dispatch = true where slug = 'ev-temizligi'`);
const C = { lat: 40.8027, lng: 29.4307 };
const testRequestIds = [];
let tmp;

try {
  // ------------------------------------------------------------------ (b) nearby / duty
  let r = await rpc("nearby_pois", { p_kind: "pharmacy", p_lat: C.lat, p_lng: C.lng, p_radius_m: 3000, p_limit: 5 });
  check("nearby_pois pharmacy near centre", r.status === 200 && r.body.length > 0 && r.body[0].distance_m != null, `${r.body?.length} rows, nearest: ${r.body?.[0]?.name} ${r.body?.[0]?.distance_m} m`);
  r = await rpc("nearby_pois", { p_kind: "mosque", p_lat: C.lat, p_lng: C.lng, p_radius_m: 2000, p_limit: 5 });
  check("nearby_pois mosque", r.status === 200 && r.body.length > 0, `${r.body?.[0]?.name} ${r.body?.[0]?.distance_m} m`);
  r = await rpc("nearby_pois", { p_kind: "bus_stop", p_lat: C.lat, p_lng: C.lng, p_radius_m: 3000, p_limit: 5 });
  check("nearby_pois bus_stop", r.status === 200 && r.body.length > 0, `${r.body?.[0]?.name} lines=${short(r.body?.[0]?.details?.lines)}`);
  r = await rpc("nearby_pois", { p_kind: "place" });
  check("nearby_pois place without coords (by name)", r.status === 200 && r.body.length > 0 && r.body[0].distance_m === null, `${r.body?.length} places`);
  r = await rpc("duty_pharmacies_now", { p_lat: C.lat, p_lng: C.lng });
  const now = Date.now();
  check("duty_pharmacies_now returns current windows only",
    r.status === 200 && r.body.length > 0 && r.body.every((d) => Date.parse(d.duty_start) <= now && now < Date.parse(d.duty_end)),
    `${r.body?.length} on duty; first ${r.body?.[0]?.name} ${r.body?.[0]?.duty_start} -> ${r.body?.[0]?.duty_end} (${r.body?.[0]?.source})`);
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  r = await rpc("duty_pharmacies_for_day", { p_date: tomorrow });
  check("duty_pharmacies_for_day(tomorrow)", r.status === 200 && r.body.length > 0, `${r.body?.length} rows`);
  r = await rpc("neighbourhood_for_point", { p_lat: C.lat, p_lng: C.lng });
  check("neighbourhood_for_point(centre)", r.status === 200 && r.body.length === 1, short(r.body));

  // ------------------------------------------------------------------ search
  r = await rpc("global_search", { p_q: "iphone" });
  check("global_search 'iphone' -> listings", r.body?.listings?.length >= 1, `${r.body?.listings?.length}`);
  r = await rpc("global_search", { p_q: "KOMBİ" });
  check("global_search 'KOMBİ' (İ) -> services+businesses", r.body?.services?.length >= 1 && r.body?.businesses?.length >= 1, `${r.body?.services?.[0]?.name} / ${r.body?.businesses?.[0]?.name}`);
  r = await rpc("global_search", { p_q: "coban mustafa" });
  check("global_search 'coban mustafa' -> pois", r.body?.pois?.some((p) => /Çoban/.test(p.name)), short(r.body?.pois?.map((p) => p.name)));
  r = await rpc("search_listings", { p_type: "classified", p_q: "bisiklet" });
  check("search_listings classified 'bisiklet'", r.status === 200 && r.body.length === 1, `${r.body?.length}`);
  r = await rest("rpc/search_listings?select=id,title,listing_media(url),neighbourhoods(name)&limit=3", { method: "POST", body: { p_type: "job", p_work_type: "vardiyali" } });
  check("search_listings job + embedding", r.status === 200 && r.body.length >= 1 && r.body[0].neighbourhoods !== undefined, short(r.body?.[0]));

  // ------------------------------------------------------------------ (c) anon RLS
  for (const [name, q] of [
    ["demo_otp", "demo_otp?select=*"],
    ["profiles", "profiles?select=id,phone"],
    ["service_requests", "service_requests?select=id"],
    ["leads", "leads?select=id"],
    ["pending listings", "listings?select=id&status=eq.pending_review"],
    ["contact_events", "contact_events?select=id"],
    ["notifications", "notifications?select=id"],
    ["business_documents", "business_documents?select=id"],
    ["my_leads", "my_leads?select=id"],
  ]) {
    const x = await rest(q);
    check(`anon cannot read ${name}`, x.status >= 400 || (Array.isArray(x.body) && x.body.length === 0), `status ${x.status}`);
  }
  const pp = await rest("public_profiles?select=*&limit=3");
  check("public_profiles readable, no phone column", pp.status === 200 && pp.body.length > 0 && !("phone" in pp.body[0]), short(pp.body?.[0]));
  const act = await rest("listings?select=id&status=eq.active");
  check("anon reads active listings", act.status === 200 && act.body.length >= 20, `${act.body?.length}`);
  const bz = await rest("businesses?select=id,status,phone");
  check("anon sees only approved businesses", bz.status === 200 && bz.body.length >= 8 && bz.body.every((b) => b.status === "approved"), `${bz.body?.length}`);

  // ------------------------------------------------------------------ sessions
  const ayse = await otpLogin("+905550000020");
  const mehmet = await otpLogin("+905550000021");
  const parlak = await otpLogin("+905550000010");
  const kombi = await otpLogin("+905550000012");
  tmp = await otpLogin("+905551112244");
  check("demo OTP logins (4 demo + 1 new user)", !!(ayse && mehmet && parlak && kombi && tmp));

  const own = await rest("profiles?select=id,phone,role", { token: ayse.access_token });
  check("user sees only own profile row", own.body?.length === 1 && own.body[0].id === ayse.user.id, short(own.body));
  const [al] = await sql(`select id, title from public.listings where owner_id = ${lit(ayse.user.id)} and is_demo order by created_at limit 1`);
  const up = await rest(`listings?id=eq.${al.id}`, { method: "PATCH", body: { title: "Değiştirildi" }, token: mehmet.access_token });
  const [alAfter] = await sql(`select title from public.listings where id = ${lit(al.id)}`);
  check("user cannot update another user's listing", alAfter.title === al.title, `status ${up.status}, rows ${Array.isArray(up.body) ? up.body.length : "-"}`);
  const ru = await rest(`profiles?id=eq.${mehmet.user.id}`, { method: "PATCH", body: { role: "admin", status: "active", full_name: "Mehmet Demir" }, token: mehmet.access_token });
  const [ra] = await sql(`select role from public.profiles where id = ${lit(mehmet.user.id)}`);
  check("user cannot change own role (safe columns only)", ra.role === "user", `patch status ${ru.status}`);
  const adm = await rpc("admin_review_listing", { p_listing_id: al.id, p_approve: false, p_reason: "x" }, mehmet.access_token);
  check("non-admin cannot call admin RPC", adm.status >= 400, `status ${adm.status}`);

  // ------------------------------------------------------------------ (e) listings moderation
  const base = { type: "classified", category_id: ref.tel_cat, neighbourhood_id: ref.hh_id, price_try: 1000 };
  const l1 = await rest("listings", { method: "POST", token: tmp.access_token, body: { ...base, title: "Test telefon ilanı", description: "Temiz kullanılmış telefon." } });
  check("new user's listing -> pending_review", l1.status === 201 && l1.body?.[0]?.status === "pending_review", `status ${l1.status} ${short(l1.body?.[0]?.status ?? l1.body)}`);
  const l2 = await rest("listings", { method: "POST", token: tmp.access_token, body: { ...base, title: "Acil satılık telefon", description: "Kapora gönderin, 0532 123 45 67 numarasından ulaşın. www.ornek.com" } });
  const f2 = l2.body?.[0]?.flags || [];
  check("flagged text -> flags set + pending_review", l2.status === 201 && f2.includes("odeme") && f2.includes("telefon") && f2.includes("url") && l2.body[0].status === "pending_review", short(f2));
  const l3 = await rest("listings", { method: "POST", token: tmp.access_token, body: { ...base, category_id: ref.emlak_cat, title: "Satılık daire" } });
  check("banned category rejected", l3.status >= 400 && /kategori/i.test(JSON.stringify(l3.body)), `status ${l3.status}`);
  const l4 = await rest("listings", { method: "POST", token: tmp.access_token, body: { type: "job", category_id: ref.job_cat, title: "Eleman aranıyor" } });
  check("job listing without approved business rejected", l4.status >= 400 && /işletme/i.test(JSON.stringify(l4.body)), `status ${l4.status}`);
  const l5 = await rest("listings", { method: "POST", body: { ...base, title: "Anonim ilan" } });
  check("anon cannot insert listing", l5.status >= 400, `status ${l5.status}`);
  if (l1.body?.[0]?.id) {
    const self = await rest(`listings?id=eq.${l1.body[0].id}`, { method: "PATCH", body: { status: "active" }, token: tmp.access_token });
    check("owner cannot self-approve (pending -> active)", self.status >= 400, `status ${self.status}`);
    const anonSee = await rest(`listings?select=id&id=eq.${l1.body[0].id}`);
    check("anon cannot see pending listing", anonSee.body?.length === 0);
  }

  // admin
  const otpFile = process.env.ADMIN_OTP_FILE;
  if (otpFile && existsSync(otpFile) && l1.body?.[0]?.id) {
    const admin = await otpLogin("+905550000001", readFileSync(otpFile, "utf8").trim());
    const ap = await rpc("admin_review_listing", { p_listing_id: l1.body[0].id, p_approve: true }, admin.access_token);
    check("admin_review_listing approve", ap.body?.ok === true && ap.body.status === "active", short(ap.body));
    const nt = await rest("notifications?select=title,link&type=eq.listing_approved", { token: tmp.access_token });
    check("owner notified on approval", nt.body?.length >= 1, short(nt.body?.[0]));
    const allReq = await rest("service_requests?select=id&limit=1", { token: admin.access_token });
    check("admin can read service_requests", allReq.status === 200);

    // business application flow (throwaway user)
    const ap2 = await rpc("apply_business", {
      p_name: "Test İşletmesi", p_kinds: ["service", "employer"], p_phone: "0532 000 00 00", p_category_label: "Temizlik",
      p_neighbourhood_id: ref.hh_id, p_service_category_ids: [ref.ev_id], p_service_area_ids: [ref.hh_id],
    }, tmp.access_token);
    check("apply_business -> pending", ap2.body?.ok === true && ap2.body.status === "pending", short(ap2.body));
    const bid = ap2.body?.business_id;
    await rest(`businesses?id=eq.${bid}`, { method: "PATCH", body: { status: "approved", verification_level: 3, description: "Açıklama" }, token: tmp.access_token });
    const [bs] = await sql(`select status, verification_level, description, phone from public.businesses where id = ${lit(bid)}`);
    check("owner cannot self-approve business (safe fields still editable)", bs?.status === "pending" && bs.verification_level === 0 && bs.description === "Açıklama" && bs.phone === "+905320000000", short(bs));
    const second = await rest("businesses", { method: "POST", body: { name: "İkinci İşletme", owner_id: tmp.user.id, status: "approved" }, token: tmp.access_token });
    check("second business for same user rejected", second.status >= 400, `status ${second.status}`);
    const pubB = await rest(`businesses?select=id&id=eq.${bid}`);
    check("pending business hidden from anon", pubB.body?.length === 0);
    const rb = await rpc("admin_review_business", { p_business_id: bid, p_approve: true }, admin.access_token);
    check("admin_review_business approve", rb.body?.ok === true && rb.body.status === "approved", short(rb.body));
    const bnote = await rest("notifications?select=title&type=eq.business_approved", { token: tmp.access_token });
    check("owner notified 'İşletmen yayında!'", bnote.body?.[0]?.title === "İşletmen yayında!", short(bnote.body?.[0]));
    const jobOk = await rest("listings", { method: "POST", token: tmp.access_token, body: { type: "job", category_id: ref.job_cat, title: "Test eleman ilanı", description: "Deneme ilanı", job_work_type: "tam_zamanli", job_benefits: ["sgk"] } });
    check("approved business can post a job (business_id set)", jobOk.status === 201 && jobOk.body?.[0]?.business_id === bid, `status ${jobOk.status} ${short(jobOk.body?.[0]?.status ?? jobOk.body)}`);
    const mr = await rpc("mark_notifications_read", {}, tmp.access_token);
    check("mark_notifications_read", typeof mr.body === "number" && mr.body >= 1, short(mr.body));
  } else {
    check("admin checks", false, "ADMIN_OTP_FILE not set");
  }

  // ------------------------------------------------------------------ (d) services
  const answers = { ev_tipi: "daire", oda_sayisi: "3+1", banyo_sayisi: "1", siklik: "tek_sefer", malzeme: "firma", ekstralar: ["cam"] };
  const bad = await rpc("submit_service_request", { p_category_id: ref.ev_id, p_answers: { ev_tipi: "daire" }, p_neighbourhood_id: ref.hh_id, p_when_type: "bu_hafta" }, ayse.access_token);
  check("submit with missing required answers rejected", bad.status >= 400 && /Eksik/.test(JSON.stringify(bad.body)), short(bad.body?.message));
  const anonSub = await rpc("submit_service_request", { p_category_id: ref.ev_id, p_answers: answers, p_neighbourhood_id: ref.hh_id });
  check("anon cannot submit request", anonSub.status >= 400, `status ${anonSub.status}`);
  const sub = await rpc("submit_service_request", {
    p_category_id: ref.ev_id, p_answers: answers, p_neighbourhood_id: ref.hh_id, p_address_note: "Site girişi",
    p_when_type: "bu_hafta", p_note: "Otomatik doğrulama testi", p_photos: [], p_hide_phone: false,
  }, ayse.access_token);
  if (sub.body?.id) testRequestIds.push(sub.body.id);
  check("submit_service_request (auto_dispatch) -> open + leads", sub.status === 200 && /^[A-Z2-9]{8}$/.test(sub.body?.public_code || "") && sub.body.status === "open" && sub.body.lead_count >= 1, short(sub.body));
  const code = sub.body?.public_code;

  const ml = await rest(`my_leads?select=*&request_id=eq.${sub.body?.id}`, { token: parlak.access_token });
  check("matching business gets the lead (my_leads)", ml.body?.length === 1 && ml.body[0].category_name === "Ev Temizliği", short(ml.body?.[0] && { status: ml.body[0].status, nb: ml.body[0].neighbourhood_name }));
  const leadId = ml.body?.[0]?.id;
  const bn = await rest(`notifications?select=title,link&type=eq.lead_new&link=eq./isletme/talepler/${leadId}`, { token: parlak.access_token });
  check("business owner notified (lead_new)", bn.body?.length === 1, short(bn.body?.[0]));
  const srd = await rest(`service_requests?select=id&id=eq.${sub.body?.id}`, { token: parlak.access_token });
  check("business cannot read service_requests directly", srd.body?.length === 0);
  const d1 = await rpc("get_lead_detail", { p_lead_id: leadId }, parlak.access_token);
  check("get_lead_detail hides phone before accept", d1.body?.customer?.phone === null && d1.body?.customer?.display_name === "Ayşe Y." && d1.body?.request?.address_note === null,
    short(d1.body?.customer));
  check("get_lead_detail resolves question titles/labels", d1.body?.request?.answers?.[0]?.title === "Evin tipi nedir?" && d1.body.request.answers[0].display === "Daire" && d1.body.lead.status === "seen",
    short(d1.body?.request?.answers?.slice(0, 2)));
  const other = await rpc("get_lead_detail", { p_lead_id: leadId }, kombi.access_token);
  check("other business cannot open the lead", other.body === null);
  const acc = await rpc("accept_lead", { p_lead_id: leadId, p_offer_price: 1250, p_offer_note: "Yarın 10:00 için uygunuz." }, parlak.access_token);
  check("accept_lead -> ok + customer phone", acc.body?.ok === true && acc.body.customer_phone === "+905550000020" && acc.body.customer_name === "Ayşe Yılmaz", short(acc.body));
  const d2 = await rpc("get_lead_detail", { p_lead_id: leadId }, parlak.access_token);
  check("get_lead_detail shows phone after accept", d2.body?.customer?.phone === "+905550000020" && d2.body?.request?.address_note === "Site girişi");
  const cr = await rpc("get_request_for_customer", { p_code: code }, ayse.access_token);
  check("get_request_for_customer lists accepted firm", cr.body?.providers?.length === 1 && cr.body.providers[0].business.name === "Parlak Temizlik" && Number(cr.body.providers[0].offer_price_try) === 1250,
    short(cr.body?.providers?.[0]?.business));
  const crOther = await rpc("get_request_for_customer", { p_code: code }, mehmet.access_token);
  check("other user cannot open the request", crOther.body === null);
  const cn = await rest(`notifications?select=title,body&link=eq./talep/${code}&type=eq.lead_accepted`, { token: ayse.access_token });
  check("customer notified (lead_accepted)", cn.body?.[0]?.title === "Parlak Temizlik talebinle ilgilendi", short(cn.body?.[0]));
  const cl = await rpc("close_request", { p_code: code, p_hired_business_id: ref.parlak_id }, ayse.access_token);
  check("close_request -> closed_hired", cl.body?.ok === true && cl.body.status === "closed_hired", short(cl.body));
  const rv = await rpc("submit_review", { p_request_code: code, p_business_id: ref.parlak_id, p_rating: 5, p_comment: "Test yorumu" }, ayse.access_token);
  check("submit_review for hired firm", rv.body?.ok === true, short(rv.body));
  const rvBad = await rpc("submit_review", { p_request_code: code, p_business_id: ref.kombi_id, p_rating: 1 }, ayse.access_token);
  check("review for non-hired firm rejected", rvBad.body?.ok === false, short(rvBad.body));

  // Atomic accept with max_providers = 1 and two firms racing
  const sub2 = await rpc("submit_service_request", { p_category_id: ref.ev_id, p_answers: answers, p_neighbourhood_id: ref.hh_id, p_when_type: "esnek", p_hide_phone: true }, ayse.access_token);
  if (sub2.body?.id) testRequestIds.push(sub2.body.id);
  const [pl2] = await sql(`select id from public.leads where request_id = ${lit(sub2.body.id)} and business_id = ${lit(ref.parlak_id)}`);
  const [kl2] = await sql(`insert into public.leads (request_id, business_id, status) values (${lit(sub2.body.id)}, ${lit(ref.kombi_id)}, 'sent') returning id`);
  await sql(`update public.service_requests set max_providers = 1 where id = ${lit(sub2.body.id)}`);
  const [a1, a2] = await Promise.all([
    rpc("accept_lead", { p_lead_id: pl2.id }, parlak.access_token),
    rpc("accept_lead", { p_lead_id: kl2.id }, kombi.access_token),
  ]);
  const oks = [a1.body, a2.body].filter((b) => b?.ok === true);
  const full = [a1.body, a2.body].filter((b) => b?.ok === false && b.reason === "full");
  check("race with max_providers=1: exactly one accept wins, other gets 'full'", oks.length === 1 && full.length === 1, `${short(a1.body)} | ${short(a2.body)}`);
  check("hide_phone: winner gets no phone", oks[0] && oks[0].customer_phone === null && oks[0].hide_phone === true);
  const [s2] = await sql(`select status, accepted_count from public.service_requests where id = ${lit(sub2.body.id)}`);
  check("request becomes 'filled'", s2.status === "filled" && s2.accepted_count === 1, short(s2));
  const winnerLead = a1.body?.ok ? pl2.id : kl2.id;
  const loserLead = a1.body?.ok ? kl2.id : pl2.id;
  const loserToken = a1.body?.ok ? kombi.access_token : parlak.access_token;
  const rm = await rpc("customer_remove_lead", { p_lead_id: winnerLead }, ayse.access_token);
  const [s3] = await sql(`select status, accepted_count from public.service_requests where id = ${lit(sub2.body.id)}`);
  check("customer_remove_lead frees slot and re-opens", rm.body?.ok === true && s3.status === "open" && s3.accepted_count === 0, short(s3));
  const again = await rpc("accept_lead", { p_lead_id: loserLead }, loserToken);
  check("previously 'full' firm can accept after slot freed", again.body?.ok === true, short(again.body));
  const reAcc = await rpc("accept_lead", { p_lead_id: winnerLead }, a1.body?.ok ? parlak.access_token : kombi.access_token);
  check("removed firm cannot re-accept", reAcc.body?.ok === false && reAcc.body.reason === "removed", short(reAcc.body));

  // ------------------------------------------------------------------ contact / phone reveal
  const [cls] = await sql(`select id, call_count from public.listings where is_demo and type = 'classified' and business_id is null order by created_at limit 1`);
  const [job] = await sql(`select id from public.listings where is_demo and type = 'job' limit 1`);
  const rev = [];
  for (let i = 0; i < 6; i++) rev.push((await rpc("reveal_listing_phone", { p_listing_id: cls.id })).body);
  check("anon reveal_listing_phone works", rev[0]?.ok === true && /^\+90\d{10}$/.test(rev[0].phone), short(rev[0] && { ok: rev[0].ok, name: rev[0].display_name }));
  check("anon reveal limit (5/day) -> login_required", rev[5]?.ok === false && rev[5].reason === "login_required", short(rev[5]));
  const rj = await rpc("reveal_listing_phone", { p_listing_id: job.id });
  check("job phone reveal has no limit", rj.body?.ok === true, short(rj.body && { ok: rj.body.ok, name: rj.body.display_name }));
  const lg = await rpc("log_contact_event", { p_subject_type: "listing", p_subject_id: cls.id, p_event: "call_click" });
  const [cc] = await sql(`select call_count from public.listings where id = ${lit(cls.id)}`);
  check("log_contact_event (anon) increments call_count", lg.status === 204 && cc.call_count === cls.call_count + 1, `status ${lg.status}`);
  await sql(`update public.listings set call_count = ${cls.call_count} where id = ${lit(cls.id)}`);

  // ------------------------------------------------------------------ storage
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const upOwn = await fetch(`${URL}/storage/v1/object/media/${tmp.user.id}/verify.png`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tmp.access_token}`, "Content-Type": "image/png", "x-upsert": "true" }, body: png });
  check("storage: upload under own prefix", upOwn.status === 200, `status ${upOwn.status}`);
  const upOther = await fetch(`${URL}/storage/v1/object/media/${ayse.user.id}/hack.png`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tmp.access_token}`, "Content-Type": "image/png" }, body: png });
  check("storage: upload under someone else's prefix denied", upOther.status >= 400, `status ${upOther.status}`);
  const pub = await fetch(`${URL}/storage/v1/object/public/media/${tmp.user.id}/verify.png`);
  check("storage: media is publicly readable", pub.status === 200, `status ${pub.status}`);
  const del = await fetch(`${URL}/storage/v1/object/media/${tmp.user.id}/verify.png`, { method: "DELETE", headers: { apikey: ANON, Authorization: `Bearer ${tmp.access_token}` } });
  check("storage: owner can delete", del.status === 200, `status ${del.status}`);

  // account deletion (last: invalidates tmp)
  const dm = await rpc("delete_my_account", {}, tmp.access_token);
  const [gone] = await sql(`select count(*)::int as n from auth.users where id = ${lit(tmp.user.id)}`);
  const [bizGone] = await sql(`select count(*)::int as n from public.businesses where name = 'Test İşletmesi'`);
  check("delete_my_account removes auth user, profile and business", dm.body?.ok === true && gone.n === 0 && bizGone.n === 0, short(dm.body));
  if (gone.n === 0) tmp = null;
} catch (e) {
  check("unexpected error", false, e.stack?.slice(0, 500));
} finally {
  // ------------------------------------------------------------------ cleanup (each step isolated; results always print)
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      check(`cleanup: ${name}`, false, e.message.slice(0, 200));
    }
  };
  await step("test requests", async () => {
    // also catches requests left behind by an earlier interrupted run (only the throwaway flow creates them)
    await sql(`delete from public.reviews where not is_demo and request_id is not null;
      delete from public.service_requests where not is_demo;`);
  });
  await step("notifications/contact events/counters", async () => {
    await sql(`delete from public.notifications where created_at >= ${lit(t0)};
      delete from public.contact_events where created_at >= ${lit(t0)};
      update public.businesses b set
        leads_accepted_count = (select count(*) from public.leads l where l.business_id = b.id and l.status = 'accepted'),
        rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews r where r.business_id = b.id), 0),
        rating_count = (select count(*) from public.reviews r where r.business_id = b.id)
      where b.is_demo;`);
  });
  await step("throwaway user", async () => {
    const id = tmp?.user?.id ?? (await sql(`select id from auth.users where phone = '905551112244'`))[0]?.id;
    if (id) {
      const d = await adminFetch(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
      check("cleanup: throwaway user deleted", d.ok, `status ${d.status}`);
    }
  });
  await step("final state", async () => {
    const left = await sql(`select (select count(*) from public.service_requests) as requests, (select count(*) from public.listings where not is_demo) as non_demo_listings`);
    check("cleanup: no test requests/listings left", Number(left[0].requests) === 0 && Number(left[0].non_demo_listings) === 0, short(left[0]));
  });
  void testRequestIds;
  for (const line of results) console.log(line);
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

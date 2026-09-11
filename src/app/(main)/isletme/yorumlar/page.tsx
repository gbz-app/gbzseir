import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Star } from "lucide-react";
import { routes } from "@/core/routes";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ReportSheet } from "@/components/shared/report-sheet";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { RatingInline, Stars } from "@/features/business/components/rating";
import { ReviewReply } from "@/features/business/components/review-reply";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";

export const metadata: Metadata = { title: "Yorumlar", robots: { index: false } };

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  created_at: string;
  author: { display_name: string | null } | Array<{ display_name: string | null }> | null;
};

function authorName(a: ReviewRow["author"]): string {
  const r = Array.isArray(a) ? a[0] : a;
  return r?.display_name || "Müşteri";
}

/** H7 - Yorumlar: every review with the business's public reply. */
export default async function BusinessReviewsPage() {
  await requireProfile(routes.business.reviews());
  const b = await getOwnerBusiness();
  if (!b || b.status !== "approved") redirect(routes.business.root());

  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id,rating,comment,reply,created_at,author:public_profiles!reviews_author_id_fkey(display_name)")
    .eq("business_id", b.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const reviews = (data ?? []) as unknown as ReviewRow[];
  const unreplied = reviews.filter((r) => !r.reply).length;

  return (
    <>
      <PageHeader title="Yorumlar" subtitle={b.name} backHref={routes.business.root()} />
      {reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Henüz yorum yok"
          description="Hizmet verdiğin müşteriler, talebi kapatınca seni değerlendirebilir. Yorumlar burada görünür."
        />
      ) : (
        <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
          <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-soft ring-1 ring-foreground/[0.06]">
            <RatingInline avg={b.rating_avg} count={b.rating_count} showCountLabel className="text-[15px] font-semibold" />
            {unreplied ? <span className="text-sm text-muted-foreground">{unreplied} yanıt bekliyor</span> : null}
          </div>
          <ul className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{authorName(r.author)}</span>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: tr })}</span>
                </div>
                <Stars value={r.rating} className="mt-1" />
                {r.comment ? <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{r.comment}</p> : null}
                <ReviewReply reviewId={r.id} initialReply={r.reply} />
                <div className="mt-1 -mb-2 flex justify-end">
                  <ReportSheet targetType="review" targetId={r.id} className="-mr-2" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

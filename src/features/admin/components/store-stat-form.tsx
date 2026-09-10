"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { istanbulDateKey } from "@/core/time";
import { saveStoreStatAction } from "../actions/analytics";
import { useAdminAction } from "./use-admin-action";

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Inline form: one store + date row (upsert). */
export function StoreStatForm() {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [platform, setPlatform] = React.useState<"google_play" | "app_store">("google_play");
  const [date, setDate] = React.useState(() => istanbulDateKey(new Date()));
  const [downloads, setDownloads] = React.useState("");
  const [active, setActive] = React.useState("");
  const [rating, setRating] = React.useState("");
  const [ratings, setRatings] = React.useState("");
  const [reviews, setReviews] = React.useState("");
  const [note, setNote] = React.useState("");

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Mağaza verisi ekle
      </Button>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        saveStoreStatAction({
          platform,
          statDate: date,
          downloads: num(downloads),
          activeInstalls: num(active),
          rating: num(rating),
          ratingsCount: num(ratings),
          reviewsCount: num(reviews),
          note,
        }),
      { refresh: true, onSuccess: () => setOpen(false) },
    );
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-1 block text-xs font-semibold">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-4">
      <div className="min-w-0">
        <Label htmlFor="ss-platform" className="mb-1 block text-xs font-semibold">
          Mağaza
        </Label>
        <select
          id="ss-platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "google_play" | "app_store")}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="google_play">Google Play</option>
          <option value="app_store">App Store</option>
        </select>
      </div>
      {field("ss-date", "Tarih", date, setDate, { type: "date", inputMode: undefined })}
      {field("ss-dl", "Toplam indirme", downloads, setDownloads)}
      {field("ss-active", "Aktif kurulum", active, setActive)}
      {field("ss-rating", "Ortalama puan (0-5)", rating, setRating)}
      {field("ss-ratings", "Puan sayısı", ratings, setRatings)}
      {field("ss-reviews", "Yorum sayısı", reviews, setReviews)}
      {field("ss-note", "Not", note, setNote, { inputMode: undefined, maxLength: 300 })}
      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Kaydet
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedImage } from "@/components/shared/image-uploader";
import { formatNumber } from "@/core/format";
import { routes } from "@/core/routes";
import { pickerDefs } from "@/features/business/lib/category-visuals";
import type { ArticleCategory, NewsCategoryDef } from "@/features/content/articles/meta";
import { deleteNewsArticleAction, saveNewsArticleAction } from "../actions/news-articles";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type NewsArticleValue = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  category: ArticleCategory;
  cover_url: string | null;
  status: "draft" | "published";
  published_at: string | null;
};

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const DEFAULT_CATEGORY = "gundem";
const SUMMARY_MAX = 300;
const BODY_MAX = 20000;

const toImages = (url: string | null | undefined): UploadedImage[] => (url ? [{ url, thumbUrl: url, path: "", thumbPath: "" }] : []);

/** Add / edit one of our own news stories: title, category, summary, body, cover photo and the publish switch. */
export function NewsArticleDialog({
  value,
  categories,
  trigger,
}: {
  value?: NewsArticleValue;
  /** news_categories in admin order (loadVocabularies): the picker lists the active ones plus the story's own. */
  categories: readonly NewsCategoryDef[];
  trigger: React.ReactElement;
}) {
  const options = pickerDefs(categories, value?.category);
  const fallbackCategory = options.some((c) => c.key === DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : (options[0]?.key ?? DEFAULT_CATEGORY);
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(value?.title ?? "");
  const [category, setCategory] = React.useState<ArticleCategory>(value?.category ?? fallbackCategory);
  const [summary, setSummary] = React.useState(value?.summary ?? "");
  const [body, setBody] = React.useState(value?.body ?? "");
  const [cover, setCover] = React.useState<UploadedImage[]>(() => toImages(value?.cover_url));
  const [published, setPublished] = React.useState(value?.status === "published");
  const [uploading, setUploading] = React.useState(false);
  const ids = { title: React.useId(), cat: React.useId(), summary: React.useId(), body: React.useId() };

  const reset = () => {
    setTitle("");
    setCategory(fallbackCategory);
    setSummary("");
    setBody("");
    setCover([]);
    setPublished(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        saveNewsArticleAction({
          id: value?.id,
          title,
          category,
          summary,
          body,
          coverUrl: cover[0]?.url ?? null,
          published,
        }),
      {
        onSuccess: () => {
          setOpen(false);
          if (!value) reset();
        },
        refresh: true,
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && !uploading && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{value ? "Haberi düzenle" : "Yeni haber"}</DialogTitle>
          <DialogDescription>Yayındaki haberler ana sayfadaki Haberler bölümünde ve Haberler sayfasında, kaynak haberlerinden önce görünür.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label htmlFor={ids.title} className="mb-1 block text-xs font-semibold">
              Başlık
            </Label>
            <Input id={ids.title} value={title} minLength={5} maxLength={160} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={ids.cat} className="mb-1 block text-xs font-semibold">
                Kategori
              </Label>
              <select id={ids.cat} value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT}>
                {options.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.active ? c.label : `${c.label} (pasif)`}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:self-end">
              <span className="min-w-0">
                <span className="block font-semibold">Yayında</span>
                <span className="block text-xs text-muted-foreground">{published ? "Herkes görebilir." : "Taslak: yalnızca burada görünür."}</span>
              </span>
              <Switch checked={published} onCheckedChange={setPublished} />
            </label>
          </div>
          <div>
            <Label htmlFor={ids.summary} className="mb-1 block text-xs font-semibold">
              Özet (isteğe bağlı)
            </Label>
            <Textarea id={ids.summary} rows={3} maxLength={SUMMARY_MAX} value={summary} onChange={(e) => setSummary(e.target.value)} />
            <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Başlığın altında, listelerde ve paylaşımlarda görünür.</span>
              <span className="shrink-0 tabular-nums">
                {summary.length}/{SUMMARY_MAX}
              </span>
            </p>
          </div>
          <div>
            <Label htmlFor={ids.body} className="mb-1 block text-xs font-semibold">
              Haber metni
            </Label>
            <Textarea id={ids.body} rows={12} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-64" />
            <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Düz metin. Paragrafları boş bir satırla ayır.</span>
              <span className="shrink-0 tabular-nums">
                {formatNumber(body.length)}/{formatNumber(BODY_MAX)}
              </span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Kapak fotoğrafı (isteğe bağlı)</p>
            <ImageUploader
              value={cover}
              onChange={setCover}
              max={1}
              folder="news"
              onUploadingChange={setUploading}
              hint="Yatay bir fotoğraf seç; yoksa kategori rengi gösterilir."
            />
            <p className="mt-1 text-xs text-muted-foreground">Yalnızca kullanım hakkına sahip olduğun fotoğrafları yükle.</p>
          </div>
          {value ? (
            <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Adres: <span className="font-mono break-all text-foreground">{routes.content.newsArticle(value.slug)}</span>
              {value.published_at ? " · Yayınlandıktan sonra adres değişmez." : " · İlk yayına kadar başlıkla birlikte güncellenir."}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2">
            {value ? <DeleteNewsArticle id={value.id} title={value.title} onDone={() => setOpen(false)} /> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending || uploading}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={pending || uploading}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {value ? "Kaydet" : published ? "Yayınla" : "Taslak kaydet"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteNewsArticle({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Haber silinsin mi?"
      description={`"${title}" kalıcı olarak silinir; paylaşılan bağlantısı da çalışmaz.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => {
        const res = await run(() => deleteNewsArticleAction({ id }), { refresh: true });
        if (res?.ok) onDone();
        return !!res?.ok;
      }}
    />
  );
}

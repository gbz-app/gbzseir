import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff, Cross } from "lucide-react";
import { APP_NAME } from "@/config/site";
import { Button } from "@/components/ui/button";
import { routes } from "@/core/routes";
import { OfflineRetry } from "./offline-retry";

export const metadata: Metadata = {
  title: "Çevrimdışı",
  robots: { index: false, follow: false },
};

/** Precached by the service worker; shown when a page cannot be loaded without a connection. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-safe pb-safe">
      <header className="flex h-(--topbar-h) items-center">
        <span className="font-heading text-lg font-bold tracking-tight">{APP_NAME}</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <div className="flex size-24 items-center justify-center rounded-[2rem] bg-brand-soft text-primary">
          <CloudOff className="size-11" strokeWidth={1.8} aria-hidden />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold">İnternet bağlantın yok</h1>
        <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-balance text-muted-foreground">
          Bağlantın geri geldiğinde sayfa kendiliğinden yenilenecek. İstersen şimdi tekrar deneyebilirsin.
        </p>
        <OfflineRetry />

        <div className="mt-10 w-full rounded-2xl bg-card p-4 text-left shadow-soft ring-1 ring-foreground/[0.06]">
          <p className="flex items-center gap-2 font-bold">
            <Cross className="size-4 text-highlight" aria-hidden /> Nöbetçi eczane mi arıyorsun?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Nöbetçi eczane listesini daha önce açtıysan son kaydedilen hali çevrimdışı da görünebilir. Bilgi güncel olmayabilir; gitmeden önce
            eczaneyi arayın.
          </p>
          <Button asChild variant="outline" className="mt-3 w-full">
            <Link href={routes.nearby.dutyPharmacies()}>Kayıtlı listeyi aç</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

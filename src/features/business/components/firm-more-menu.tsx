"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ReportSheet } from "@/components/shared/report-sheet";
import { useAuth } from "@/lib/auth/auth-provider";
import { routes } from "@/core/routes";

/** "⋯" header menu of a firm page: Şikayet et (login required, comes back here). */
export function FirmMoreMenu({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [reportOpen, setReportOpen] = React.useState(false);

  const openReport = () => {
    if (!user) {
      router.push(routes.auth.login(`${window.location.pathname}${window.location.search}`));
      return;
    }
    // Let the menu finish closing (focus/pointer lock) before the sheet opens.
    window.setTimeout(() => setReportOpen(true), 50);
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Diğer seçenekler">
            <EllipsisVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={openReport} className="min-h-11 gap-2 text-[15px]">
            <Flag className="size-4" /> Şikayet et
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportSheet targetType="business" targetId={businessId} open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}

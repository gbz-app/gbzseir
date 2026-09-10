import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";

export default function AnnouncementsLoading() {
  return (
    <>
      <PageHeader title="Duyurular" subtitle="Kesintiler ve belediye duyuruları" />
      <div className="px-4 pt-4">
        <ListSkeleton variant="card" count={3} />
      </div>
    </>
  );
}

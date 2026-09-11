import { redirect } from "next/navigation";
import { routes } from "@/core/routes";

/** Applications no longer wait for review: old links to "Başvurun alındı" go to the business panel. */
export default function ApplicationReceivedPage() {
  redirect(routes.business.root());
}

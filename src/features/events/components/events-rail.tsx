import type { EventItem } from "../queries";
import { EventCard } from "./event-card";

/** Home "Yaklaşan etkinlikler": a horizontal row of event cards (the row scrolls, the page does not). Server-safe. */
export function EventsRail({ events }: { events: EventItem[] }) {
  return (
    <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
      {events.map((e, i) => (
        <li key={e.id} className="w-[17rem] shrink-0 snap-start">
          <EventCard event={e} eager={i === 0} />
        </li>
      ))}
    </ul>
  );
}

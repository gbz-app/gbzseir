import { ImageTile } from "@/features/home/components/image-tile";
import { SEARCH_TILES } from "../categories";

/** "Kategoriler" of the search page: the same square tiles as the home grid, 4 per row. Server-safe. */
export function SearchCategories() {
  return (
    <section aria-labelledby="ara-kategoriler">
      <h2 id="ara-kategoriler" className="mb-3 text-lg font-semibold">
        Kategoriler
      </h2>
      <ul className="grid grid-cols-4 gap-3">
        {SEARCH_TILES.map((c) => (
          <li key={c.key}>
            <ImageTile
              href={c.href}
              label={c.tileLabel ?? c.label}
              image={c.image}
              icon={c.icon}
              tone={c.tone}
              imageClassName={c.imageClassName}
              sizes="80px"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

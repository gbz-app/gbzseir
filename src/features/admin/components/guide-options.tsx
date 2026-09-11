import type { GuideOption } from "../lib/guide-admin";

/** <option>s of a guide select; grouped options (institution categories) render as optgroups. Server-safe. */
export function GuideOptions({ options }: { options: readonly GuideOption[] }) {
  const groups: string[] = [];
  for (const o of options) if (!groups.includes(o.group ?? "")) groups.push(o.group ?? "");
  const item = (o: GuideOption) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  );
  if (groups.length === 1 && groups[0] === "") return <>{options.map(item)}</>;
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g || "_"} label={g || "Diğer"}>
          {options.filter((o) => (o.group ?? "") === g).map(item)}
        </optgroup>
      ))}
    </>
  );
}

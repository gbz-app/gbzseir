/**
 * Structured data (schema.org JSON-LD). Server-safe.
 * <JsonLd data={{ "@context": "https://schema.org", "@type": "Pharmacy", name, telephone, ... }} />
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  // Escape "<" so user content can never close the script tag.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

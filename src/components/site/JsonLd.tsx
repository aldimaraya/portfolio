/**
 * Emits one Schema.org block. Structured data is the one thing on the site with
 * no visible surface: it exists solely so a search engine can state what this
 * page *is* rather than infer it from prose.
 *
 * `dangerouslySetInnerHTML` is unavoidable — a JSON-LD script's body must be raw
 * text, and React would escape it. Safe here because every caller builds the
 * object from typed local data, never from anything a visitor supplies. The `<`
 * escape guards the one case that would still bite: a string containing
 * "</script>" ending the block early.
 */
export function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, '\u003c'),
      }}
    />
  );
}

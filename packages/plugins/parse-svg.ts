// Splits an SVG file into the attributes of its root <svg> tag and its inner
// markup, normalizing hardcoded paint to `currentColor` so icons inherit the
// surrounding text color.
//
// Shared by the two build-time consumers so both produce identically shaped
// icons: `svg-plugin.ts` (inlines the frontend's built-in set into the bundle)
// and `packages/backend/scripts/build-icons.ts` (generates the embedded pack).

export type ParsedSvg = {
  // Root <svg> attributes, minus `xmlns` (meaningless once inlined in HTML).
  attrs: Record<string, string>,
  // Everything between <svg> and </svg>.
  body: string,
}

export function parseSvg(text: string): ParsedSvg | null {
  const tagInfo = text.match(/^<svg[\s\S]*?>/)?.[0]
  if (!tagInfo) return null

  const attrs: Record<string, string> = {};
  // `[\w:-]+` rather than `\w+` so hyphenated presentation attributes
  // (stroke-width, stroke-linecap) survive when a pack puts them on the root.
  [...tagInfo.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].forEach(([_, name, value]) => {
    if (name === "xmlns") return
    attrs[name] = value
  })

  const body = text
    .replace(/"#[0-9A-Za-z]+"/g, '"currentColor"')
    .replace(/"white"/g, '"currentColor"')
    .replace(/"black"/g, '"currentColor"')
    .replace(/fill-opacity=".+?"/g, "")
    .replace(/^<svg[\s\S]*?>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim()

  return { attrs, body }
}

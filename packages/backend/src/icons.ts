// Icon resolution for the panel.
//
// The full Tabler pack (MIT, ~6.2k icons) ships inside the package as a single
// generated JSON (see scripts/build-icons.ts). Consumers name icons by string
// in their page/action/widget config; at registration we resolve only the names
// actually referenced and inject those bodies into index.html — so a panel that
// uses 20 icons sends 20 icons to the browser, not 6194.
//
// The pack is read once during registration and dropped, rather than held in
// memory for the process lifetime.

import { join } from "node:path"

type IconPack = {
  pack: string,
  name: string,
  spdx: string,
  url: string,
  attribution: string | null,
  count: number,
  // Root <svg> attributes shared by every icon in the pack.
  defaults: Record<string, string>,
  // Per-icon root attributes, for icons that deviate from `defaults`.
  overrides: Record<string, Record<string, string>>,
  // Icon name → inner SVG markup.
  icons: Record<string, string>,
}

// What the frontend receives as `window.__DYNARA_ICONS__`.
export type ResolvedIcons = {
  defaults: Record<string, string>,
  icons: Record<string, string>,
  overrides?: Record<string, Record<string, string>>,
}

// Friendly aliases → Tabler names. These cover the names the panel's own UI and
// docs used before the pack was embedded (`delete`, `close`, `add`…), plus a few
// obvious synonyms, so existing configs keep working and common guesses land.
// Anything not listed here resolves against the pack directly.
export const ALIASES: Record<string, string> = {
  "add": "plus",
  "add-item": "row-insert-bottom",
  "chat": "message-circle",
  "close": "x",
  "component": "components",
  "delete": "trash",
  "delete-min": "trash-x",
  "desktop": "device-desktop",
  "like": "thumb-up",
  "mobile": "device-mobile",
  "more": "dots-vertical",
  "note-edit": "edit",
  "object": "box",
  "sort": "arrows-sort",
  "v-collapse-arrow": "chevron-down",
  "code-2": "code",
  "gallery": "photo",
  "image-solid": "photo-filled",
  // Common synonyms for names Tabler spells differently.
  "image": "photo",
  "remove": "trash",
  "cross": "x",
  "profile": "user",
  "chart": "chart-bar",
}

let packCache: IconPack | null = null

const loadPack = async (): Promise<IconPack | null> => {
  if (packCache) return packCache
  // Resolves to src/icons/tabler.json in dev and dist/icons/tabler.json once
  // bundled — the same `import.meta.dir` trick the frontend assets use.
  const file = Bun.file(join(import.meta.dir, "icons", "tabler.json"))
  if (!(await file.exists())) {
    console.warn("[dynara-admin] icon pack not found — run `bun scripts/build-icons.ts`. Icons will be omitted.")
    return null
  }
  packCache = await file.json()
  return packCache
}

// Levenshtein distance, capped for early exit — only ever runs on the error path.
const distance = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]!
}

// Best-effort "did you mean" for an unknown icon name. Substring matches rank
// first (a search for "wallet" should surface "wallet-off" over a typo guess).
const suggest = (name: string, names: string[], limit = 4): string[] => {
  const substring = names.filter(n => n.includes(name) || name.includes(n))
  if (substring.length > 0) {
    return substring.sort((a, b) => a.length - b.length).slice(0, limit)
  }
  const near = names
    .map(n => [n, distance(name, n)] as const)
    .filter(([, d]) => d <= 3)
    .sort((a, b) => a[1] - b[1])
  if (near.length === 0) return []
  // Keep only the tier closest to the best match, so a near-certain typo fix
  // isn't buried among coincidentally-similar names.
  const best = near[0]![1]
  return near.filter(([, d]) => d <= best + 1).slice(0, limit).map(([n]) => n)
}

/**
 * Resolves the icon names referenced by a panel's config into the payload the
 * frontend inlines. Unknown names are reported with suggestions: fatal during
 * development (so a typo surfaces immediately, including for agent-written
 * config), a warning in production (so a typo can't stop a server from booting).
 */
export const resolveIcons = async (names: Iterable<string>): Promise<ResolvedIcons | null> => {
  const wanted = [...new Set([...names].filter(Boolean))]
  if (wanted.length === 0) return null

  const pack = await loadPack()
  if (!pack) return null
  // Registration is the only thing that needs the pack — release it however we
  // leave, so a ~2 MB parse doesn't sit in memory for the process lifetime.
  try {
    return resolveAgainst(pack, wanted)
  } finally {
    packCache = null
  }
}

const resolveAgainst = (pack: IconPack, wanted: string[]): ResolvedIcons => {
  const icons: Record<string, string> = {}
  const overrides: Record<string, Record<string, string>> = {}
  const unknown: string[] = []

  for (const name of wanted) {
    const target = ALIASES[name] ?? name
    const body = pack.icons[target]
    if (body === undefined) {
      unknown.push(name)
      continue
    }
    // Keyed by the name the consumer wrote, so the frontend looks up what it
    // was given and never needs to know about aliases.
    icons[name] = body
    const override = pack.overrides[target]
    if (override) overrides[name] = override
  }

  if (unknown.length > 0) {
    const packNames = Object.keys(pack.icons)
    const detail = unknown.map(name => {
      const hints = suggest(name, packNames)
      return `  "${name}"${hints.length ? ` — did you mean: ${hints.join(", ")}?` : ""}`
    }).join("\n")
    const message = `[dynara-admin] unknown icon name(s) — not in the ${pack.name} set:\n${detail}`

    if (process.env.NODE_ENV === "production") {
      console.warn(`${message}\nThese icons will be omitted.`)
    } else {
      throw new Error(`${message}\n\nBrowse the full set at https://icon-registry.jt3.ru (pack: ${pack.pack}).`)
    }
  }

  return {
    defaults: pack.defaults,
    icons,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  }
}

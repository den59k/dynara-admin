// Re-syncs the frontend's built-in icon set from the embedded Tabler pack.
//
//   bun scripts/sync-builtin-icons.ts [--check]
//
// The built-in set is the handful of icons the panel UI renders itself (close,
// check, chevrons, sort arrows…). It stays bundled rather than server-resolved
// because the UI needs it regardless of what the host app configures — but it
// must be the *same* artwork as the server-resolved pack, or the panel ends up
// mixing icon styles.
//
// Each file keeps its existing name; the Tabler icon it maps to is the same
// name, or the backend's alias for it (see backend/src/icons.ts ALIASES) — so
// the mapping lives in exactly one place.
//
// `--check` verifies the files are in sync without writing (for CI).

import { Glob } from "bun"
import { join } from "node:path"
import { ALIASES } from "../../backend/src/icons.ts"

const ICONS_DIR = join(import.meta.dir, "..", "src", "assets", "icons")
const PACK = join(import.meta.dir, "..", "..", "backend", "src", "icons", "tabler.json")

const check = process.argv.includes("--check")

const pack = await Bun.file(PACK).json() as {
  name: string,
  defaults: Record<string, string>,
  overrides: Record<string, Record<string, string>>,
  icons: Record<string, string>,
}

const renderAttrs = (attrs: Record<string, string>) =>
  Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join("")

let written = 0
let stale = 0
const missing: string[] = []

for await (const file of new Glob("**/*.svg").scan({ cwd: ICONS_DIR })) {
  const slash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"))
  const name = file.slice(slash + 1, -4)

  const target = ALIASES[name] ?? name
  const body = pack.icons[target]
  if (body === undefined) {
    missing.push(`${name} → ${target}`)
    continue
  }

  const attrs = { ...pack.defaults, ...(pack.overrides[target] ?? {}) }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"${renderAttrs(attrs)}>${body}</svg>\n`

  const path = join(ICONS_DIR, file)
  const current = await Bun.file(path).text().catch(() => "")
  if (current === svg) continue

  stale++
  if (!check) {
    await Bun.write(path, svg)
    written++
  }
  console.info(`${check ? "stale" : "wrote"}  ${file}  ←  tabler:${target}`)
}

if (missing.length > 0) {
  console.error(`\nNo Tabler icon for:\n  ${missing.join("\n  ")}`)
  console.error(`Add an alias in backend/src/icons.ts, or rename the file.`)
  process.exit(1)
}

if (check) {
  if (stale > 0) {
    console.error(`\n${stale} built-in icon(s) out of sync — run: bun scripts/sync-builtin-icons.ts`)
    process.exit(1)
  }
  console.info(`Built-in icons are in sync with ${pack.name}.`)
} else {
  console.info(`\n${written} icon(s) updated from ${pack.name}.`)
}

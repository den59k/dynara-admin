// Generates the embedded icon pack served to the panel frontend.
//
//   bun scripts/build-icons.ts [--pack tabler] [--registry <dir|url>]
//
// Reads a pack from an icon-registry (https://icon-registry.jt3.ru by default,
// or a local `data/v1` checkout, which avoids thousands of HTTP requests) and
// writes src/icons/<pack>.json.
//
// The output is committed so builds stay hermetic and bumping the pack produces
// a reviewable diff — the published package never talks to the registry.

import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import { parseSvg } from "../../plugins/parse-svg.ts"

const DEFAULT_REGISTRY = "https://icon-registry.jt3.ru/v1"

const args = process.argv.slice(2)
const argOf = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback
}

const pack = argOf("pack", "tabler")
const registry = argOf("registry", DEFAULT_REGISTRY)
const isHttp = /^https?:\/\//.test(registry)

const read = async (path: string) => {
  if (isHttp) {
    const res = await fetch(`${registry}/${path}`)
    if (!res.ok) throw new Error(`GET ${registry}/${path} → ${res.status}`)
    return await res.text()
  }
  return await Bun.file(join(registry, path)).text()
}

type PackMeta = {
  prefix: string, name: string, spdx: string, url: string,
  attribution: string | null, total: number,
  icons: Record<string, { viewBox: string, kw: string[], hash: string, mono: boolean }>,
}

console.info(`Reading ${pack} from ${registry}${isHttp ? "" : " (local)"}…`)
const meta: PackMeta = JSON.parse(await read(`${pack}/meta.json`))
const names = Object.keys(meta.icons)
console.info(`  ${names.length} icons`)

// Bounded concurrency — matters for the HTTP path, harmless for the local one.
const CONCURRENCY = isHttp ? 24 : 64
const parsed = new Map<string, { attrs: Record<string, string>, body: string }>()
let done = 0

const worker = async (queue: string[]) => {
  for (const name of queue) {
    const text = await read(`${pack}/${name}.svg`)
    const svg = parseSvg(text)
    if (!svg) {
      console.warn(`  skipped ${name}: not an SVG`)
      continue
    }
    parsed.set(name, svg)
    if (++done % 1000 === 0) console.info(`  ${done}/${names.length}`)
  }
}

const queues: string[][] = Array.from({ length: CONCURRENCY }, () => [])
names.forEach((name, i) => queues[i % CONCURRENCY]!.push(name))
await Promise.all(queues.map(worker))

// Packs are near-uniform (Tabler is 24×24 throughout), so the root attributes
// are stored once as `defaults` and only deviating icons carry an override.
// That keeps the JSON — and the per-panel payload — to just the path data.
const tally = new Map<string, number>()
for (const { attrs } of parsed.values()) {
  const key = JSON.stringify(attrs)
  tally.set(key, (tally.get(key) ?? 0) + 1)
}
const [defaultsKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!
const defaults = JSON.parse(defaultsKey) as Record<string, string>

const icons: Record<string, string> = {}
const overrides: Record<string, Record<string, string>> = {}
for (const name of names.sort()) {
  const svg = parsed.get(name)
  if (!svg) continue
  icons[name] = svg.body
  if (JSON.stringify(svg.attrs) !== defaultsKey) overrides[name] = svg.attrs
}

const out = {
  pack: meta.prefix,
  name: meta.name,
  spdx: meta.spdx,
  url: meta.url,
  attribution: meta.attribution,
  count: Object.keys(icons).length,
  defaults,
  overrides,
  icons,
}

const dir = join(import.meta.dir, "..", "src", "icons")
await mkdir(dir, { recursive: true })
const file = join(dir, `${pack}.json`)
await Bun.write(file, JSON.stringify(out))

const size = (await Bun.file(file).size) / 1024
console.info(`\n${out.count} icons → ${file} (${size.toFixed(0)} KB)`)
console.info(`defaults: ${defaultsKey}`)
console.info(`overrides: ${Object.keys(overrides).length} icon(s) deviate from defaults`)
console.info(`license: ${out.spdx}${out.attribution ? ` — attribution required: ${out.attribution}` : ""}`)

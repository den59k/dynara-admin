// Copies runtime assets that bunup doesn't bundle into dist.
//
// The icon pack is read at runtime with `Bun.file(join(import.meta.dir, ...))`
// rather than imported, so it never enters the JS bundle and has to be copied
// alongside it. bunup clears dist, so this runs after the bundle step.

import { cp, mkdir } from "node:fs/promises"
import { join } from "node:path"

const SRC = join(import.meta.dir, "..", "src")
const DIST = join(import.meta.dir, "..", "dist")

await mkdir(join(DIST, "icons"), { recursive: true })
await cp(join(SRC, "icons"), join(DIST, "icons"), { recursive: true })

console.info("Copied src/icons → dist/icons")

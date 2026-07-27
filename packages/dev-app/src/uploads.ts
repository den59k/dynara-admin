// The app's half of a file field: storing what the panel uploads, and serving
// it back. The panel only ever keeps the value `storeUpload` returns, so both
// ends of that — the compression and the hosting — are ours.

import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { randomUUID } from "node:crypto"
import type { Router } from "dynara"
import sharp from "sharp"
import type { FileValue } from "../../backend/src/main"

// Files land in an ephemeral temp dir, like the embedded DB — swap the
// `Bun.write` calls for a bucket put and nothing else changes.
const uploadsDir = mkdtempSync(join(tmpdir(), "dynara-uploads-"))

// The display copy is capped at this width, the `previewSrc` thumbnail at this
// one. Both are re-encoded to WebP, which turns a multi-megabyte phone photo
// into a few hundred KB — and a thumbnail an order of magnitude smaller again,
// which is what the table's image column and the input preview actually load.
const IMAGE_MAX_WIDTH = 1600
const THUMB_MAX_WIDTH = 240

// Uploads are named by the panel's user, so the name is sanitized before it
// becomes part of a path and a url.
const safeName = (name: string) => basename(name).replace(/[^A-Za-z0-9._-]+/g, "-").slice(-64)

// Stores one uploaded file and returns the value the form field will hold.
export const storeUpload = async (file: File): Promise<FileValue> => {
  const id = randomUUID()
  const bytes = new Uint8Array(await file.arrayBuffer())

  // Anything that isn't an image is stored as it arrived — there's nothing to
  // re-encode, and `previewSrc` stays absent so the input shows a plain link.
  if (!file.type.startsWith("image/")) {
    const name = `${id}-${safeName(file.name)}`
    await Bun.write(join(uploadsDir, name), bytes)
    return { src: `/uploads/${name}`, size: bytes.byteLength }
  }

  // Two WebP renditions off one decode. `rotate()` with no argument applies the
  // EXIF orientation before resizing (phone photos arrive sideways), and
  // re-encoding drops the rest of the metadata — including the GPS tags a
  // camera may have written into a picture a user is about to publish.
  const source = sharp(bytes).rotate()
  const resize = { fit: "inside" as const, withoutEnlargement: true }
  const [image, preview] = await Promise.all([
    source.clone().resize({ width: IMAGE_MAX_WIDTH, ...resize }).webp({ quality: 82 }).toBuffer(),
    source.clone().resize({ width: THUMB_MAX_WIDTH, ...resize }).webp({ quality: 70 }).toBuffer(),
  ])
  const stem = `${id}-${safeName(file.name).replace(/\.[^.]+$/, "")}`
  await Promise.all([
    Bun.write(join(uploadsDir, `${stem}.webp`), image),
    Bun.write(join(uploadsDir, `${stem}-thumb.webp`), preview),
  ])

  // `size` describes what was stored, not what was picked — the panel never
  // measures the file itself precisely because a handler like this one changes it.
  return {
    src: `/uploads/${stem}.webp`,
    previewSrc: `/uploads/${stem}-thumb.webp`,
    size: image.byteLength,
  }
}

// Serves what `storeUpload` wrote. The panel never serves uploads itself — it
// only stores the `src` the handler returned, so hosting them is the app's job
// (here: the temp dir; in production: a bucket / CDN url).
export const serveUploads = (app: Router) => {
  app.get("/uploads/:name", [{ name: "string" }], async (req) => {
    const file = Bun.file(join(uploadsDir, basename(req.params.name)))
    if (!(await file.exists())) return new Response("Not found", { status: 404 })
    return new Response(file)
  })
}

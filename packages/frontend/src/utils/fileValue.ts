// The value a `file` / `image` field holds, and the read helpers around it.
//
// A field declared `"file"` / `"image"` (the backend's schema aliases) stores
// the structure the upload handler returned — `{ src, previewSrc?, size? }`,
// possibly with keys of its own. A field declared `{ type: "string", format:
// "file" }` stores the bare url instead. Both spellings reach the same inputs
// and the same table columns, so everything that renders one accepts either.

export type FileValue = { src: string, previewSrc?: string, size?: number }

// A read view of either spelling — or null when the field is empty. This is
// never what gets stored: the stored value is whatever the handler produced,
// kept verbatim so its extra keys survive a round-trip through the form.
export const normalizeFileValue = (value: any): FileValue | null => {
  if (value == null || value === '') return null
  if (typeof value === 'string') return { src: value }
  if (typeof value !== 'object') return null
  const { src, previewSrc, size } = value as FileValue
  if (typeof src !== 'string' || !src) return null
  return {
    src,
    previewSrc: typeof previewSrc === 'string' && previewSrc ? previewSrc : undefined,
    size: typeof size === 'number' ? size : undefined,
  }
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(?:[?#]|$)/i

// Whether a src can be shown in an <img>. Extension-based, plus the two schemes
// that carry their type inline (a `blob:` url is one we made ourselves from a
// picked image, so it is always one).
export const isImageSrc = (src: string): boolean =>
  src.startsWith('data:image/') || src.startsWith('blob:') || IMAGE_EXTENSION.test(src)

// The src to render as a thumbnail: the handler's lighter `previewSrc` when it
// made one, else the file itself when it is an image. null → nothing to show,
// so the caller falls back to a name/link.
export const previewSrcOf = (value: any): string | null => {
  const file = normalizeFileValue(value)
  if (!file) return null
  if (file.previewSrc) return file.previewSrc
  return isImageSrc(file.src) ? file.src : null
}

// The file's display name: the last path segment of its src, percent-decoded.
export const fileNameOf = (value: any): string => {
  const file = normalizeFileValue(value)
  if (!file) return ''
  const path = file.src.split(/[?#]/)[0]!
  const name = path.split('/').pop() || file.src
  try { return decodeURIComponent(name) } catch { return name }
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

// "812 B" / "1.4 MB". Empty string when the handler didn't report a size —
// nothing in the panel measures files itself, since a handler that compresses
// or re-encodes is the only one that knows what was actually stored.
export const formatFileSize = (bytes: number | undefined | null): string => {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return ''
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < SIZE_UNITS.length - 1) {
    size /= 1024
    unit++
  }
  const rounded = unit === 0 ? size : Math.round(size * 10) / 10
  return `${rounded} ${SIZE_UNITS[unit]}`
}

// Whether a file satisfies an `accept` list (".pdf,image/*"). Only needed for
// drag & drop — the picker applies `accept` itself, and the upload handler is
// the real authority on what it will store.
export const matchesAccept = (file: { name: string, type: string }, accept?: string): boolean => {
  if (!accept) return true
  const patterns = accept.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
  if (patterns.length === 0) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return patterns.some(pattern => {
    if (pattern.startsWith('.')) return name.endsWith(pattern)
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1))
    return type === pattern
  })
}

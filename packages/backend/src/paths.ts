// Path and URL helpers shared by the route builders and the static UI server.

import { join, normalize, sep, isAbsolute } from "node:path"

// The route path used for the home ("/") page. Kept in one place so the sentinel
// does not have to be spelled out by hand across the route builders.
export const HOME_PATH = "__home__"

// The asset prefix baked into the frontend bundle at build time (see the
// frontend build's PUBLIC_PATH). When a custom `basePath` is configured the
// served index.html is rewritten from this prefix to the configured one.
export const BUILD_ASSET_PREFIX = "/admin/assets/"

// Normalizes a configured UI base path: guarantees a leading slash and drops a
// trailing one ("admin" → "/admin", "/panel/" → "/panel").
export const normalizeBasePath = (p: string) => {
  let s = p.trim()
  if (!s.startsWith("/")) s = "/" + s
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1)
  return s
}

// Normalizes a configured page path to the single URL segment used in routes.
// "" / "/" → the home sentinel; a leading slash is stripped otherwise.
export const toRouteSegment = (path?: string) => {
  let p = path ?? ''
  if (p.startsWith('/')) p = p.slice(1)
  return p === '' ? HOME_PATH : p
}

// Resolves a request path under the assets prefix to an absolute file path
// inside `dir`, or null if it would escape the directory. Decodes percent-
// encoding first (so `%2e%2e` can't sneak past) and rejects absolute paths and
// any resolved path outside `dir` — robust against `..` on POSIX and Windows.
// Exported for testing.
export const resolveAssetPath = (dir: string, pathname: string, prefix: string): string | null => {
  let rel: string
  try {
    rel = decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    return null // malformed percent-encoding
  }
  if (rel === "" || isAbsolute(rel)) return null
  const full = normalize(join(dir, rel))
  const root = normalize(dir.endsWith(sep) ? dir : dir + sep)
  if (!full.startsWith(root)) return null
  return full
}

// Serves the built panel UI on the raw Bun router: hashed assets from the
// bundled frontend directory, and index.html with the runtime config and the
// referenced icons injected (plus the SPA fallback).
//
// This file must stay directly under src/ — it locates the frontend bundle via
// `import.meta.dir` (src/frontend in dev, dist/frontend once bundled).

import { join } from "node:path"
import { resolveIcons } from "./icons.ts"
import { BUILD_ASSET_PREFIX, resolveAssetPath } from "./paths.ts"
import type { PanelState } from "./types.ts"

export const installFrontendRoutes = async (state: PanelState, routesRaw: Record<string, any>) => {
  const { uiBase, apiBase, pages, dashboardWidgets } = state
  const frontendDir = join(import.meta.dir, "frontend")

  const ASSETS_PREFIX = `${uiBase}/assets/`
  routesRaw[ASSETS_PREFIX + "*"] = async (req: Request) => {
    const { pathname } = new URL(req.url)
    const full = resolveAssetPath(frontendDir, pathname, ASSETS_PREFIX)
    if (!full) return new Response("Not found", { status: 404 }) // защита от path traversal
    const file = Bun.file(full)
    if (!(await file.exists())) return new Response("Not found", { status: 404 })
    return new Response(file) // Content-Type Bun проставит по расширению
  }

  // index.html читаем один раз и держим в памяти. If the frontend hasn't been
  // built yet (fresh clone / CI before the build step / API-only tests), fall
  // back to a placeholder instead of crashing registration — the API routes
  // still work; only the panel UI is unavailable.
  const indexFile = Bun.file(join(frontendDir, "index.html"))
  let indexHtml = await indexFile.exists()
    ? await indexFile.text()
    : "<!doctype html><html><head><title>dynara-admin</title></head><body>Panel frontend is not built.</body></html>"

  // The bundle bakes in BUILD_ASSET_PREFIX at build time; rewrite it to the
  // configured base so a custom basePath serves the right asset/importmap URLs.
  if (ASSETS_PREFIX !== BUILD_ASSET_PREFIX) {
    indexHtml = indexHtml.split(BUILD_ASSET_PREFIX).join(ASSETS_PREFIX)
  }

  // Runtime config the frontend reads before its module scripts run (module
  // scripts are deferred, so this classic inline script always executes first).
  const code = [
    `window.__DYNARA_BASE__=${JSON.stringify(uiBase)}`,
    `window.__DYNARA_API_BASE__=${JSON.stringify(apiBase)}`,
    `window.__DYNARA_TITLE__=${JSON.stringify(state.title)}`,
    `window.__DYNARA_LOCALE__=${JSON.stringify(state.locale)}`,
  ]

  // Icons are named by string in page/action/widget config and resolved here
  // against the embedded Tabler pack. Only the names this panel actually
  // references are inlined, so the payload scales with the config, not with
  // the 6k-icon pack. Unknown names throw during development (see icons.ts).
  const referencedIcons = [
    ...pages.flatMap(p => [
      p.icon,
      ...p.actions.map(a => a.icon),
      ...(p.table ?? []).map(c => (c as { icon?: string }).icon),
    ]),
    ...dashboardWidgets.map(w => w.icon),
  ].filter((name): name is string => !!name)

  const icons = await resolveIcons(referencedIcons)
  if (icons) code.push(`window.__DYNARA_ICONS__=${JSON.stringify(icons)}`)

  if (pages.find(i => i.path === '/')) {
    code.push(`window.__DYNARA_CUSTOM_HOME_PAGE__ = true`)
  } else if (dashboardWidgets.length > 0) {
    // No explicit home page but a dashboard is configured — the "/" route
    // renders it instead of the empty placeholder home.
    code.push(`window.__DYNARA_DASHBOARD__ = true`)
  }

  indexHtml = indexHtml.replace("</body>", `<script>\n${code.join('\n')}\n</script>\n</body>`)

  const serveIndex = () => new Response(indexHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } })

  // SPA-fallback
  routesRaw[uiBase] = serveIndex
  routesRaw[`${uiBase}/*`] = serveIndex
}

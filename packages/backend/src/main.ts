// Package entry point: createAdminPanel wires the panel state to the modules —
// page-builder (configuration), auth / api-routes / serve-frontend / components
// (route installation) — and re-exports the public API surface.

import { type Router, HTTPError } from "dynara"
import { unfoldSchema, type SchemaItem } from "compact-json-schema"
import { installApiRoutes } from "./api-routes.ts"
import { installAuthRoutes } from "./auth.ts"
import { installComponentRoute } from "./components.ts"
import { normalizeBasePath } from "./paths.ts"
import { createPage } from "./page-builder.ts"
import { installFrontendRoutes } from "./serve-frontend.ts"
import type {
  AdminPanelDynara, AdminPanelPlugin, AuthMethod, AuthMethodInternal,
  CreateAdminPanelOptions, CreatePageOptions, DashboardWidget, PanelState,
} from "./types.ts"

// Re-exported so consumers can `import { HTTPError } from "dynara-admin"` to reject requests.
export { HTTPError }
// Exported for testing.
export { resolveAssetPath } from "./paths.ts"
export type { AccessFn, PageAccess } from "./access.ts"
export type {
  AdminPanel, AdminPanelDynara, ActionMeta, ComponentWidget, DashboardWidget,
  DashboardWidgetMeta, ListOptions, PageMeta, ReferenceMethod, ReferenceQuery,
  RequestContext, SelectOption, SelectReference, StatValue, StatWidget,
} from "./types.ts"

declare const __PRODUCTION__: boolean

export const createAdminPanel = <User = unknown>(options: CreateAdminPanelOptions = {}): AdminPanelDynara<User> => {

  const plugins: [AdminPanelPlugin<any>, any][] = []

  const uiBase = normalizeBasePath(options.basePath ?? "/admin")
  const state: PanelState = {
    uiBase,
    apiBase: "/api" + uiBase,
    title: options.title ?? "Dynara Admin",
    locale: options.locale ?? "en",
    isProduction: typeof __PRODUCTION__ !== "undefined" && __PRODUCTION__,
    pages: [],
    dashboardWidgets: [],
    componentFiles: new Map(),
    referenceMethods: new Map(),
    authMethod: null,
  }

  const plugin = async (app: Router) => {
    for (let childPlugin of plugins as any) {
      await childPlugin[0](plugin, ...childPlugin[1])
    }

    installAuthRoutes(state, app)
    installApiRoutes(state, app)

    // Отдаем index.html и ассеты для frontend
    const routesRaw = (app as any).routes
    await installFrontendRoutes(state, routesRaw)
    installComponentRoute(state, routesRaw)
  }

  plugin.createPage = <T extends object>(options: CreatePageOptions<User>) =>
    createPage<T, User>(state, options)

  plugin.register = <T extends any[]>(func: AdminPanelPlugin<T>, ...options: T) => {
    plugins.push([func, options])
  }

  plugin.registerAuthMethod = <T extends SchemaItem>(method: AuthMethod<T, User>) => {
    method.fields = unfoldSchema(method.fields) as T
    state.authMethod = method as unknown as AuthMethodInternal<User>
  }

  plugin.dashboard = (widgets: DashboardWidget<User>[]) => {
    for (const w of widgets) {
      if (w.type === "component") {
        // Register the .vue file for on-demand compilation + serving, like page
        // components. Keyed by widget index so identically-named files don't clash.
        const idx = Math.max(w.component.lastIndexOf("/"), w.component.lastIndexOf("\\"))
        const name = w.component.slice(idx + 1)
        const key = `dashboard__${state.dashboardWidgets.length}__${name}`
        state.componentFiles.set(key, w.component)
        state.dashboardWidgets.push({ ...w, component: key, data: w.data as any })
      } else {
        state.dashboardWidgets.push({ ...w })
      }
    }
  }

  return plugin as any
}

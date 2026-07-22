import { type Router, HTTPError } from "dynara";
// import type { ViteDevServer } from "vite";
// import frontendIndex from '../../frontend/index.html'
import type { BunRequest } from "bun";
import { join, normalize, sep, isAbsolute } from "node:path"
import { schema, unfoldSchema, unfoldTypeBoxSchema, type SchemaItem, type SchemaType } from "compact-json-schema";
import { resolveIcons } from "./icons.ts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// TypeBox rejects a string carrying a format it doesn't know, so the `file`
// format the panel's upload fields use must be registered (into the same
// registry dynara's validator reads — typebox is a shared peer). The value of a
// file field is whatever URL/id the page's upload handler returned — an opaque
// string — so the checker is permissive. Guarded so a host app's own
// registration wins.
//
// Date fields use dynara's native `date` type (declared as `"date"`), which
// validates and decodes to a JS Date on its own — no format registration here.
if (!FormatRegistry.Has("file")) {
  FormatRegistry.Set("file", () => true)
}

// Re-exported so consumers can `import { HTTPError } from "dynara-admin"` to reject requests.
export { HTTPError }

// The route path used for the home ("/") page. Kept in one place so the sentinel
// does not have to be spelled out by hand across the route builders.
const HOME_PATH = "__home__"

// The asset prefix baked into the frontend bundle at build time (see the
// frontend build's PUBLIC_PATH). When a custom `basePath` is configured the
// served index.html is rewritten from this prefix to the configured one.
const BUILD_ASSET_PREFIX = "/admin/assets/"

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

// Parses, validates and decodes the JSON-encoded `filter` query param against a
// page's TypeBox filter schema — the same validation engine dynara uses for
// request bodies, so `date` fields decode to `Date`, unknown keys are dropped,
// and type mismatches are rejected. Returns undefined when there's no filter,
// no schema, or nothing set; throws HTTPError(400) on malformed JSON or a value
// that violates the schema.
const parseFilter = (raw: string | undefined, check: any): Record<string, any> | undefined => {
  if (!raw || !check) return undefined
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HTTPError("Invalid filter", 400)
  }
  if (parsed == null || typeof parsed !== "object") return undefined
  let decoded: Record<string, any>
  try {
    decoded = Value.Parse(check, parsed) as Record<string, any>
  } catch {
    throw new HTTPError("Invalid filter", 400)
  }
  // Keep only the fields that are actually set, so `filter` carries just those.
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(decoded)) {
    if (value != null && value !== "") out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// Normalizes a configured UI base path: guarantees a leading slash and drops a
// trailing one ("admin" → "/admin", "/panel/" → "/panel").
const normalizeBasePath = (p: string) => {
  let s = p.trim()
  if (!s.startsWith("/")) s = "/" + s
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1)
  return s
}

type AdminPanelPlugin<T extends any[]> = (app: AdminPanel, ...options: T) => void | Promise<void>

type AuthMethod<T extends SchemaItem, User> = {
  title?: string,
  fields: T,
  // Resolves the submitted credentials to a bearer token, or null when they are invalid.
  onLogin: (data: SchemaType<T>) => { token: string } | null | Promise<{ token: string } | null>,
  // Resolves a bearer token to the authenticated user, or null → 401.
  onRequest: (token: string) => User | null | Promise<User | null>
}

// Non-generic view of an AuthMethod used inside the plugin. The public generic
// form is only needed at the `registerAuthMethod` boundary — instantiating
// `SchemaType<any>` in the route builders blows up TypeScript's depth limit.
type AuthMethodInternal<User> = {
  title?: string,
  fields: SchemaItem,
  onLogin: (data: any) => { token: string } | null | Promise<{ token: string } | null>,
  onRequest: (token: string) => User | null | Promise<User | null>
}

// Passed as the last argument to every page handler so implementations can read
// the authenticated user (authorization, audit logging, per-user scoping).
export type RequestContext<User = unknown> = { user: User }

// A per-user predicate deciding whether a user may access something. Receives the
// value `onRequest` resolved (`ctx.user`); the host owns the rule — no DB needed.
export type AccessFn<User = unknown> = (user: User) => boolean | Promise<boolean>

// A page's access policy. A bare function gates the whole page (visibility + every
// operation). The granular object form gates independently: `read` controls
// sidebar visibility and list/item data; `write` controls create/update and
// actions; `delete` controls delete. An unspecified facet defaults to allowed —
// so `{ write: isAdmin }` yields a read-only page for everyone else. Any facet
// that returns false makes its routes 403 and hides the matching UI affordance.
export type PageAccess<User = unknown> = AccessFn<User> | {
  read?: AccessFn<User>,
  write?: AccessFn<User>,
  delete?: AccessFn<User>,
}

// The normalized, always-present internal form.
type NormalizedAccess = { read: AccessFn<any>, write: AccessFn<any>, del: AccessFn<any> }
const allowAll: AccessFn<any> = () => true
const normalizeAccess = (access?: PageAccess<any>): NormalizedAccess | undefined => {
  if (!access) return undefined
  if (typeof access === "function") return { read: access, write: access, del: access }
  return { read: access.read ?? allowAll, write: access.write ?? allowAll, del: access.delete ?? allowAll }
}
// Resolves a single facet for a user (true when unrestricted / no policy).
const canAccess = async (access: NormalizedAccess | undefined, facet: keyof NormalizedAccess, user: any): Promise<boolean> => {
  if (!access) return true
  return !!(await access[facet](user))
}
// Throws 403 unless the user is allowed the given facet. `read` gates data GETs,
// `write` gates create/update/upload/actions, `del` gates delete.
const requireAccess = async (access: NormalizedAccess | undefined, facet: keyof NormalizedAccess, user: any) => {
  if (!(await canAccess(access, facet, user))) throw new HTTPError("Forbidden", 403)
}

// The list request shape handed to `.data()`. `sort`/`search`/`filter` are
// optional and only present when the frontend sends them. `filter` is the
// validated, decoded object described by the page's `.filters()` schema (dates
// arrive as `Date`); absent keys mean "not filtered".
//
// `cursor` is the primary key of the last row of the previous page. It is only
// sent for pages *without* a `.count()` — there the UI paginates by keyset
// (next/prev) instead of by page number, so the handler should return rows
// strictly after `cursor` in the current sort order (and ignore `skip`).
export type ListOptions<KeyType = any> = {
  take?: number,
  skip?: number,
  cursor?: KeyType,
  sort?: { field: string, dir: "asc" | "desc" },
  search?: string,
  filter?: Record<string, any>
}

// The `${apiBase}/pages/:path` response — the single source of truth for a
// page's metadata shape. The frontend's `FullPage` mirrors this (the two
// packages can't share a type until this one is published).
// A single select option returned by a reference method.
export type SelectOption = { value: any, label: string }

// The query a reference method receives. `search` is the user's current search
// text. `value` is set instead (search absent) when the frontend needs to
// resolve the label of an already-selected value — e.g. opening an edit form.
export type ReferenceQuery = { search?: string, value?: string }

// An async options source for a select field, declared inline in a form schema
// as `{ type, reference: async (query, ctx) => SelectOption[] }`. It is pulled
// out of the schema at registration time (see registerReferenceMethods), stored
// server-side, and exposed at `${apiBase}/select/:refId`; the serialized schema
// carries only a `{ method: refId }` descriptor, so it stays plain JSON.
export type ReferenceMethod<User = unknown> =
  (query: ReferenceQuery, ctx: RequestContext<User>) => SelectOption[] | Promise<SelectOption[]>

// A foreign-key reference source for a select field, as written in a form/filter
// schema: an async resolver, or a declarative pointer at another page's list.
export type SelectReference =
  | ReferenceMethod<any>
  | { page: string, label: string, value?: string }

// compact-json-schema exposes `SchemaAnnotations` — the set of keywords allowed
// on any typed schema object without changing its inferred type — and invites
// consumers to extend it by declaration merging. We register the keywords the
// panel's form/filter/action inputs read, so `{ type: "string", label,
// options }` and friends type-check inline (no `as const` or generic-inference
// dance needed). Purely a type-level change — `unfoldSchema` already passes
// these through at runtime.
declare module "compact-json-schema" {
  interface SchemaAnnotations {
    // Human-readable field label shown by the panel inputs (falls back to the key).
    label?: string
    // Static select options.
    options?: SelectOption[]
    // Async / cross-page select source (see SelectReference).
    reference?: SelectReference
    // Renderer hints: `format: "file" | "date" | "datetime"`, multiline text.
    format?: string
    multiline?: boolean
    // Path to a .vue file rendering this field instead of the built-in input
    // (compiled and served like page components). Paired with a real type it is
    // a custom input (the value validates and submits as that type); with
    // `type: "component"` it is display-only — see registerFormComponents.
    component?: string
  }
  // Registers `"component"` as a valid schema type: a display-only form block
  // rendered by a custom Vue component. It is stripped from request validation
  // (no value is submitted), hence the `unknown` mapping.
  interface SchemaTypesMap {
    component: unknown
  }
}

// The serializable form of a declared action, as delivered to the frontend in
// `PageMeta.actions`. The handler stays server-side; only its descriptor travels.
export type ActionMeta = {
  name: string,
  title: string,
  icon?: string,
  // When present, the UI opens a form dialog (built from this schema) before
  // invoking the action; otherwise the action runs immediately (or after a
  // plain confirm, if `confirm` is set).
  form?: { schema: SchemaItem },
  confirm?: string,
  danger?: boolean,
  // "row" (per-row, receives the row id), "toolbar" (page-level, no target),
  // or "bulk" (operates on the current checkbox selection).
  kind: "row" | "toolbar" | "bulk",
}

export type PageMeta = {
  title?: string,
  path?: string,
  table?: ColumnId<any, any>[],
  component?: string,
  primaryKey?: PropertyKey,
  createForm?: { schema: SchemaItem },
  updateForm?: { schema: SchemaItem },
  itemAccess: boolean,
  allowDelete?: true,
  // True when the page opted in via `createPage({ search: true })` — only then
  // does the UI show a search box (the panel can't know if `.data` honors search).
  search?: true,
  // True when the page declared a `.count()` resolver. Drives the pagination
  // mode: numbered (with a total) when set, keyset next/prev when not.
  hasCount?: true,
  actions?: ActionMeta[],
  // The form schema for the page's filter bar, declared via `.filters()`.
  filters?: { schema: SchemaItem },
}

// The value a `stat` widget's data resolver returns.
export type StatValue = { value: string | number, label?: string, delta?: number }

// A dashboard widget's serializable descriptor (sent to the frontend). The data
// resolver stays server-side; its result is fetched from `${apiBase}/dashboard/:i/data`.
export type DashboardWidgetMeta = {
  type: "stat" | "component",
  title?: string,
  icon?: string,
  // Grid columns to span (1–4); default 1.
  span?: number,
  // Page path a `stat` widget links to on click.
  link?: string,
  // Custom-component key a `component` widget renders (served from /custom/:name).
  component?: string,
  // Whether the widget has a server-side data resolver to fetch.
  hasData: boolean,
}

// A built-in stat card: a big number with an optional label, trend, icon, and link.
export type StatWidget<User = unknown> = {
  type: "stat",
  title: string,
  icon?: string,
  span?: number,
  link?: string,
  data: (ctx: RequestContext<User>) => StatValue | Promise<StatValue>,
}

// A custom Vue widget: a `.vue` file (compiled and served like a page component)
// that receives the resolved `data` as its `data` prop.
export type ComponentWidget<User = unknown> = {
  type: "component",
  title?: string,
  span?: number,
  component: string,
  data?: (ctx: RequestContext<User>) => any | Promise<any>,
}

export type DashboardWidget<User = unknown> = StatWidget<User> | ComponentWidget<User>

export type AdminPanel<User = unknown> = {
  createPage<T extends object>(options: CreatePageOptions<User>): PageWithPrimaryKey<T, string, T, User>,
  register<T extends any[]>(func: AdminPanelPlugin<T>, ...options: T): void
  registerAuthMethod<T extends SchemaItem>(method: AuthMethod<T, User>): void
  // Configure the home dashboard from a list of widgets (built-in stats and/or
  // custom Vue components). Replaces the default empty home page.
  dashboard(widgets: DashboardWidget<User>[]): void
}

export type AdminPanelDynara<User = unknown> = ((app: Router<any>) => Promise<void>) & AdminPanel<User>

type Ctx = RequestContext<any>

// Internal storage for a dashboard widget: its descriptor plus the server-side
// data resolver. For component widgets, `component` holds the registered key.
type DashboardWidgetEntry = {
  type: "stat" | "component",
  title?: string,
  icon?: string,
  span?: number,
  link?: string,
  component?: string,
  data?: (ctx: Ctx) => any,
}

// Internal storage for a declared action: its serializable descriptor plus the
// server-side handler and the (already-unfolded) form schema.
type ActionEntry = {
  name: string,
  title: string,
  icon?: string,
  confirm?: string,
  danger?: boolean,
  kind: "row" | "toolbar" | "bulk",
  schema?: SchemaItem,
  // The schema the route validates the body against: `schema` minus any
  // display-only component fields (identical when there are none).
  bodySchema?: SchemaItem,
  handler: (...args: any[]) => any,
}

type PageEntry = {
  title?: string,
  path?: string,
  group?: string,
  icon?: string,
  search?: boolean,
  access?: NormalizedAccess,
  actions: ActionEntry[],
  // The filter form schema (unfolded JSON, serialized to the frontend) and its
  // TypeBox validator (used to validate/decode the JSON-encoded `filter` param).
  filters?: any,
  filtersCheck?: any,
  table?: ColumnId<any, any>[],
  data?: (options: ListOptions, ctx: Ctx) => any[] | Promise<any[]>,
  // Optional unpaginated row count for the current filter/search. When present
  // the UI shows a total and numbered pagination; when absent it falls back to
  // keyset (next/prev) pagination via `ListOptions.cursor`.
  count?: (options: ListOptions, ctx: Ctx) => number | Promise<number>,
  itemData?: (id: any, ctx: Ctx) => Promise<any>,
  onInsert?: (obj: any, ctx: Ctx) => Promise<void>,
  onUpdate?: (key: any, obj: any, ctx: Ctx) => Promise<void>,
  onDelete?: (keys: any[], ctx: Ctx) => Promise<void>,
  createForm?: { schema: SchemaItem },
  updateForm?: { schema: SchemaItem },
  // What the create/update routes validate against: the form schema minus any
  // display-only component fields (same reference when there are none).
  createBodySchema?: SchemaItem,
  updateBodySchema?: SchemaItem,
  primaryKey?: PropertyKey,
  primaryKeyType?: SchemaItem,
  component?: string,
  componentData: { name: string, schema?: SchemaItem, method: (args: any, ctx: Ctx) => any }[],
  componentActions: { name: string, schema?: SchemaItem, method: (...args: any[]) => any }[],
  upload?: (file: File, ctx: Ctx & { field?: string }) => string | Promise<string>
}

declare const __PRODUCTION__: boolean

export const createAdminPanel = <User = unknown>(options: CreateAdminPanelOptions = {}): AdminPanelDynara<User> => {

  const plugins: [AdminPanelPlugin<any>, any][] = []
  const componentFiles = new Map<string, string>()

  const pages: PageEntry[] = []
  const dashboardWidgets: DashboardWidgetEntry[] = []
  // Reference methods extracted from form schemas (see registerReferenceMethods),
  // keyed by a page-qualified id and served from `${apiBase}/select/:refId`.
  const referenceMethods = new Map<string, ReferenceMethod<User>>()
  let authMethod: AuthMethodInternal<User> | null = null

  const isProduction = typeof __PRODUCTION__ !== "undefined" && __PRODUCTION__

  // Everything the panel serves derives from these — the UI base and the API
  // base are the only two prefixes that used to be hardcoded across the app.
  const uiBase = normalizeBasePath(options.basePath ?? "/admin")   // e.g. "/admin"
  const apiBase = "/api" + uiBase                                  // e.g. "/api/admin"
  const title = options.title ?? "Dynara Admin"
  const locale = options.locale ?? "en"

  // Normalizes a configured page path to the single URL segment used in routes.
  // "" / "/" → the home sentinel; a leading slash is stripped otherwise.
  const toRouteSegment = (path?: string) => {
    let p = path ?? ''
    if (p.startsWith('/')) p = p.slice(1)
    return p === '' ? HOME_PATH : p
  }

  // Walks an unfolded form schema and pulls out inline reference methods
  // (`reference: async (query, ctx) => ...`). Each is registered under a
  // page-qualified id and replaced in the schema with a serializable
  // `{ method: id }` descriptor, so the schema handed to the frontend stays
  // plain JSON. Recurses into object properties and array items.
  const sanitizeRefId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, "_")
  const registerReferenceMethods = (node: any, idPath: string) => {
    if (!node || typeof node !== "object") return
    if (typeof node.reference === "function") {
      const id = sanitizeRefId(idPath)
      referenceMethods.set(id, node.reference)
      node.reference = { method: id }
    }
    if (node.properties) {
      for (const [key, child] of Object.entries(node.properties)) {
        registerReferenceMethods(child, `${idPath}.${key}`)
      }
    }
    if (node.items) registerReferenceMethods(node.items, `${idPath}.items`)
  }

  // Walks an unfolded form schema and registers custom field components
  // (`component: "<path to .vue>"`) into the same compile-and-serve pipeline as
  // page components and dashboard widgets. The file path is replaced with the
  // served key, so the schema handed to the frontend stays plain JSON and never
  // leaks a server path. Recurses into object properties and array items.
  const registerFormComponents = (node: any, idPath: string) => {
    if (!node || typeof node !== "object") return
    if (typeof node.component === "string") {
      const key = sanitizeRefId(idPath)
      componentFiles.set(key, node.component)
      node.component = key
    }
    if (node.properties) {
      for (const [key, child] of Object.entries(node.properties)) {
        registerFormComponents(child, `${idPath}.${key}`)
      }
    }
    if (node.items) registerFormComponents(node.items, `${idPath}.items`)
  }

  // Returns a validation-safe copy of an unfolded form schema. Display-only
  // component fields (`type: "component"`) carry no submitted value, so they are
  // removed from `properties`/`required` before the schema reaches dynara —
  // whose TypeBox conversion has no factory for that type. Custom-input fields
  // (a real type plus a `component` annotation) are kept and validate as their
  // type. Returns the input unchanged when there is nothing to strip, so the
  // common no-component case shares the serialized UI schema.
  const stripComponentFields = (node: any): any => {
    if (!node || typeof node !== "object") return node
    let changed = false
    const out: any = { ...node }
    if (node.properties) {
      const properties: Record<string, any> = {}
      for (const [key, child] of Object.entries<any>(node.properties)) {
        if (child?.type === "component") { changed = true; continue }
        const stripped = stripComponentFields(child)
        if (stripped !== child) changed = true
        properties[key] = stripped
      }
      out.properties = properties
      if (Array.isArray(node.required)) {
        out.required = node.required.filter((key: string) => key in properties)
      }
    }
    if (node.items) {
      const items = stripComponentFields(node.items)
      if (items !== node.items) { changed = true; out.items = items }
    }
    return changed ? out : node
  }

  // Resolves the authenticated user from a request, or throws the HTTPError the
  // client should see. The token is read from the `Authorization: Bearer` header,
  // falling back to a `?token=` query param (browsers cannot set headers on a
  // dynamic `import()`, so `/admin/custom/*` relies on the query form).
  const authenticate = async (req: Request): Promise<User> => {
    let token = req.headers.get("Authorization")
    if (token?.startsWith("Bearer ")) token = token.slice(7)
    if (!token) token = new URL(req.url).searchParams.get("token")
    if (!token) throw new HTTPError("Authorization required", 403)
    const user = await authMethod!.onRequest(token)
    if (!user) throw new HTTPError("Invalid token", 401)
    return user
  }

  const plugin = async (app: Router) => {
    for (let childPlugin of plugins as any) {
      await childPlugin[0](plugin, ...childPlugin[1])
    }

    if (authMethod) {
      app.addHook("onRequest", async (req) => {
        // Exempt only the exact auth endpoint — matching a suffix would exempt any
        // URL ending in "/auth" (e.g. a string primary key or a componentData name).
        if (new URL(req.raw.url).pathname === `${apiBase}/auth`) return
        ;(req as any).user = await authenticate(req.raw)
      })

      app.get(`${apiBase}/auth`, () => {
        return { title: authMethod!.title, fields: authMethod!.fields }
      })
      const loginSchema: SchemaItem = authMethod.fields
      app.post(`${apiBase}/auth`, [{}, loginSchema], async (req) => {
        const result = await authMethod!.onLogin(req.body)
        if (!result) throw new HTTPError("Invalid credentials", 401)
        return { token: result.token }
      })
    }

    app.get(`${apiBase}/pages`, async (req) => {
      const user = (req as any).user
      const visible = []
      for (const p of pages) {
        // Hide pages the user can't read from the sidebar.
        if (!(await canAccess(p.access, "read", user))) continue
        visible.push({ path: p.path, title: p.title, group: p.group, icon: p.icon })
      }
      return visible
    })

    for (let page of pages) {
      // The cursor query param is a primary key, so it's typed to match (numbers
      // coerce from the query string just like `take`); pages with a non-scalar
      // key fall back to a raw string.
      const cursorType = page.primaryKeyType === "number" ? "number?" : "string?"
      const querySchema = schema({
        take: "number?",
        skip: "number?",
        // Keyset cursor: the primary key of the previous page's last row. Only
        // sent for pages without a `.count()`.
        cursor: cursorType,
        sortField: "string?",
        sortDir: "string?",
        search: "string?",
        // A JSON-encoded object of filter values (validated against page.filtersCheck).
        filter: "string?",
      })
      const path = toRouteSegment(page.path)

      // Builds the ListOptions shared by the items and count endpoints. `count`
      // ignores pagination (take/skip/cursor), but reuses sort/search/filter.
      const readListOptions = (req: any): ListOptions => {
        const q = req.query as { take?: number, skip?: number, cursor?: any, sortField?: string, sortDir?: string, search?: string, filter?: string }
        return {
          take: q.take,
          skip: q.skip,
          cursor: q.cursor,
          sort: q.sortField ? { field: q.sortField, dir: q.sortDir === "asc" ? "asc" : "desc" } : undefined,
          search: q.search,
          filter: parseFilter(q.filter, page.filtersCheck),
        }
      }

      if (page.data) {
        app.get(`${apiBase}/data/${path}/items`, [{}, querySchema], async (req) => {
          await requireAccess(page.access, "read", (req as any).user)
          const items = await page.data!(readListOptions(req), { user: (req as any).user })
          return { items }
        })
      }

      if (page.count) {
        app.get(`${apiBase}/data/${path}/count`, [{}, querySchema], async (req) => {
          await requireAccess(page.access, "read", (req as any).user)
          const total = await page.count!(readListOptions(req), { user: (req as any).user })
          return { total }
        })
      }

      const paramsSchema = schema({ itemId: page.primaryKeyType ?? 'string' })
      if (page.itemData) {
        app.get(`${apiBase}/data/${path}/items/:itemId`, [ paramsSchema ], async (req) => {
          await requireAccess(page.access, "read", (req as any).user)
          return await page.itemData!(req.params.itemId, { user: (req as any).user })
        })
      }

      if (page.createForm && page.onInsert) {
        app.post(`${apiBase}/data/${path}/items`, [{}, page.createBodySchema!], async (req) => {
          await requireAccess(page.access, "write", (req as any).user)
          await page.onInsert!(req.body, { user: (req as any).user })
        })
      }

      if (page.updateForm && page.onUpdate) {
        app.post(`${apiBase}/data/${path}/items/:itemId`, [paramsSchema, page.updateBodySchema!], async (req) => {
          await requireAccess(page.access, "write", (req as any).user)
          await page.onUpdate!(req.params.itemId, req.body, { user: (req as any).user })
        })
      }

      if (page.onDelete) {
        const deleteSchema = schema({ itemIds: { type: "array", items: page.primaryKeyType ?? 'string' } })

        app.delete(`${apiBase}/data/${path}/items`, [{}, deleteSchema], async (req) => {
          await requireAccess(page.access, "del", (req as any).user)
          await page.onDelete!((req.body as any).itemIds, { user: (req as any).user })
        })
      }

      for (let data of page.componentData) {
        app.get(`${apiBase}/data/${path}/component-data/${data.name}`, { query: data.schema }, async (req) => {
          await requireAccess(page.access, "read", (req as any).user)
          return await data.method(req.query as any, { user: (req as any).user })
        })
      }

      if (page.upload) {
        // Multipart upload. No body schema is declared, so dynara leaves the raw
        // body untouched and we read the file off req.raw ourselves. The handler
        // stores it however it likes and returns the URL/id saved as the value.
        app.post(`${apiBase}/data/${path}/upload`, async (req) => {
          await requireAccess(page.access, "write", (req as any).user)
          const form = await (req as any).raw.formData()
          const file = form.get("file")
          if (!(file instanceof File)) throw new HTTPError("No file uploaded", 400)
          const field = form.get("field")
          const url = await page.upload!(file, {
            user: (req as any).user,
            field: typeof field === "string" ? field : undefined,
          })
          return { url }
        })
      }

      for (let action of page.componentActions) {
        const route = `${apiBase}/data/${path}/component-action/${action.name}`
        if (action.schema) {
          // Payload action: validate the body, then hand (data, ctx) to the handler.
          app.post(route, [{}, action.schema], async (req) => {
            await requireAccess(page.access, "write", (req as any).user)
            return await action.method(req.body, { user: (req as any).user })
          })
        } else {
          // No-payload action: the handler receives just the context.
          app.post(route, async (req) => {
            await requireAccess(page.access, "write", (req as any).user)
            return await action.method({ user: (req as any).user })
          })
        }
      }

      // Declared actions. Row/bulk actions read their target(s) from the query
      // (itemId / comma-separated itemIds, coerced to the primary-key type);
      // toolbar actions have none. A `form` schema, when present, validates the
      // JSON body — the payload passed to the handler as its `data` argument.
      const coerceKey = (raw: string): any => (page.primaryKeyType === "number" ? Number(raw) : raw)
      const actionQuerySchema = schema({ itemId: "string?", itemIds: "string?" })
      for (let action of page.actions) {
        const route = `${apiBase}/data/${path}/actions/${action.name}`
        const run = async (req: any) => {
          await requireAccess(page.access, "write", req.user)
          const ctx = { user: req.user }
          const q = req.query as { itemId?: string, itemIds?: string }
          // `data` is the validated form body, or undefined for a formless action.
          const data = action.schema ? req.body : undefined
          if (action.kind === "bulk") {
            const ids = (q.itemIds ?? "").split(",").filter(Boolean).map(coerceKey)
            return await action.handler(ids, data, ctx)
          }
          if (action.kind === "toolbar") {
            return await action.handler(data, ctx)
          }
          const id = q.itemId != null ? coerceKey(q.itemId) : undefined
          return await action.handler(id, data, ctx)
        }
        app.post(route, action.schema ? { query: actionQuerySchema, body: action.bodySchema! } : { query: actionQuerySchema }, run)
      }

      app.get(`${apiBase}/pages/${path}`, async (req): Promise<PageMeta> => {
        const user = (req as any).user
        // Can't read → the page is off-limits entirely.
        await requireAccess(page.access, "read", user)
        // Compute the write/delete facets once and omit the affordances the user
        // lacks, so the UI naturally hides Add / Edit / Delete / actions.
        const canWrite = await canAccess(page.access, "write", user)
        const canDelete = await canAccess(page.access, "del", user)
        return {
          title: page.title,
          path: page.path,
          table: page.table,
          component: page.component,
          primaryKey: page.primaryKey,
          createForm: canWrite ? page.createForm : undefined,
          updateForm: canWrite ? page.updateForm : undefined,
          itemAccess: !!page.itemData,
          allowDelete: (page.onDelete && canDelete) ? true : undefined,
          search: page.search ? true : undefined,
          hasCount: page.count ? true : undefined,
          actions: (canWrite && page.actions.length > 0)
            ? page.actions.map((a): ActionMeta => ({
                name: a.name,
                title: a.title,
                icon: a.icon,
                confirm: a.confirm,
                danger: a.danger,
                kind: a.kind,
                form: a.schema ? { schema: a.schema } : undefined,
              }))
            : undefined,
          filters: page.filters ? { schema: page.filters } : undefined,
        }
      })
    }

    // Dashboard: the widget list (descriptors) plus a per-widget data endpoint.
    if (dashboardWidgets.length > 0) {
      app.get(`${apiBase}/dashboard`, async () =>
        dashboardWidgets.map((w): DashboardWidgetMeta => ({
          type: w.type,
          title: w.title,
          icon: w.icon,
          span: w.span,
          link: w.link,
          component: w.component,
          hasData: !!w.data,
        }))
      )
      app.get(`${apiBase}/dashboard/:index/data`, [schema({ index: "number" })], async (req) => {
        const widget = dashboardWidgets[req.params.index]
        if (!widget || !widget.data) throw new HTTPError("Not found", 404)
        return await widget.data({ user: (req as any).user })
      })
    }

    // Async options for select fields declared with an inline `reference` method.
    // One route serves every form's reference methods, keyed by page-qualified id.
    if (referenceMethods.size > 0) {
      const selectQuerySchema = schema({ search: "string?", value: "string?" })
      app.get(`${apiBase}/select/:refId`, [schema({ refId: "string" }), selectQuerySchema], async (req) => {
        const method = referenceMethods.get(req.params.refId)
        if (!method) throw new HTTPError("Unknown reference", 404)
        const q = req.query as ReferenceQuery
        const items = await method({ search: q.search, value: q.value }, { user: (req as any).user })
        return { items }
      })
    }

    const routesRaw = (app as any).routes
    // Отдаем index.html и ассеты для frontend
    if (true || isProduction) {
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
      // above still work; only the panel UI is unavailable.
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
        `window.__DYNARA_TITLE__=${JSON.stringify(title)}`,
        `window.__DYNARA_LOCALE__=${JSON.stringify(locale)}`,
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
    } else {
      // routesRaw["/admin/*"] = frontendIndex
      // routesRaw["/admin"] = frontendIndex
    }

    routesRaw[`${uiBase}/custom/:name`] = {
      GET: async (req: BunRequest) => {
        // This route is registered on the raw Bun router, so the dynara onRequest
        // hook never runs — authenticate explicitly when a method is configured.
        if (authMethod) {
          try {
            await authenticate(req)
          } catch (e) {
            if (e instanceof HTTPError) return new Response(e.message, { status: e.statusCode })
            throw e
          }
        }

        const file = componentFiles.get(req.params.name)
        if (!file) return new Response("Not found", { status: 404 })

        let code = isProduction ? compiled.get(file) : undefined
        if (!code) {
          code = await compileComponent(file)
          if (isProduction) compiled.set(file, code)
        }
        return new Response(code, {
          headers: {
            "Content-Type": "text/javascript",
            "Cache-Control": isProduction ? "public, max-age=31536000, immutable" : "no-cache",
          },
        })
      }
    }
  }

  const compiled = new Map<string, string>()   // кэш только для prod
  const compileComponent = async (file: string) => {

    const { VuePlugin } = await import("../../plugins/vue-plugin")

    const res = await Bun.build({
      entrypoints: [file],
      external: ["vue", "vue-router", "dynara-admin/ui"],
      target: "browser",
      format: "esm",
      minify: isProduction,
      define: { "process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development") },
      plugins: [VuePlugin({ inlineStyles: true })],
    })
    if (!res.success) throw new Error(res.logs.join("\n"))
    return await res.outputs[0].text()
  }

  plugin.createPage = <T extends object>(options: CreatePageOptions<User>) => {

    // Reject characters that would break the route template, and duplicate paths
    // (two pages on the same path would silently collide on their routes).
    const segment = toRouteSegment(options.path)
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
      throw new Error(`Invalid page path "${options.path ?? ''}": only letters, digits, "-" and "_" are allowed`)
    }
    if (pages.some(p => toRouteSegment(p.path) === segment)) {
      throw new Error(`Duplicate page path "${options.path ?? ''}"`)
    }

    const currentPage: PageEntry = {
      path: options.path,
      title: options.title,
      group: options.group,
      icon: options.icon,
      search: options.search,
      access: normalizeAccess(options.access),
      actions: [],
      componentData: [],
      componentActions: [],
    }
    pages.push(currentPage)

    const data: PageWithPrimaryKey<T, string, T, User> = {
      table(table) {
        currentPage.table = table as any
        return this
      },
      primaryKey(key, type?: SchemaItem){
        currentPage.primaryKey = key
        currentPage.primaryKeyType = type ?? "string"
        return this as any
      },
      data(query) {
        currentPage.data = query as any
        return this as any
      },
      count(query) {
        currentPage.count = query as any
        return this as any
      },
      item(query) {
        currentPage.itemData = query as any
        return this as any
      },
      createForm(schema, onInsert) {
        const unfolded = unfoldSchema(schema)
        registerReferenceMethods(unfolded, `${segment}.create`)
        registerFormComponents(unfolded, `${segment}.create`)
        currentPage.createForm = { schema: unfolded }
        currentPage.createBodySchema = stripComponentFields(unfolded)
        currentPage.onInsert = onInsert as any
        return this
      },
      updateForm(schema, onUpdate) {
        const unfolded = unfoldSchema(schema)
        registerReferenceMethods(unfolded, `${segment}.update`)
        registerFormComponents(unfolded, `${segment}.update`)
        currentPage.updateForm = { schema: unfolded }
        currentPage.updateBodySchema = stripComponentFields(unfolded)
        currentPage.onUpdate = onUpdate as any
        return this as any
      },
      onDelete(onDelete) {
        currentPage.onDelete = onDelete as any
        return this as any
      },
      filters(filterSchema: SchemaItem) {
        // Unfolded JSON schema for rendering the filter bar. Strip any `required`
        // so every filter is apply-if-set (the UI submits only touched fields).
        const unfolded = unfoldSchema(filterSchema)
        if (unfolded && typeof unfolded === "object" && "required" in unfolded) delete (unfolded as any).required
        registerReferenceMethods(unfolded, `${segment}.filter`)
        currentPage.filters = unfolded
        // TypeBox validator for incoming values (also decodes dates); likewise
        // made all-optional so a partial filter validates.
        const tb = unfoldTypeBoxSchema(filterSchema)
        if (tb && Array.isArray(tb.required)) tb.required = []
        currentPage.filtersCheck = tb
        return this
      },
      action(name: string, config: any, handler: any) {
        let schema: SchemaItem | undefined
        let bodySchema: SchemaItem | undefined
        if (config.form) {
          schema = unfoldSchema(config.form)
          // Action forms can carry inline `reference` selects and custom field
          // components too — extract both so the schema handed to the frontend
          // stays plain JSON.
          registerReferenceMethods(schema, `${segment}.action.${name}`)
          registerFormComponents(schema, `${segment}.action.${name}`)
          bodySchema = stripComponentFields(schema)
        }
        currentPage.actions.push({
          name,
          title: config.title,
          icon: config.icon,
          confirm: config.confirm,
          danger: config.danger,
          kind: config.bulk ? "bulk" : (config.placement === "toolbar" ? "toolbar" : "row"),
          schema,
          bodySchema,
          handler,
        })
        return this as any
      },
      component(path: string) {
        const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
        const name = path.slice(index+1)
        // Key by page segment + file name so identically-named component files on
        // different pages don't overwrite each other.
        const key = `${segment}__${name}`
        currentPage.component = key
        componentFiles.set(key, path)
        return this
      },
      componentData(...args: any) {
        if (args.length === 2) {
          currentPage.componentData.push({ name: args[0], method: args[1] })
        } else {
          currentPage.componentData.push({ name: args[0], schema: args[1], method: args[2] })
        }
        return this
      },
      componentAction(...args: any) {
        if (args.length === 2) {
          currentPage.componentActions.push({ name: args[0], method: args[1] })
        } else {
          currentPage.componentActions.push({ name: args[0], schema: args[1], method: args[2] })
        }
        return this
      },
      upload(handler: any) {
        currentPage.upload = handler
        return this
      }
    }
    return data
  }

  plugin.register = <T extends any[]>(func: AdminPanelPlugin<T>, ...options: T) => {
    plugins.push([func, options])
  }

  plugin.registerAuthMethod = <T extends SchemaItem>(method: AuthMethod<T, User>) => {
    method.fields = unfoldSchema(method.fields) as T
    authMethod = method as unknown as AuthMethodInternal<User>
  }

  plugin.dashboard = (widgets: DashboardWidget<User>[]) => {
    for (const w of widgets) {
      if (w.type === "component") {
        // Register the .vue file for on-demand compilation + serving, like page
        // components. Keyed by widget index so identically-named files don't clash.
        const idx = Math.max(w.component.lastIndexOf("/"), w.component.lastIndexOf("\\"))
        const name = w.component.slice(idx + 1)
        const key = `dashboard__${dashboardWidgets.length}__${name}`
        componentFiles.set(key, w.component)
        dashboardWidgets.push({ ...w, component: key, data: w.data as any })
      } else {
        dashboardWidgets.push({ ...w })
      }
    }
  }

  return plugin as any
}

type CreateAdminPanelOptions = {
  // Where the panel UI is mounted. The API is served under "/api" + basePath.
  // Default "/admin" (→ API under "/api/admin").
  basePath?: string
  // Shown in the sidebar / document title.
  title?: string
  // UI language. Default "en".
  locale?: "en" | "ru"
}

type CreatePageOptions<User = unknown> = {
  title?: string
  path?: string
  // Sidebar section this page is listed under. Pages without a group are
  // listed first, ungrouped, in registration order.
  group?: string
  // Icon name (from the built-in icon set) shown next to the sidebar link.
  icon?: string
  // Opt in to the list search box. The panel can't tell whether a page's
  // `.data` honors the `search` option, so it only renders the input when this
  // is set. The `.data` handler is responsible for actually filtering.
  search?: boolean
  // Per-user access policy. A predicate gates the whole page; the granular
  // `{ read, write, delete }` form gates each facet. The panel hides pages /
  // affordances the user can't reach and rejects the matching routes with 403.
  access?: PageAccess<User>
}

// Shared descriptor for a declared action, minus the target-specific handler.
// `form` is a plain `SchemaItem` (not a generic) — the many action overloads
// would otherwise instantiate `SchemaType<S>` deeply enough to blow TypeScript's
// recursion limit, the same reason the route builders avoid it. The handler's
// `data` argument is therefore typed loosely; validate it via the schema.
type ActionConfigBase = {
  // Button label (and dialog title when a form is shown).
  title: string
  // Icon name from the built-in set, shown on the action button.
  icon?: string
  // Opens a form dialog built from this schema before running; the validated
  // body is passed to the handler as `data`.
  form?: SchemaItem
  // Plain-text confirmation shown before running (ignored when `form` is set —
  // the form dialog is itself the confirmation step).
  confirm?: string
  // Style the action as destructive (red).
  danger?: boolean
}

type RowActionConfig = ActionConfigBase & { placement?: "row", bulk?: false }
type ToolbarActionConfig = ActionConfigBase & { placement: "toolbar", bulk?: false }
type BulkActionConfig = ActionConfigBase & { bulk: true }

interface ColumnBase {
  title: string
  width?: number | `${number}fr`
}

// A cell renderer hint for a field column. Omitted → the raw value as text.
//   boolean → ✓ / ✗   | date → localized date (`format: "datetime"` adds time)
//   badge   → colored pill (`colors` maps value → color name/hex)
//   image   → thumbnail (value is the src) | money → `currency`-formatted number
type ColumnType = "text" | "boolean" | "date" | "badge" | "image" | "money"

type FieldColumn<T> = ColumnBase & {
  field: keyof T
  sortable?: boolean
  type?: ColumnType
  format?: "date" | "datetime"
  currency?: string
  colors?: Record<string, string>
}

type TemplateColumn<T> = ColumnBase & {
  template: string
}

type ActionColumn<T, KeyType> = ColumnBase & {
  icon?: string,
  text?: string,
  onClick: (itemId: KeyType) => Promise<void> | void
}

type Column<T> = FieldColumn<T> | TemplateColumn<T>
type ColumnId<T, KeyType> = Column<T> | ActionColumn<T, KeyType>

interface Page<T extends object, User = unknown> {
  table(table: Column<T>[]): this,
  createForm<S extends SchemaItem>(schema: S, onInsert: (data: SchemaType<S>, ctx: RequestContext<User>) => Promise<void>): this,
  primaryKey<KeyType extends SchemaItem = "string">(key: keyof T, type?: KeyType): PageWithPrimaryKey<T, SchemaType<KeyType>, T, User>,
  // The list resolver: returns the current page of rows as a plain array. The
  // unpaginated total is a separate concern — declare `.count()` for it. When no
  // `.count()` is set, the UI paginates by keyset and `ListOptions.cursor` (the
  // previous page's last primary key) arrives here instead of `skip`.
  data<T2 extends object>(query: (options: ListOptions, ctx: RequestContext<User>) => T2[] | Promise<T2[]>): Page<T2, User>,
  // Optional: the unpaginated row count for the given filter/search (pagination
  // fields are irrelevant). Declaring it switches the UI to numbered pagination
  // with a total; without it the UI uses keyset next/prev. Kept separate from
  // `.data()` so the (often expensive) count isn't recomputed on every page flip.
  count(query: (options: ListOptions, ctx: RequestContext<User>) => number | Promise<number>): this,
  component(url: any): this
  componentData(name: string, data: (args: Record<string,any>, ctx: RequestContext<User>) => Promise<any> | any): this
  componentData<S extends SchemaItem>(name: string, schema: S, data: (args: SchemaType<S>, ctx: RequestContext<User>) => Promise<any> | any): this
  componentAction(name: string, handler: (ctx: RequestContext<User>) => Promise<any> | any): this
  componentAction<S extends SchemaItem>(name: string, schema: S, handler: (data: SchemaType<S>, ctx: RequestContext<User>) => Promise<any> | any): this
  // Handle file uploads for `{ format: "file" }` form fields. Store the file and
  // return the URL/id that becomes the field value. `ctx.field` is the field name.
  upload(handler: (file: File, ctx: RequestContext<User> & { field?: string }) => string | Promise<string>): this
  // Declare the page's filter bar. Uses the same compact-json-schema format as
  // forms (selects via `options`/`reference`, booleans, dates, …); every field
  // should be optional, since a filter only applies when set. The submitted,
  // validated values arrive on the `.data()` list options as `filter`. Inline
  // `options`/`label`/`reference` type-check thanks to the SchemaAnnotations
  // augmentation above.
  filters(schema: SchemaItem): this
  // Toolbar (page-level) action — rendered as a button above the table, receives
  // no target row. With a `form`, the handler also receives the collected `data`
  // as its first argument. Its return value's `message`, if any, is shown as a toast.
  action(name: string, config: ToolbarActionConfig, handler: (data: any, ctx: RequestContext<User>) => any): this
}

interface PageWithPrimaryKey<T extends object, KeyType, Item extends object, User = unknown> extends Page<T, User> {
  table(table: ColumnId<T, KeyType>[]): this,
  item<T2 extends object>(query: (itemId: KeyType, ctx: RequestContext<User>) => Promise<T2 | null>): PageWithPrimaryKey<T, KeyType, T2, User>,
  updateForm<S extends SchemaItem>(schema: S, onUpdate: (id: KeyType, data: SchemaType<S>, ctx: RequestContext<User>) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item, User>,
  onDelete(onDelete: (ids: KeyType[], ctx: RequestContext<User>) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item, User>
  // Row action — rendered per row (hover buttons + the edit dialog footer),
  // receives that row's primary key. With `form`, a dialog collects `data`
  // first (passed as the second argument). The handler's returned `message`,
  // if any, is shown as a toast.
  action(name: string, config: RowActionConfig, handler: (id: KeyType, data: any, ctx: RequestContext<User>) => any): this
  // Bulk action — rendered next to Delete when rows are checked, receives the
  // selected primary keys (and collected `data` when a `form` is set).
  action(name: string, config: BulkActionConfig, handler: (ids: KeyType[], data: any, ctx: RequestContext<User>) => any): this
  // Toolbar action (inherited shape from Page, restated so this interface's
  // `action` remains assignable to the base).
  action(name: string, config: ToolbarActionConfig, handler: (data: any, ctx: RequestContext<User>) => any): this
}

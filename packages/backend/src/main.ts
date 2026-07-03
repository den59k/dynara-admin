import { type Router, HTTPError } from "dynara";
// import type { ViteDevServer } from "vite";
// import frontendIndex from '../../frontend/index.html'
import type { BunRequest } from "bun";
import { join, normalize, sep, isAbsolute } from "node:path"
import { schema, unfoldSchema, type SchemaItem, type SchemaType } from "compact-json-schema";

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

// The list request shape handed to `.data()`. `sort`/`search` are optional and
// only present when the frontend sends them.
export type ListOptions = {
  take?: number,
  skip?: number,
  sort?: { field: string, dir: "asc" | "desc" },
  search?: string
}

// The list response shape. `total` is the unpaginated row count so the UI can paginate.
export type ListResult<T> = { items: T[], total: number }

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
}

export type AdminPanel<User = unknown> = {
  createPage<T extends object>(options: CreatePageOptions): PageWithPrimaryKey<T, string, T, User>,
  register<T extends any[]>(func: AdminPanelPlugin<T>, ...options: T): void
  registerAuthMethod<T extends SchemaItem>(method: AuthMethod<T, User>): void
}

export type AdminPanelDynara<User = unknown> = ((app: Router<any>) => Promise<void>) & AdminPanel<User>

type Ctx = RequestContext<any>

type PageEntry = {
  title?: string,
  path?: string,
  group?: string,
  icon?: string,
  table?: ColumnId<any, any>[],
  data?: (options: ListOptions, ctx: Ctx) => ListResult<any> | Promise<ListResult<any>>,
  itemData?: (id: any, ctx: Ctx) => Promise<any>,
  onInsert?: (obj: any, ctx: Ctx) => Promise<void>,
  onUpdate?: (key: any, obj: any, ctx: Ctx) => Promise<void>,
  onDelete?: (keys: any[], ctx: Ctx) => Promise<void>,
  createForm?: { schema: SchemaItem },
  updateForm?: { schema: SchemaItem },
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
      return pages.map(p => ({
        path: p.path,
        title: p.title,
        group: p.group,
        icon: p.icon
      }))
    })

    for (let page of pages) {
      const querySchema = schema({
        take: "number?",
        skip: "number?",
        sortField: "string?",
        sortDir: "string?",
        search: "string?",
      })
      const path = toRouteSegment(page.path)

      if (page.data) {
        app.get(`${apiBase}/data/${path}/items`, [{}, querySchema], async (req) => {
          const q = req.query as { take?: number, skip?: number, sortField?: string, sortDir?: string, search?: string }
          const options: ListOptions = {
            take: q.take,
            skip: q.skip,
            sort: q.sortField ? { field: q.sortField, dir: q.sortDir === "asc" ? "asc" : "desc" } : undefined,
            search: q.search,
          }
          return await page.data!(options, { user: (req as any).user })
        })
      }

      const paramsSchema = schema({ itemId: page.primaryKeyType ?? 'string' })
      if (page.itemData) {
        app.get(`${apiBase}/data/${path}/items/:itemId`, [ paramsSchema ], async (req) => {
          return await page.itemData!(req.params.itemId, { user: (req as any).user })
        })
      }

      if (page.createForm && page.onInsert) {
        app.post(`${apiBase}/data/${path}/items`, [{}, page.createForm.schema], async (req) => {
          await page.onInsert!(req.body, { user: (req as any).user })
        })
      }

      if (page.updateForm && page.onUpdate) {
        app.post(`${apiBase}/data/${path}/items/:itemId`, [paramsSchema, page.updateForm.schema], async (req) => {
          await page.onUpdate!(req.params.itemId, req.body, { user: (req as any).user })
        })
      }

      if (page.onDelete) {
        const deleteSchema = schema({ itemIds: { type: "array", items: page.primaryKeyType ?? 'string' } })

        app.delete(`${apiBase}/data/${path}/items`, [{}, deleteSchema], async (req) => {
          await page.onDelete!((req.body as any).itemIds, { user: (req as any).user })
        })
      }

      for (let data of page.componentData) {
        app.get(`${apiBase}/data/${path}/component-data/${data.name}`, { query: data.schema }, async (req) => {
          return await data.method(req.query as any, { user: (req as any).user })
        })
      }

      if (page.upload) {
        // Multipart upload. No body schema is declared, so dynara leaves the raw
        // body untouched and we read the file off req.raw ourselves. The handler
        // stores it however it likes and returns the URL/id saved as the value.
        app.post(`${apiBase}/data/${path}/upload`, async (req) => {
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
            return await action.method(req.body, { user: (req as any).user })
          })
        } else {
          // No-payload action: the handler receives just the context.
          app.post(route, async (req) => {
            return await action.method({ user: (req as any).user })
          })
        }
      }

      app.get(`${apiBase}/pages/${path}`, async (req): Promise<PageMeta> => {
        return {
          title: page.title,
          path: page.path,
          table: page.table,
          component: page.component,
          primaryKey: page.primaryKey,
          createForm: page.createForm,
          updateForm: page.updateForm,
          itemAccess: !!page.itemData,
          allowDelete: page.onDelete ? true: undefined
        }
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

      if (pages.find(i => i.path === '/')) {
        code.push(`window.__DYNARA_CUSTOM_HOME_PAGE__ = true`)
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

  plugin.createPage = <T extends object>(options: CreatePageOptions) => {

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
      item(query) {
        currentPage.itemData = query as any
        return this as any
      },
      createForm(schema, onInsert) {
        const unfolded = unfoldSchema(schema)
        registerReferenceMethods(unfolded, `${segment}.create`)
        currentPage.createForm = { schema: unfolded }
        currentPage.onInsert = onInsert as any
        return this
      },
      updateForm(schema, onUpdate) {
        const unfolded = unfoldSchema(schema)
        registerReferenceMethods(unfolded, `${segment}.update`)
        currentPage.updateForm = { schema: unfolded }
        currentPage.onUpdate = onUpdate as any
        return this as any
      },
      onDelete(onDelete) {
        currentPage.onDelete = onDelete as any
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

type CreatePageOptions = {
  title?: string
  path?: string
  // Sidebar section this page is listed under. Pages without a group are
  // listed first, ungrouped, in registration order.
  group?: string
  // Icon name (from the built-in icon set) shown next to the sidebar link.
  icon?: string
}

interface ColumnBase {
  title: string
  width?: number | `${number}fr`
}

type FieldColumn<T> = ColumnBase & {
  field: keyof T
  sortable?: boolean
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
  data<T2 extends object>(query: (options: ListOptions, ctx: RequestContext<User>) => ListResult<T2> | Promise<ListResult<T2>>): Page<T2, User>,
  component(url: any): this
  componentData(name: string, data: (args: Record<string,any>, ctx: RequestContext<User>) => Promise<any> | any): this
  componentData<S extends SchemaItem>(name: string, schema: S, data: (args: SchemaType<S>, ctx: RequestContext<User>) => Promise<any> | any): this
  componentAction(name: string, handler: (ctx: RequestContext<User>) => Promise<any> | any): this
  componentAction<S extends SchemaItem>(name: string, schema: S, handler: (data: SchemaType<S>, ctx: RequestContext<User>) => Promise<any> | any): this
  // Handle file uploads for `{ format: "file" }` form fields. Store the file and
  // return the URL/id that becomes the field value. `ctx.field` is the field name.
  upload(handler: (file: File, ctx: RequestContext<User> & { field?: string }) => string | Promise<string>): this
}

interface PageWithPrimaryKey<T extends object, KeyType, Item extends object, User = unknown> extends Page<T, User> {
  table(table: ColumnId<T, KeyType>[]): this,
  item<T2 extends object>(query: (itemId: KeyType, ctx: RequestContext<User>) => Promise<T2 | null>): PageWithPrimaryKey<T, KeyType, T2, User>,
  updateForm<S extends SchemaItem>(schema: S, onUpdate: (id: KeyType, data: SchemaType<S>, ctx: RequestContext<User>) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item, User>,
  onDelete(onDelete: (ids: KeyType[], ctx: RequestContext<User>) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item, User>
}

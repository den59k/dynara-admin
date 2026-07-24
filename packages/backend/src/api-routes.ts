// The JSON API: the sidebar page list, every per-page data/form/action route,
// the dashboard endpoints, and the shared select (reference) endpoint.

import { HTTPError, type Router } from "dynara"
import { schema } from "compact-json-schema"
import { canAccess, requireAccess } from "./access.ts"
import { parseFilter } from "./form-schema.ts"
import { toRouteSegment } from "./paths.ts"
import type { ActionMeta, DashboardWidgetMeta, ListOptions, PageEntry, PageMeta, PanelState, ReferenceQuery } from "./types.ts"

export const installApiRoutes = (state: PanelState, app: Router) => {
  const { apiBase, pages, dashboardWidgets, referenceMethods } = state

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

  for (const page of pages) {
    installPageRoutes(apiBase, app, page)
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
    // `values` travels comma-separated (the same wire form bulk actions use for
    // itemIds) and reaches the method as a string array.
    const selectQuerySchema = schema({ search: "string?", value: "string?", values: "string?" })
    app.get(`${apiBase}/select/:refId`, [schema({ refId: "string" }), selectQuerySchema], async (req) => {
      const method = referenceMethods.get(req.params.refId)
      if (!method) throw new HTTPError("Unknown reference", 404)
      const q = req.query as { search?: string, value?: string, values?: string }
      const values = q.values != null ? q.values.split(",").filter(Boolean) : undefined
      const query: ReferenceQuery = {
        search: q.search,
        value: q.value,
        values: values && values.length > 0 ? values : undefined,
      }
      const items = await method(query, { user: (req as any).user })
      return { items }
    })
  }
}

const installPageRoutes = (apiBase: string, app: Router, page: PageEntry) => {
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

  for (const data of page.componentData) {
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

  for (const action of page.componentActions) {
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
  for (const action of page.actions) {
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

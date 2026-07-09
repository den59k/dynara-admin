import { describe, it, expect } from "bun:test"
import { join, normalize } from "node:path"
import { Router } from "dynara"
// HTTPError is imported from the package entry to exercise the documented re-export.
import { createAdminPanel, HTTPError, resolveAssetPath } from "../src/main"

type User = { id: number; name: string }

const seedUsers = (): User[] => [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Carol" },
]

// Builds a dynara app with a single "users" CRUD page mounted through the
// admin panel. Returns the in-memory store and spies so tests can assert the
// page handlers were actually invoked with the decoded request data.
const buildUsersApp = () => {
  const users = seedUsers()
  const calls = {
    inserted: [] as unknown[],
    updated: [] as Array<[number, unknown]>,
    deleted: [] as number[],
    statsHits: 0,
  }

  const admin = createAdminPanel()
  admin
    .createPage({ title: "Users", path: "users" })
    .data(async ({ take, skip }) => {
      const start = skip ?? 0
      const items = take == null ? users.slice(start) : users.slice(start, start + take)
      return { items, total: users.length }
    })
    .primaryKey("id", "number")
    .item(async (id) => users.find((u) => u.id === id) ?? null)
    .table([
      { title: "ID", field: "id", width: 60 },
      { title: "Name", field: "name" },
    ])
    .createForm({ name: "string" }, async (data) => {
      calls.inserted.push(data)
    })
    .updateForm({ name: "string" }, async (id, data) => {
      calls.updated.push([id, data])
    })
    .onDelete(async (ids) => {
      calls.deleted.push(...ids)
    })
    .componentData("stats", async () => {
      calls.statsHits++
      return { total: users.length }
    })

  const app = new Router()
  app.register(admin)
  return { app, users, calls }
}

// Builds an app whose panel requires authentication, so the onRequest hook is
// installed for every non-/auth endpoint. The "settings" page exposes handlers
// used to assert the resolved user is threaded into page handlers.
const buildAuthApp = () => {
  const seenTokens: Array<string | null> = []
  const knownUsers: Record<string, User> = { "token-123": { id: 1, name: "root" } }

  const admin = createAdminPanel<User>()
  admin.registerAuthMethod({
    title: "Sign in",
    fields: { login: "string", password: "string" },
    onLogin: async ({ login, password }) =>
      login === "root" && password === "secret" ? { token: "token-123" } : null,
    onRequest: async (token) => {
      seenTokens.push(token)
      return knownUsers[token] ?? null
    },
  })
  admin
    .createPage({ title: "Settings", path: "settings" })
    .data(async () => ({ items: [], total: 0 }))
    // A componentData literally named "auth" — the old endsWith("/auth") check
    // would have served this without a token.
    .componentData("auth", async () => ({ ok: true }))
    .componentData("whoami", async (_args, ctx) => ctx.user)

  const app = new Router()
  app.register(admin)
  return { app, seenTokens }
}

describe("admin panel — page registry", () => {
  it("lists registered pages with path and title", async () => {
    const { app } = buildUsersApp()
    const res = await app.inject("/api/admin/pages")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ path: "users", title: "Users" }])
  })

  it("includes sidebar group and icon in the pages list", async () => {
    const admin = createAdminPanel()
    admin.createPage({ title: "Users", path: "users", group: "People", icon: "users" }).data(async () => ({ items: [], total: 0 }))
    admin.createPage({ title: "Home", path: "home" }).data(async () => ({ items: [], total: 0 }))
    const app = new Router()
    app.register(admin)

    const res = await app.inject("/api/admin/pages")
    expect(await res.json()).toEqual([
      { path: "users", title: "Users", group: "People", icon: "users" },
      { path: "home", title: "Home", group: undefined, icon: undefined },
    ])
  })

  it("exposes a page's metadata", async () => {
    const { app } = buildUsersApp()
    const res = await app.inject("/api/admin/pages/users")

    expect(res.status).toBe(200)
    const meta = await res.json()
    expect(meta).toMatchObject({
      title: "Users",
      path: "users",
      primaryKey: "id",
      itemAccess: true,
      allowDelete: true,
    })
    expect(meta.table).toBeDefined()
    expect(meta.createForm).toBeDefined()
    expect(meta.updateForm).toBeDefined()
  })

  it("rejects a duplicate page path", () => {
    const admin = createAdminPanel()
    admin.createPage({ title: "Users", path: "users" })
    expect(() => admin.createPage({ title: "Users again", path: "users" })).toThrow()
  })

  it("rejects a page path with characters that break the route template", () => {
    const admin = createAdminPanel()
    expect(() => admin.createPage({ title: "Bad", path: "a/b" })).toThrow()
  })
})

describe("admin panel — list & item data", () => {
  it("returns items and the unpaginated total when no pagination is given", async () => {
    const { app } = buildUsersApp()
    const res = await app.inject("/api/admin/data/users/items")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: seedUsers(),
      total: 3,
    })
  })

  it("applies take/skip query params but keeps the full total", async () => {
    const { app } = buildUsersApp()
    const res = await app.inject("/api/admin/data/users/items?take=2&skip=1")

    expect(await res.json()).toEqual({
      items: [
        { id: 2, name: "Bob" },
        { id: 3, name: "Carol" },
      ],
      total: 3,
    })
  })

  it("fetches a single item and coerces the numeric primary key", async () => {
    const { app } = buildUsersApp()
    const res = await app.inject("/api/admin/data/users/items/1")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 1, name: "Alice" })
  })
})

describe("admin panel — mutations", () => {
  it("creates an item from a valid body", async () => {
    const { app, calls } = buildUsersApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/items",
      body: { name: "Dave" },
    })

    expect(res.status).toBe(200)
    expect(calls.inserted).toEqual([{ name: "Dave" }])
  })

  it("rejects a create with an invalid body", async () => {
    const { app, calls } = buildUsersApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/items",
      body: {},
    })

    expect(res.status).toBe(400)
    expect(calls.inserted).toEqual([])
  })

  it("updates an item by primary key", async () => {
    const { app, calls } = buildUsersApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/items/2",
      body: { name: "Bobby" },
    })

    expect(res.status).toBe(200)
    expect(calls.updated).toEqual([[2, { name: "Bobby" }]])
  })

  it("bulk-deletes items by id", async () => {
    const { app, calls } = buildUsersApp()
    const res = await app.inject({
      method: "DELETE",
      url: "/api/admin/data/users/items",
      body: { itemIds: [1, 3] },
    })

    expect(res.status).toBe(200)
    expect(calls.deleted).toEqual([1, 3])
  })

  it("serves registered component data", async () => {
    const { app, calls } = buildUsersApp()
    const res = await app.inject("/api/admin/data/users/component-data/stats")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ total: 3 })
    expect(calls.statsHits).toBe(1)
  })
})

describe("admin panel — component actions", () => {
  const buildActionApp = () => {
    const calls = { promoted: [] as unknown[], pinged: 0 }
    const admin = createAdminPanel()
    admin
      .createPage({ title: "Users", path: "users" })
      .data(async () => ({ items: [], total: 0 }))
      .componentAction("promote", { userId: "number" }, async (data) => {
        calls.promoted.push(data)
        return { ok: true }
      })
      .componentAction("ping", async () => {
        calls.pinged++
        return { pong: true }
      })
    const app = new Router()
    app.register(admin)
    return { app, calls }
  }

  it("runs a payload action and validates the body", async () => {
    const { app, calls } = buildActionApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/component-action/promote",
      body: { userId: 7 },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.promoted).toEqual([{ userId: 7 }])
  })

  it("rejects a payload action with an invalid body", async () => {
    const { app, calls } = buildActionApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/component-action/promote",
      body: {},
    })

    expect(res.status).toBe(400)
    expect(calls.promoted).toEqual([])
  })

  it("runs a no-payload action", async () => {
    const { app, calls } = buildActionApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/component-action/ping",
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ pong: true })
    expect(calls.pinged).toBe(1)
  })
})

describe("admin panel — reference select methods", () => {
  const buildRefApp = () => {
    const users = seedUsers()
    const admin = createAdminPanel()
    admin
      .createPage({ title: "Posts", path: "posts" })
      .data(async () => ({ items: [], total: 0 }))
      .primaryKey("id", "number")
      .createForm(
        {
          title: "string",
          authorId: {
            type: "number",
            reference: async ({ search, value }: { search?: string; value?: string }) => {
              const list =
                value != null ? users.filter((u) => u.id === Number(value)) :
                search ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())) :
                users
              return list.map((u) => ({ value: u.id, label: u.name }))
            },
          },
        },
        async () => {}
      )
    const app = new Router()
    app.register(admin)
    return { app }
  }

  it("replaces an inline reference method with a { method } descriptor in the schema", async () => {
    const { app } = buildRefApp()
    const res = await app.inject("/api/admin/pages/posts")
    const meta = await res.json()
    expect(meta.createForm.schema.properties.authorId.reference).toEqual({ method: "posts.create.authorId" })
  })

  it("serves reference options filtered by search", async () => {
    const { app } = buildRefApp()
    const res = await app.inject("/api/admin/select/posts.create.authorId?search=bo")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [{ value: 2, label: "Bob" }] })
  })

  it("resolves a single option by value", async () => {
    const { app } = buildRefApp()
    const res = await app.inject("/api/admin/select/posts.create.authorId?value=3")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [{ value: 3, label: "Carol" }] })
  })

  it("returns 404 for an unknown reference id", async () => {
    const { app } = buildRefApp()
    const res = await app.inject("/api/admin/select/posts.create.unknown")

    expect(res.status).toBe(404)
  })
})

describe("admin panel — declared actions", () => {
  const buildActionsApp = () => {
    const users = seedUsers().map((u) => ({ ...u, balance: 0 }))
    const calls = { recalculated: 0 }
    const admin = createAdminPanel()
    admin
      .createPage({ title: "Users", path: "users", search: true })
      .data(async () => ({ items: users, total: users.length }))
      .primaryKey("id", "number")
      // Row action with a form — tops up a single user's balance.
      .action("topUp", { title: "Top up", icon: "add", form: { amount: "number" } }, async (id, { amount }) => {
        const user = users.find((u) => u.id === id)!
        user.balance += amount
        return { message: `+${amount}` }
      })
      // Formless row action.
      .action("reset", { title: "Reset", confirm: "Sure?" }, async (id) => {
        users.find((u) => u.id === id)!.balance = 0
        return { message: "reset" }
      })
      // Bulk action over a selection.
      .action("grant", { title: "Grant", bulk: true, form: { amount: "number" } }, async (ids: number[], { amount }) => {
        for (const id of ids) users.find((u) => u.id === id)!.balance += amount
        return { message: `granted ${ids.length}` }
      })
      // Toolbar (page-level) action, no target.
      .action("recalc", { title: "Recalc", placement: "toolbar" }, async () => {
        calls.recalculated++
        return { message: "done" }
      })
    const app = new Router()
    app.register(admin)
    return { app, users, calls }
  }

  it("advertises actions and the search flag in the page metadata", async () => {
    const { app } = buildActionsApp()
    const meta = await (await app.inject("/api/admin/pages/users")).json()

    expect(meta.search).toBe(true)
    expect(meta.actions).toEqual([
      { name: "topUp", title: "Top up", icon: "add", kind: "row", form: { schema: expect.any(Object) }, confirm: undefined, danger: undefined },
      { name: "reset", title: "Reset", icon: undefined, kind: "row", form: undefined, confirm: "Sure?", danger: undefined },
      { name: "grant", title: "Grant", icon: undefined, kind: "bulk", form: { schema: expect.any(Object) }, confirm: undefined, danger: undefined },
      { name: "recalc", title: "Recalc", icon: undefined, kind: "toolbar", form: undefined, confirm: undefined, danger: undefined },
    ])
    // The handlers must never be serialized.
    expect(JSON.stringify(meta.actions)).not.toContain("function")
  })

  it("runs a row action with a validated form body against the coerced id", async () => {
    const { app, users } = buildActionsApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/actions/topUp?itemId=2",
      body: { amount: 500 },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: "+500" })
    expect(users.find((u) => u.id === 2)!.balance).toBe(500)
  })

  it("rejects a row action whose form body is invalid", async () => {
    const { app } = buildActionsApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/actions/topUp?itemId=2",
      body: { amount: "lots" },
    })

    expect(res.status).toBe(400)
  })

  it("runs a formless row action", async () => {
    const { app, users } = buildActionsApp()
    users.find((u) => u.id === 1)!.balance = 999
    const res = await app.inject({ method: "POST", url: "/api/admin/data/users/actions/reset?itemId=1" })

    expect(res.status).toBe(200)
    expect(users.find((u) => u.id === 1)!.balance).toBe(0)
  })

  it("runs a bulk action over comma-separated ids coerced to the key type", async () => {
    const { app, users } = buildActionsApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/data/users/actions/grant?itemIds=1,3",
      body: { amount: 10 },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: "granted 2" })
    expect(users.find((u) => u.id === 1)!.balance).toBe(10)
    expect(users.find((u) => u.id === 2)!.balance).toBe(0)
    expect(users.find((u) => u.id === 3)!.balance).toBe(10)
  })

  it("runs a toolbar action with no target", async () => {
    const { app, calls } = buildActionsApp()
    const res = await app.inject({ method: "POST", url: "/api/admin/data/users/actions/recalc" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: "done" })
    expect(calls.recalculated).toBe(1)
  })

  it("omits actions and search from metadata when none are declared", async () => {
    const { app } = buildUsersApp()
    const meta = await (await app.inject("/api/admin/pages/users")).json()

    expect(meta.actions).toBeUndefined()
    expect(meta.search).toBeUndefined()
  })
})

describe("admin panel — filters", () => {
  const buildFilterApp = () => {
    let received: ListOptionsShape | null = null
    const admin = createAdminPanel()
    admin
      .createPage({ title: "Users", path: "users" })
      .filters({
        role: { type: "string?", options: [{ value: "user", label: "User" }] },
        minBalance: "number?",
        createdAfter: "date?",
      })
      .data(async (options) => {
        received = options as ListOptionsShape
        return { items: [], total: 0 }
      })
    const app = new Router()
    app.register(admin)
    return { app, getReceived: () => received }
  }
  type ListOptionsShape = { filter?: Record<string, any> }

  it("advertises the filter schema in the page metadata (references stripped, no required)", async () => {
    const { app } = buildFilterApp()
    const meta = await (await app.inject("/api/admin/pages/users")).json()

    expect(meta.filters).toBeDefined()
    expect(meta.filters.schema.properties.role).toBeDefined()
    expect(meta.filters.schema.properties.minBalance).toBeDefined()
    // Filters are apply-if-set — no field is required.
    expect(meta.filters.schema.required).toBeUndefined()
  })

  it("parses, validates and decodes the filter query param", async () => {
    const { app, getReceived } = buildFilterApp()
    const filter = JSON.stringify({ role: "user", minBalance: 100, createdAfter: "2023-01-15T00:00:00.000Z" })
    const res = await app.inject(`/api/admin/data/users/items?filter=${encodeURIComponent(filter)}`)

    expect(res.status).toBe(200)
    const got = getReceived()!.filter!
    expect(got.role).toBe("user")
    expect(got.minBalance).toBe(100)
    // The date field is decoded to a JS Date.
    expect(got.createdAfter).toBeInstanceOf(Date)
  })

  it("accepts a partial filter and omits absent keys", async () => {
    const { app, getReceived } = buildFilterApp()
    await app.inject(`/api/admin/data/users/items?filter=${encodeURIComponent(JSON.stringify({ role: "user" }))}`)

    const got = getReceived()!.filter!
    expect(got.role).toBe("user")
    expect("minBalance" in got).toBe(false)
  })

  it("leaves filter undefined when the param is absent", async () => {
    const { app, getReceived } = buildFilterApp()
    await app.inject("/api/admin/data/users/items")

    expect(getReceived()!.filter).toBeUndefined()
  })

  it("rejects a filter whose value violates the schema", async () => {
    const { app } = buildFilterApp()
    const bad = JSON.stringify({ minBalance: "lots" })
    const res = await app.inject(`/api/admin/data/users/items?filter=${encodeURIComponent(bad)}`)

    expect(res.status).toBe(400)
  })

  it("rejects a malformed (non-JSON) filter param", async () => {
    const { app } = buildFilterApp()
    const res = await app.inject("/api/admin/data/users/items?filter=%7Bnot-json")

    expect(res.status).toBe(400)
  })

  it("omits filters from metadata when none are declared", async () => {
    const { app } = buildUsersApp()
    const meta = await (await app.inject("/api/admin/pages/users")).json()
    expect(meta.filters).toBeUndefined()
  })
})

describe("admin panel — access control", () => {
  type RoleUser = { role: "admin" | "viewer" }
  const buildAccessApp = () => {
    const admin = createAdminPanel<RoleUser>()
    admin.registerAuthMethod({
      fields: { login: "string", password: "string" },
      onLogin: async ({ login }) => ({ token: login }),
      onRequest: async (token) => (token === "admin" || token === "viewer" ? { role: token } : null),
    })
    const isAdmin = (u: RoleUser) => u.role === "admin"
    // Whole-page gate.
    admin
      .createPage({ title: "Secrets", path: "secrets", access: isAdmin })
      .data(async () => ({ items: [{ id: 1 }], total: 1 }))
      .primaryKey("id", "number")
    // Granular gate: everyone reads, only admins write/delete.
    admin
      .createPage({ title: "Posts", path: "posts", access: { write: isAdmin, delete: isAdmin } })
      .data(async () => ({ items: [], total: 0 }))
      .primaryKey("id", "number")
      .createForm({ title: "string" }, async () => {})
      .updateForm({ title: "string" }, async () => {})
      .onDelete(async () => {})
      .action("publish", { title: "Publish" }, async () => ({ message: "ok" }))
    const app = new Router()
    app.register(admin)
    return { app }
  }
  const as = (role: string) => ({ headers: { Authorization: `Bearer ${role}` } })

  it("filters the sidebar by the read facet", async () => {
    const { app } = buildAccessApp()
    const adminPages = await (await app.inject({ url: "/api/admin/pages", ...as("admin") })).json()
    const viewerPages = await (await app.inject({ url: "/api/admin/pages", ...as("viewer") })).json()

    expect(adminPages.map((p: any) => p.path).sort()).toEqual(["posts", "secrets"])
    // The viewer can't read Secrets, so it's hidden.
    expect(viewerPages.map((p: any) => p.path)).toEqual(["posts"])
  })

  it("403s a read-gated page's data and metadata for a denied user", async () => {
    const { app } = buildAccessApp()
    expect((await app.inject({ url: "/api/admin/data/secrets/items", ...as("admin") })).status).toBe(200)
    expect((await app.inject({ url: "/api/admin/data/secrets/items", ...as("viewer") })).status).toBe(403)
    expect((await app.inject({ url: "/api/admin/pages/secrets", ...as("viewer") })).status).toBe(403)
  })

  it("lets a read-only user read but omits write/delete affordances from metadata", async () => {
    const { app } = buildAccessApp()
    const meta = await (await app.inject({ url: "/api/admin/pages/posts", ...as("viewer") })).json()

    expect((await app.inject({ url: "/api/admin/data/posts/items", ...as("viewer") })).status).toBe(200)
    expect(meta.createForm).toBeUndefined()
    expect(meta.updateForm).toBeUndefined()
    expect(meta.allowDelete).toBeUndefined()
    expect(meta.actions).toBeUndefined()
  })

  it("exposes the full affordances to a writer", async () => {
    const { app } = buildAccessApp()
    const meta = await (await app.inject({ url: "/api/admin/pages/posts", ...as("admin") })).json()

    expect(meta.createForm).toBeDefined()
    expect(meta.updateForm).toBeDefined()
    expect(meta.allowDelete).toBe(true)
    expect(meta.actions).toHaveLength(1)
  })

  it("enforces write and delete facets on the mutation routes", async () => {
    const { app } = buildAccessApp()
    const create = { method: "POST", url: "/api/admin/data/posts/items", body: { title: "x" } }
    const del = { method: "DELETE", url: "/api/admin/data/posts/items", body: { itemIds: [1] } }
    const action = { method: "POST", url: "/api/admin/data/posts/actions/publish" }

    expect((await app.inject({ ...create, ...as("viewer") })).status).toBe(403)
    expect((await app.inject({ ...create, ...as("admin") })).status).toBe(200)
    expect((await app.inject({ ...del, ...as("viewer") })).status).toBe(403)
    expect((await app.inject({ ...del, ...as("admin") })).status).toBe(200)
    expect((await app.inject({ ...action, ...as("viewer") })).status).toBe(403)
    expect((await app.inject({ ...action, ...as("admin") })).status).toBe(200)
  })
})

describe("admin panel — dashboard", () => {
  const buildDashApp = () => {
    let statHits = 0
    const admin = createAdminPanel()
    admin.dashboard([
      { type: "stat", title: "Users", icon: "users", link: "users", data: async () => { statHits++; return { value: 42 } } },
      { type: "component", title: "Chart", span: 2, component: "/abs/path/Chart.vue", data: async () => ({ points: [1, 2, 3] }) },
      { type: "component", title: "Static", component: "/abs/path/Static.vue" },
    ])
    const app = new Router()
    app.register(admin)
    return { app, getStatHits: () => statHits }
  }

  it("lists widget descriptors with hasData and a component key", async () => {
    const { app } = buildDashApp()
    const widgets: any = await (await app.inject("/api/admin/dashboard")).json()

    expect(widgets).toHaveLength(3)
    expect(widgets[0]).toMatchObject({ type: "stat", title: "Users", icon: "users", link: "users", hasData: true })
    expect(widgets[1]).toMatchObject({ type: "component", title: "Chart", span: 2, hasData: true })
    // Component .vue files are registered under a dashboard-qualified key.
    expect(widgets[1].component).toBe("dashboard__1__Chart.vue")
    expect(widgets[2]).toMatchObject({ type: "component", title: "Static", hasData: false })
  })

  it("serves a widget's server-resolved data", async () => {
    const { app, getStatHits } = buildDashApp()
    const stat = await app.inject("/api/admin/dashboard/0/data")
    expect(stat.status).toBe(200)
    expect(await stat.json()).toEqual({ value: 42 })
    expect(getStatHits()).toBe(1)

    const comp = await app.inject("/api/admin/dashboard/1/data")
    expect(await comp.json()).toEqual({ points: [1, 2, 3] })
  })

  it("404s data for a widget with no resolver or an unknown index", async () => {
    const { app } = buildDashApp()
    expect((await app.inject("/api/admin/dashboard/2/data")).status).toBe(404)
    expect((await app.inject("/api/admin/dashboard/99/data")).status).toBe(404)
  })

  it("omits the dashboard routes when no widgets are configured", async () => {
    const admin = createAdminPanel()
    admin.createPage({ title: "X", path: "x" }).data(async () => ({ items: [], total: 0 }))
    const app = new Router()
    app.register(admin)
    expect((await app.inject("/api/admin/dashboard")).status).toBe(404)
  })
})

describe("static asset path resolution", () => {
  const dir = normalize("/srv/app/frontend")
  const prefix = "/admin/assets/"

  it("resolves a valid asset path inside the directory", () => {
    expect(resolveAssetPath(dir, "/admin/assets/chunk.js", prefix)).toBe(join(dir, "chunk.js"))
  })

  it("resolves nested asset paths", () => {
    expect(resolveAssetPath(dir, "/admin/assets/vendor/vue.js", prefix)).toBe(join(dir, "vendor", "vue.js"))
  })

  it("rejects a parent-directory traversal", () => {
    expect(resolveAssetPath(dir, "/admin/assets/../secret", prefix)).toBeNull()
  })

  it("rejects percent-encoded traversal", () => {
    expect(resolveAssetPath(dir, "/admin/assets/%2e%2e/secret", prefix)).toBeNull()
  })

  it("rejects an absolute path", () => {
    expect(resolveAssetPath(dir, "/admin/assets//etc/passwd", prefix)).toBeNull()
  })

  it("rejects malformed percent-encoding", () => {
    expect(resolveAssetPath(dir, "/admin/assets/%zz", prefix)).toBeNull()
  })

  it("rejects an empty asset path", () => {
    expect(resolveAssetPath(dir, "/admin/assets/", prefix)).toBeNull()
  })
})

describe("admin panel — file uploads", () => {
  const buildUploadApp = () => {
    const stored: Array<{ name: string, size: number, field?: string }> = []
    const admin = createAdminPanel()
    admin
      .createPage({ title: "Users", path: "users" })
      .data(async () => ({ items: [], total: 0 }))
      .upload(async (file, ctx) => {
        stored.push({ name: file.name, size: file.size, field: ctx.field })
        return `/files/${file.name}`
      })
    const app = new Router()
    app.register(admin)
    return { app, stored }
  }

  it("stores an uploaded file via the handler and returns its url", async () => {
    const { app, stored } = buildUploadApp()
    const form = new FormData()
    form.append("file", new File(["hello"], "avatar.png", { type: "image/png" }))
    form.append("field", "avatar")

    const res = await app.inject({ method: "POST", url: "/api/admin/data/users/upload", body: form })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: "/files/avatar.png" })
    expect(stored).toEqual([{ name: "avatar.png", size: 5, field: "avatar" }])
  })

  it("rejects an upload with no file", async () => {
    const { app } = buildUploadApp()
    const res = await app.inject({ method: "POST", url: "/api/admin/data/users/upload", body: new FormData() })

    expect(res.status).toBe(400)
  })
})

describe("admin panel — list options parsing", () => {
  const buildOptionsApp = () => {
    let received: unknown = null
    const admin = createAdminPanel()
    admin.createPage({ title: "Users", path: "users" }).data(async (options) => {
      received = options
      return { items: [], total: 0 }
    })
    const app = new Router()
    app.register(admin)
    return { app, getReceived: () => received }
  }

  it("parses sortField/sortDir into a sort object", async () => {
    const { app, getReceived } = buildOptionsApp()
    await app.inject("/api/admin/data/users/items?take=10&skip=5&sortField=name&sortDir=desc")

    expect(getReceived()).toMatchObject({
      take: 10,
      skip: 5,
      sort: { field: "name", dir: "desc" },
    })
  })

  it("defaults an unknown sort direction to desc and passes search through", async () => {
    const { app, getReceived } = buildOptionsApp()
    await app.inject("/api/admin/data/users/items?sortField=name&search=bob")

    expect(getReceived()).toMatchObject({
      sort: { field: "name", dir: "desc" },
      search: "bob",
    })
  })

  it("omits sort when no sortField is given", async () => {
    const { app, getReceived } = buildOptionsApp()
    await app.inject("/api/admin/data/users/items")

    expect((getReceived() as { sort?: unknown }).sort).toBeUndefined()
  })
})

describe("admin panel — basePath configuration", () => {
  const buildPanelApp = () => {
    const admin = createAdminPanel({ basePath: "/panel" })
    admin.createPage({ title: "Users", path: "users" }).data(async () => ({ items: [], total: 0 }))
    const app = new Router()
    app.register(admin)
    return app
  }

  it("serves the API under the derived base", async () => {
    const app = buildPanelApp()
    const res = await app.inject("/api/panel/pages")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ path: "users", title: "Users" }])
  })

  it("no longer serves the default /api/admin base", async () => {
    const app = buildPanelApp()
    const res = await app.inject("/api/admin/pages")

    expect(res.status).toBe(404)
  })

  it("normalizes a base path without a leading slash", async () => {
    const admin = createAdminPanel({ basePath: "panel/" })
    admin.createPage({ title: "Users", path: "users" }).data(async () => ({ items: [], total: 0 }))
    const app = new Router()
    app.register(admin)

    const res = await app.inject("/api/panel/data/users/items")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [], total: 0 })
  })
})

describe("admin panel — authentication", () => {
  it("blocks protected endpoints when no token is sent", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject("/api/admin/pages")

    expect(res.status).toBe(403)
  })

  it("serves the auth config without a token", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject("/api/admin/auth")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe("Sign in")
    expect(body.fields).toBeTruthy()
  })

  it("does not exempt other paths that merely end in /auth", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject("/api/admin/data/settings/component-data/auth")

    expect(res.status).toBe(403)
  })

  it("issues a token for valid credentials", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth",
      body: { login: "root", password: "secret" },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ token: "token-123" })
  })

  it("returns 401 for invalid credentials", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth",
      body: { login: "root", password: "nope" },
    })

    expect(res.status).toBe(401)
  })

  it("grants access and strips the Bearer prefix before onRequest", async () => {
    const { app, seenTokens } = buildAuthApp()
    const res = await app.inject({
      url: "/api/admin/pages",
      headers: { Authorization: "Bearer token-123" },
    })

    expect(res.status).toBe(200)
    expect(seenTokens.at(-1)).toBe("token-123")
  })

  it("returns 401 when onRequest resolves to no user", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject({
      url: "/api/admin/pages",
      headers: { Authorization: "token-456" },
    })

    expect(res.status).toBe(401)
  })

  it("threads the authenticated user into page handlers", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject({
      url: "/api/admin/data/settings/component-data/whoami",
      headers: { Authorization: "Bearer token-123" },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 1, name: "root" })
  })
})

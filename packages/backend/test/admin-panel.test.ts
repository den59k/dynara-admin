import { describe, it, expect } from "bun:test"
import { Router, HTTPError } from "dynara"
import { createAdminPanel } from "../src/main"

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
      return take == null ? users.slice(start) : users.slice(start, start + take)
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
// installed for every non-/auth endpoint.
const buildAuthApp = () => {
  const seenTokens: Array<string | null> = []

  const admin = createAdminPanel()
  admin.registerAuthMethod({
    title: "Sign in",
    fields: { login: "string", password: "string" },
    onLogin: async ({ login, password }) =>
      login === "root" && password === "secret" ? "token-123" : null,
    onRequest: async (token) => {
      seenTokens.push(token)
      if (token !== "token-123") throw new HTTPError("Invalid token", 401)
    },
  })
  admin.createPage({ title: "Users", path: "users" }).data(async () => [])

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
})

describe("admin panel — list & item data", () => {
  it("returns the full list when no pagination is given", async () => {
    const { app } = buildUsersApp()
    const res = await app.inject("/api/admin/data/users/items")

    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(3)
  })

  it("applies take/skip query params", async () => {
    const { app } = buildUsersApp()
    const res = await app.inject("/api/admin/data/users/items?take=2&skip=1")

    expect(await res.json()).toEqual([
      { id: 2, name: "Bob" },
      { id: 3, name: "Carol" },
    ])
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

  it("issues a token for valid credentials", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth",
      body: { login: "root", password: "secret" },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toBe("token-123")
  })

  it("returns null for invalid credentials", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth",
      body: { login: "root", password: "nope" },
    })

    expect(await res.json()).toBeNull()
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

  it("propagates an HTTPError thrown by onRequest", async () => {
    const { app } = buildAuthApp()
    const res = await app.inject({
      url: "/api/admin/pages",
      headers: { Authorization: "token-456" },
    })

    expect(res.status).toBe(401)
  })
})

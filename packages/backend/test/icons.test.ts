import { describe, it, expect } from "bun:test"
import { Router } from "dynara"
import { createAdminPanel } from "../src/main"
import { resolveIcons, ALIASES } from "../src/icons"

// Icon names in page/action/widget config are resolved server-side against the
// embedded Tabler pack and inlined into index.html, so a panel ships only the
// icons its own config references — not the whole 6k-icon set.
describe("resolveIcons", () => {
  it("resolves referenced names to tintable inner SVG markup", async () => {
    const icons = (await resolveIcons(["users", "file"]))!

    expect(Object.keys(icons.icons).sort()).toEqual(["file", "users"])
    expect(icons.icons.users).toContain("currentColor")
    expect(icons.icons.users).not.toContain("<svg")
    // Root attributes are shared by the whole pack, so they travel once.
    expect(icons.defaults).toEqual({ viewBox: "0 0 24 24", width: "24", height: "24" })
  })

  it("deduplicates and ignores empty names", async () => {
    const icons = (await resolveIcons(["users", "users", "", "file"]))!
    expect(Object.keys(icons.icons).sort()).toEqual(["file", "users"])
  })

  it("returns null when nothing references an icon", async () => {
    expect(await resolveIcons([])).toBeNull()
    expect(await resolveIcons([""])).toBeNull()
  })

  it("keys aliased icons by the name the consumer wrote", async () => {
    // "delete" is Tabler's "trash" — the frontend looks up what it was given
    // and never needs to know the alias exists.
    const icons = (await resolveIcons(["delete"]))!

    expect(icons.icons.delete).toBeString()
    expect(icons.icons.trash).toBeUndefined()
  })

  it("maps every alias to a name the pack actually has", async () => {
    const names = Object.keys(ALIASES)
    const icons = (await resolveIcons(names))!

    expect(Object.keys(icons.icons).sort()).toEqual(names.sort())
  })

  it("throws on an unknown name and suggests close matches", async () => {
    // The default (non-production) behaviour: a typo surfaces at startup rather
    // than rendering an invisible icon nobody notices.
    const err = await resolveIcons(["uzers"]).catch((e: Error) => e)

    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('"uzers"')
    expect((err as Error).message).toContain("users")
  })

  it("warns instead of throwing in production", async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    const warnings: string[] = []
    const realWarn = console.warn
    console.warn = (msg: string) => { warnings.push(msg) }

    try {
      // A typo must not stop a deployed server from booting; the good icons in
      // the same config still resolve.
      const icons = (await resolveIcons(["users", "nope-not-real"]))!

      expect(Object.keys(icons.icons)).toEqual(["users"])
      expect(warnings.join("\n")).toContain("nope-not-real")
    } finally {
      console.warn = realWarn
      process.env.NODE_ENV = prev
    }
  })
})

describe("icon resolution during registration", () => {
  it("fails registration when a page names an unknown icon", async () => {
    const admin = createAdminPanel()
    admin.createPage({ title: "Users", path: "users", icon: "uzers" }).data(async () => [])
    const app = new Router()
    app.register(admin)

    // Resolution happens while the panel registers its routes, so the error
    // surfaces on the first request that drives registration.
    expect(app.inject("/api/admin/pages")).rejects.toThrow(/unknown icon name/i)
  })

  it("registers cleanly when every referenced icon resolves", async () => {
    const admin = createAdminPanel()
    admin
      .createPage({ title: "Users", path: "users", icon: "users" })
      .data(async () => [])
      .action("topUp", { title: "Top up", icon: "add", handler: async () => {} })
    admin.dashboard([
      { type: "stat", title: "Users", icon: "chart-pie", data: async () => ({ value: 1 }) },
    ])
    const app = new Router()
    app.register(admin)

    const res = await app.inject("/api/admin/pages")
    expect(res.status).toBe(200)
  })
})

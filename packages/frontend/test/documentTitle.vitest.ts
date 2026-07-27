import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { defineComponent, reactive } from "vue"

// The panel's name is read once, at import, from the runtime config the backend
// injects — so it has to be there before the module graph loads.
vi.hoisted(() => { (globalThis as any).window.__DYNARA_TITLE__ = "Acme Admin" })

const route = reactive({ path: "/", params: {} as Record<string, string> })
vi.mock("vue-router", () => ({ useRoute: () => route }))

vi.mock("../src/api/dataApi", () => ({
  dataApi: {
    getPages: vi.fn(async () => [
      { path: "users", title: "Users" },
      { path: "posts", title: "Posts" },
      // A page configured as the home page — served under "/".
      { path: "", title: "Overview" },
    ]),
  },
}))

import { useDocumentTitle } from "../src/utils/useDocumentTitle"

// A component that does nothing but keep the title in sync, the way App.vue does.
const Harness = defineComponent({ setup: () => { useDocumentTitle(); return () => null } })

const at = async (path: string) => {
  route.path = path
  await flushPromises()
  return document.title
}

beforeEach(() => {
  route.path = "/"
  document.title = ""
})

describe("useDocumentTitle", () => {
  it("names the tab after the page and the panel", async () => {
    mount(Harness)
    await flushPromises()

    expect(await at("/users")).toBe("Users · Acme Admin")
    expect(await at("/posts")).toBe("Posts · Acme Admin")
  })

  it("names the login page too", async () => {
    mount(Harness)

    expect(await at("/auth")).toBe("Sign in · Acme Admin")
  })

  it("shows the panel's name alone where the page has no name of its own", async () => {
    mount(Harness)
    await flushPromises()

    // The default home page: its heading is the panel's name, so the tab is too.
    expect(document.title).toBe("Overview · Acme Admin")
    expect(await at("/nowhere")).toBe("Acme Admin")
  })

  it("carries the panel's name from the first tick, loaded or not", async () => {
    route.path = "/users"
    mount(Harness)

    // Set synchronously on mount: whether or not the page list has arrived yet,
    // the tab is never blank and never someone else's name.
    expect(document.title).toMatch(/Acme Admin$/)

    await flushPromises()
    expect(document.title).toBe("Users · Acme Admin")
  })
})

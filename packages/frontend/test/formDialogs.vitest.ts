import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import AddItemDialog from "../src/components/dialogs/AddItemDialog.vue"
import ActionDialog from "../src/components/dialogs/ActionDialog.vue"

// Dialog-level coverage for custom form-field components: the earlier
// VInputObject-only test mounted with the record already in the props, which
// masked that the dialogs never delivered identity at all (form values only
// hold schema-declared keys, so the primary key was silently dropped). These
// tests mount the real dialogs and assert the `item` channel end to end.

vi.mock("../src/utils/loadCustomComponent", async () => {
  const { defineComponent, h } = await import("vue")
  // Echoes item (id:role) / whether the primary key leaked into values / the
  // field value's length, e.g. "7:admin/no-id/2".
  const FakeCustom = defineComponent({
    props: ["modelValue", "values", "name", "item"],
    setup: (props: any) => () =>
      h("div", { class: "fake-custom" }, [
        props.item ? `${props.item.id}:${props.item.role ?? "-"}` : "null",
        props.values && "id" in props.values ? "leak" : "no-id",
        String((props.modelValue ?? []).length),
      ].join("/")),
  })
  return { loadCustomComponent: async () => FakeCustom }
})

const mocks = vi.hoisted(() => ({ getItemData: vi.fn() }))
vi.mock("../src/api/dataApi", () => ({
  dataApi: {
    getItemData: mocks.getItemData,
    updateItem: vi.fn(),
    createItem: vi.fn(),
    runAction: vi.fn(),
    getData: vi.fn(),
  },
}))

const dialogStore = { open: vi.fn(), back: vi.fn(), close: vi.fn(), setGuard: vi.fn() }
const toastStore = { success: vi.fn(), error: vi.fn() }
const globalMocks = { global: { provide: { dialogStore, toastStore } } }

beforeEach(() => {
  mocks.getItemData.mockReset()
})

describe("AddItemDialog custom form components", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      posts: { type: "component", component: "users.update.posts", label: "Posts" },
    },
    required: ["name"],
  }

  const mountDialog = (props: Record<string, any>) =>
    mount(AddItemDialog as any, {
      props: { viewId: "users", schema, primaryKey: "id", ...props },
      ...globalMocks,
    })

  it("delivers the record as item — identity never rides in the form values", async () => {
    const wrapper = mountDialog({ item: { id: 7, name: "Alice", posts: [{ id: 1 }, { id: 2 }] } })
    await flushPromises()

    // item.id = 7; values has no `id` key; posts (a schema key) reached modelValue.
    expect(wrapper.find(".fake-custom").text()).toBe("7:-/no-id/2")
  })

  it("passes item: null in create mode", async () => {
    const wrapper = mountDialog({})
    await flushPromises()

    expect(wrapper.find(".fake-custom").text()).toBe("null/no-id/0")
  })

  it("refreshes item with the full record when the page exposes item access", async () => {
    // The table row is a projection; the item endpoint returns extra fields
    // (role, posts) that must reach the component through `item`/`modelValue`.
    mocks.getItemData.mockResolvedValue({ id: 7, name: "Alice", role: "admin", posts: [{ id: 1 }] })
    const wrapper = mountDialog({ item: { id: 7, name: "Alice" }, itemAccess: true })
    await flushPromises()

    expect(mocks.getItemData).toHaveBeenCalledWith("users", 7)
    expect(wrapper.find(".fake-custom").text()).toBe("7:admin/no-id/1")
  })
})

describe("ActionDialog custom form components", () => {
  const action = {
    name: "grant",
    title: "Grant",
    form: {
      schema: {
        type: "object",
        properties: {
          amount: { type: "number" },
          preview: { type: "component", component: "users.action.grant.preview" },
        },
        required: ["amount"],
      },
    },
  }

  it("provides the targeted row to a row action's form components", async () => {
    const wrapper = mount(ActionDialog as any, {
      props: { viewId: "users", action, itemId: 7, item: { id: 7, role: "admin" } },
      ...globalMocks,
    })
    await flushPromises()

    expect(wrapper.find(".fake-custom").text()).toBe("7:admin/no-id/0")
  })

  it("passes item: null for toolbar/bulk actions", async () => {
    const wrapper = mount(ActionDialog as any, {
      props: { viewId: "users", action, itemIds: [1, 2] },
      ...globalMocks,
    })
    await flushPromises()

    expect(wrapper.find(".fake-custom").text()).toBe("null/no-id/0")
  })
})

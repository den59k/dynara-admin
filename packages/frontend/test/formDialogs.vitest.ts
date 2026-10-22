import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import AddItemDialog from "../src/components/dialogs/AddItemDialog.vue"
import ActionDialog from "../src/components/dialogs/ActionDialog.vue"
import { HTTPError } from "../src/api/request"

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

const mocks = vi.hoisted(() => ({ getItemData: vi.fn(), createItem: vi.fn() }))
vi.mock("../src/api/dataApi", () => ({
  dataApi: {
    getItemData: mocks.getItemData,
    updateItem: vi.fn(),
    createItem: mocks.createItem,
    runAction: vi.fn(),
    getData: vi.fn(),
  },
}))

const dialogStore = { open: vi.fn(), back: vi.fn(), close: vi.fn(), setGuard: vi.fn() }
const toastStore = { success: vi.fn(), error: vi.fn() }
const globalMocks = { global: { provide: { dialogStore, toastStore } } }

beforeEach(() => {
  mocks.getItemData.mockReset()
  mocks.createItem.mockReset()
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

// The form error handler lives in api/request (registered into vuesix as a
// side effect of importing it). dataApi is mocked away above, so the import is
// explicit here — without it no handler is installed at all.
describe("AddItemDialog validation errors", () => {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      titleOverride: { type: "string" },
      rows: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
    },
  }

  const submit = async (error: any) => {
    mocks.createItem.mockRejectedValue(error)
    const wrapper = mount(AddItemDialog as any, {
      props: { viewId: "posts", schema, primaryKey: "id" },
      ...globalMocks,
    })
    await wrapper.findAll("button.v-button").at(-1)!.trigger("click")
    await flushPromises()
    return wrapper
  }

  const controlOf = (wrapper: any, name: string) =>
    wrapper.find(`input[name="${name}"]`).element.closest(".v-form-control") as HTMLElement

  it("highlights the field dynara rejected, and only that one", async () => {
    const wrapper = await submit(new HTTPError({
      cause: "Validation error",
      where: "body",
      fields: { titleOverride: { message: "Expected string" } },
    }, 400))

    expect(controlOf(wrapper, "titleOverride").className).toContain("error")
    expect(controlOf(wrapper, "titleOverride").textContent).toContain("Expected string")
    expect(controlOf(wrapper, "title").className).not.toContain("error")
    expect(wrapper.find(".v-dialog__error").exists()).toBe(false)
  })

  it("points a nested path at the field that owns the value", async () => {
    const wrapper = await submit(new HTTPError({
      cause: "Validation error",
      where: "body",
      fields: { "rows/0/name": { message: "Expected string" } },
    }, 400))

    const table = wrapper.find(".v-input-table")
    expect(table.classes()).toContain("error")
    expect(table.text()).toContain("Expected string")
  })

  it("shows a plain-text error as the form-level message", async () => {
    const wrapper = await submit(new HTTPError("Not enough rights", 403))

    expect(wrapper.find(".v-dialog__error").text()).toBe("Not enough rights")
    expect(controlOf(wrapper, "title").className).not.toContain("error")
  })

  it("falls back to a generic message when the failure is not an HTTP one", async () => {
    const wrapper = await submit(new TypeError("fetch failed"))

    expect(wrapper.find(".v-dialog__error").text()).toBe("An error occurred")
  })

  it("clears the error once the field is edited again", async () => {
    const wrapper = await submit(new HTTPError({
      cause: "Validation error",
      fields: { titleOverride: { message: "Expected string" } },
    }, 400))
    expect(controlOf(wrapper, "titleOverride").className).toContain("error")

    await wrapper.find('input[name="titleOverride"]').setValue("ok")
    await flushPromises()

    expect(controlOf(wrapper, "titleOverride").className).not.toContain("error")
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

describe("form dialog width", () => {
  const schema = { type: "object", properties: { name: { type: "string" } } }
  const action = { name: "note", title: "Note", kind: "row", form: { schema } }

  const widthOf = (wrapper: any) => (wrapper.find(".v-dialog").element as HTMLElement).style.width

  const mountAdd = (props: Record<string, any> = {}) =>
    mount(AddItemDialog as any, { props: { viewId: "users", schema, ...props }, ...globalMocks })
  const mountAction = (form: Record<string, any> = {}) =>
    mount(ActionDialog as any, { props: { viewId: "users", action: { ...action, form: { ...action.form, ...form } } }, ...globalMocks })

  it("defaults to md for create/edit and sm for actions", () => {
    expect(widthOf(mountAdd())).toBe("600px")
    expect(widthOf(mountAction())).toBe("480px")
  })

  it("resolves a preset to its pixel width", () => {
    expect(widthOf(mountAdd({ width: "lg" }))).toBe("800px")
    expect(widthOf(mountAction({ width: "xl" }))).toBe("1000px")
  })

  it("takes a number as pixels", () => {
    expect(widthOf(mountAdd({ width: 900 }))).toBe("900px")
    expect(widthOf(mountAction({ width: 720 }))).toBe("720px")
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { ref } from "vue"
import { JsonInput } from "../src/components/inputs/getInput"
import { FORM_ITEM_KEY } from "../src/utils/formItem"
import VInputText from "../src/components/inputs/VInputText.vue"
import VInputTextArea from "../src/components/inputs/VInputTextArea.vue"
import VInputNumber from "../src/components/inputs/VInputNumber.vue"
import VDateInput from "../src/components/inputs/VDateInput.vue"
import VCheckbox from "../src/components/inputs/VCheckbox.vue"
import VSelectInput from "../src/components/inputs/VSelectInput.vue"
import VSelectListInput from "../src/components/inputs/VSelectListInput.vue"
import VSelectChipsInput from "../src/components/inputs/VSelectChipsInput.vue"
import VFileInput from "../src/components/inputs/VFileInput.vue"
import VInputObject from "../src/components/inputs/VInputObject"
import VCustomInput from "../src/components/inputs/VCustomInput"

// The list input resolves reference labels over the network; stub the API layer
// so tests control the responses. (Static-options tests never touch it.)
vi.mock("../src/api/dataApi", () => ({
  dataApi: {
    getReferenceOptions: vi.fn(),
    getPageData: vi.fn(),
    getItemData: vi.fn(),
    getData: vi.fn(),
  },
}))
import { dataApi } from "../src/api/dataApi"

// VCustomInput dynamically imports the server-compiled module; stub the loader
// with a fake component that echoes the props it receives.
vi.mock("../src/utils/loadCustomComponent", async () => {
  const { defineComponent, h } = await import("vue")
  const FakeCustom = defineComponent({
    props: ["modelValue", "values", "name", "item"],
    setup: (props: any) => () =>
      h("div", { class: "fake-custom" },
        `${props.name}/${props.values?.name}/${props.item ? props.item.id : "null"}/${(props.modelValue ?? []).length}`),
  })
  return { loadCustomComponent: async () => FakeCustom }
})

// JsonInput maps a schema to the right input component. We assert the vnode's
// component type rather than mounting, since some inputs fetch on mount.
describe("JsonInput dispatch", () => {
  const typeOf = (schema: any) => (JsonInput({ schema }) as any).type

  it("renders a text input for a plain string", () => {
    expect(typeOf({ type: "string" })).toBe(VInputText)
  })

  it("renders a textarea for a multiline string", () => {
    expect(typeOf({ type: "string", multiline: true })).toBe(VInputTextArea)
  })

  it("renders a checkbox for a boolean", () => {
    expect(typeOf({ type: "boolean" })).toBe(VCheckbox)
  })

  it("renders the object input for an object", () => {
    expect(typeOf({ type: "object", properties: {} })).toBe(VInputObject)
  })

  it("renders a select for static options", () => {
    expect(typeOf({ type: "string", options: [{ value: "a", label: "A" }] })).toBe(VSelectInput)
  })

  it("renders a select for a reference field", () => {
    expect(typeOf({ type: "number", reference: { page: "users", label: "name" } })).toBe(VSelectInput)
  })

  it("renders the file input for format:file", () => {
    expect(typeOf({ type: "string", format: "file" })).toBe(VFileInput)
  })

  it("prefers the file input over a plain string when format is file", () => {
    // format:"file" is a string field but must not fall through to VInputText.
    expect(typeOf({ type: "string", format: "file" })).not.toBe(VInputText)
  })

  it("renders a select for an enum", () => {
    expect(typeOf({ type: "string", enum: ["user", "moderator"] })).toBe(VSelectInput)
  })

  it("renders a number input for numbers and integers", () => {
    expect(typeOf({ type: "number" })).toBe(VInputNumber)
    expect(typeOf({ type: "integer" })).toBe(VInputNumber)
  })

  it("renders a date input for the native date type", () => {
    expect(typeOf({ type: "date" })).toBe(VDateInput)
  })

  it("still renders a date input for the format:date/datetime hint", () => {
    expect(typeOf({ type: "string", format: "date" })).toBe(VDateInput)
    expect(typeOf({ type: "string", format: "datetime" })).toBe(VDateInput)
  })

  it("passes datetime:true only for the datetime hint", () => {
    expect((JsonInput({ schema: { type: "date" } }) as any).props.datetime).toBe(false)
    expect((JsonInput({ schema: { type: "date", format: "datetime" } }) as any).props.datetime).toBe(true)
  })

  it("renders the custom-component wrapper for a display-only component field", () => {
    expect(typeOf({ type: "component", component: "users.update.posts" })).toBe(VCustomInput)
  })

  it("lets a component annotation override the built-in input for a real type", () => {
    expect(typeOf({ type: "string", component: "users.update.color" })).toBe(VCustomInput)
    expect(typeOf({ type: "array", items: { type: "string" }, component: "users.update.tags" })).toBe(VCustomInput)
  })

  it("passes the served component key through to the wrapper", () => {
    const vnode = JsonInput({ schema: { type: "component", component: "users.update.posts" } }) as any
    expect(vnode.props.component).toBe("users.update.posts")
  })

  it("forwards enum values and nullable to the select", () => {
    const vnode = JsonInput({ schema: { type: "string", enum: ["a", "b"], nullable: true } }) as any
    expect(vnode.props.enum).toEqual(["a", "b"])
    expect(vnode.props.nullable).toBe(true)
  })

  it("forwards the keyed enum metadata to the chips input and the single select", () => {
    const meta = { enumLabels: { a: "A!" }, enumColors: { a: "red" } }
    const arr = JsonInput({ schema: { type: "array", items: { type: "string", enum: ["a"], ...meta } } }) as any
    expect(arr.type).toBe(VSelectChipsInput)
    expect(arr.props.enumLabels).toEqual(meta.enumLabels)
    expect(arr.props.enumColors).toEqual(meta.enumColors)

    const single = JsonInput({ schema: { type: "string", enum: ["a"], ...meta } }) as any
    expect(single.type).toBe(VSelectInput)
    expect(single.props.enumLabels).toEqual(meta.enumLabels)
    expect(single.props.enumColors).toEqual(meta.enumColors)
  })

  it("renders the select list for an array with a reference on the array node", () => {
    expect(typeOf({ type: "array", items: { type: "number" }, reference: { method: "posts.create.tagIds" } }))
      .toBe(VSelectListInput)
  })

  it("renders the select list for an array with a reference on items", () => {
    expect(typeOf({ type: "array", items: { type: "number", reference: { method: "x" } } })).toBe(VSelectListInput)
  })

  it("renders chips for an array over a static source (options or enum)", () => {
    expect(typeOf({ type: "array", items: { type: "string", options: [{ value: "a", label: "A" }] } })).toBe(VSelectChipsInput)
    expect(typeOf({ type: "array", items: { type: "string", enum: ["a", "b"] } })).toBe(VSelectChipsInput)
    expect(typeOf({ type: "array", items: { type: "string" }, enum: ["a", "b"] })).toBe(VSelectChipsInput)
  })

  it("lets view pick the input against the source default", () => {
    // A reference array opts into chips (the small-tags-table case)…
    expect(typeOf({ type: "array", view: "chips", items: { type: "number", reference: { method: "x" } } }))
      .toBe(VSelectChipsInput)
    // …and a static array opts back into the row list.
    expect(typeOf({ type: "array", view: "list", items: { type: "string", enum: ["a", "b"] } }))
      .toBe(VSelectListInput)
  })

  it("always renders the (draggable) list for a sortable array, even over chips", () => {
    const vnode = JsonInput({ schema: {
      type: "array", sortable: true, view: "chips",
      items: { type: "string", enum: ["a", "b"] },
    } }) as any
    expect(vnode.type).toBe(VSelectListInput)
    expect(vnode.props.sortable).toBe(true)
  })

  it("forwards the items' source and the sortable hint to the select list", () => {
    const vnode = JsonInput({ schema: {
      type: "array",
      sortable: true,
      items: { type: "number", reference: { method: "posts.create.tagIds" } },
    } }) as any
    expect(vnode.type).toBe(VSelectListInput)
    expect(vnode.props.reference).toEqual({ method: "posts.create.tagIds" })
    expect(vnode.props.sortable).toBe(true)
  })

  it("leaves a plain array (no select source) on the fallback input", () => {
    expect(typeOf({ type: "array", items: { type: "string" } })).toBe(VInputText)
  })
})

describe("VSelectListInput", () => {
  const options = [
    { value: 1, label: "News" },
    { value: 2, label: "Guide" },
    { value: 3, label: "Release" },
  ]

  it("renders a row per selected value, labeled from the options", () => {
    const wrapper = mount(VSelectListInput, { props: { modelValue: [2, 1], options } })
    const labels = wrapper.findAll(".v-select-list-input__label").map((n) => n.text())
    expect(labels).toEqual(["Guide", "News"])
  })

  it("falls back to the raw value for an unknown label", () => {
    const wrapper = mount(VSelectListInput, { props: { modelValue: [9], options } })
    expect(wrapper.find(".v-select-list-input__label").text()).toBe("9")
  })

  it("appends the picked option when the embedded select reports a selection", async () => {
    const wrapper = mount(VSelectListInput, { props: { modelValue: [1], options } })
    wrapper.findComponent(VSelectInput).vm.$emit("select", { value: 3, label: "Release" })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([[1, 3]])
  })

  it("hides already-picked values from the embedded select", () => {
    const wrapper = mount(VSelectListInput, { props: { modelValue: [1, 3], options } })
    expect(wrapper.findComponent(VSelectInput).props("excludeValues")).toEqual([1, 3])
  })

  it("removes a value via its row button", async () => {
    const wrapper = mount(VSelectListInput, { props: { modelValue: [1, 2, 3], options } })
    await wrapper.findAll(".v-select-list-input__remove")[1]!.trigger("click")
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([[1, 3]])
  })

  it("shows drag handles only when sortable", () => {
    const plain = mount(VSelectListInput, { props: { modelValue: [1, 2], options } })
    expect(plain.find(".v-select-list-input__handle").exists()).toBe(false)

    const sortable = mount(VSelectListInput, { props: { modelValue: [1, 2], options, sortable: true } })
    expect(sortable.findAll(".v-select-list-input__handle")).toHaveLength(2)
  })

  it("reorders on a pointer drag and emits the array in the new order", async () => {
    const wrapper = mount(VSelectListInput, { props: { modelValue: [1, 2, 3], options, sortable: true } })
    const rows = wrapper.findAll(".v-select-list-input__item")
    // happy-dom does no layout — stub the row offsets the drag math measures.
    rows.forEach((row, i) => Object.defineProperty(row.element, "offsetTop", { value: i * 40 }))

    // Grab row 0's handle and drag two row-steps down (to index 2).
    await rows[0]!.find(".v-select-list-input__handle").trigger("pointerdown", { clientY: 0 })
    const move = new Event("pointermove") as any
    move.clientY = 80
    window.dispatchEvent(move)
    await wrapper.vm.$nextTick()
    window.dispatchEvent(new Event("pointerup"))

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([[2, 3, 1]])
  })
})

describe("VSelectListInput batched label resolution", () => {
  const reference = { method: "posts.update.tagIds" }
  const labels = (wrapper: any) => wrapper.findAll(".v-select-list-input__label").map((n: any) => n.text())

  beforeEach(() => {
    vi.mocked(dataApi.getReferenceOptions).mockReset()
  })

  it("resolves preselected values with a single batched request", async () => {
    vi.mocked(dataApi.getReferenceOptions).mockResolvedValueOnce({
      items: [{ value: 1, label: "News" }, { value: 2, label: "Guide" }],
    })
    const wrapper = mount(VSelectListInput, { props: { modelValue: [1, 2], reference } })
    await flushPromises()

    expect(dataApi.getReferenceOptions).toHaveBeenCalledTimes(1)
    expect(dataApi.getReferenceOptions).toHaveBeenCalledWith("posts.update.tagIds", { values: [1, 2] })
    expect(labels(wrapper)).toEqual(["News", "Guide"])
  })

  it("falls back to per-value lookups for ids the batch didn't return", async () => {
    vi.mocked(dataApi.getReferenceOptions)
      .mockResolvedValueOnce({ items: [{ value: 1, label: "News" }] })   // batch — handler ignored id 2
      .mockResolvedValueOnce({ items: [{ value: 2, label: "Guide" }] })  // per-value fallback
    const wrapper = mount(VSelectListInput, { props: { modelValue: [1, 2], reference } })
    await flushPromises()

    expect(dataApi.getReferenceOptions).toHaveBeenCalledTimes(2)
    expect(vi.mocked(dataApi.getReferenceOptions).mock.calls[1]).toEqual(["posts.update.tagIds", { value: 2 }])
    expect(labels(wrapper)).toEqual(["News", "Guide"])
  })

  it("shows the raw value when neither the batch nor the fallback knows it", async () => {
    vi.mocked(dataApi.getReferenceOptions).mockResolvedValue({ items: [] })
    const wrapper = mount(VSelectListInput, { props: { modelValue: [9], reference } })
    await flushPromises()

    expect(labels(wrapper)).toEqual(["9"])
  })

  it("does not refetch labels it already knows when a value is added", async () => {
    vi.mocked(dataApi.getReferenceOptions).mockResolvedValueOnce({
      items: [{ value: 1, label: "News" }],
    })
    const wrapper = mount(VSelectListInput, { props: { modelValue: [1], reference } })
    await flushPromises()
    expect(dataApi.getReferenceOptions).toHaveBeenCalledTimes(1)

    // Picking an option supplies its label via the `select` event — no request.
    wrapper.findComponent(VSelectInput).vm.$emit("select", { value: 2, label: "Guide" })
    await wrapper.setProps({ modelValue: [1, 2] })
    await flushPromises()

    expect(dataApi.getReferenceOptions).toHaveBeenCalledTimes(1)
    expect(labels(wrapper)).toEqual(["News", "Guide"])
  })
})

describe("VSelectChipsInput", () => {
  const options = [
    { value: "featured", label: "Featured" },
    { value: "pinned", label: "Pinned" },
    { value: "archived", label: "Archived" },
  ]
  const chipLabels = (wrapper: any) => wrapper.findAll(".v-select-chips-input__chip-label").map((n: any) => n.text())

  it("renders a chip per selected value, labeled from the options", () => {
    const wrapper = mount(VSelectChipsInput, { props: { modelValue: ["pinned", "featured"], options } })
    expect(chipLabels(wrapper)).toEqual(["Pinned", "Featured"])
  })

  it("renders enum values as their own labels", () => {
    const wrapper = mount(VSelectChipsInput, { props: { modelValue: ["a"], enum: ["a", "b"] } })
    expect(chipLabels(wrapper)).toEqual(["a"])
  })

  it("appends the picked option when the embedded select reports a selection", async () => {
    const wrapper = mount(VSelectChipsInput, { props: { modelValue: ["featured"], options } })
    wrapper.findComponent(VSelectInput).vm.$emit("select", { value: "pinned", label: "Pinned" })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([["featured", "pinned"]])
  })

  it("hides already-picked values from the embedded select", () => {
    const wrapper = mount(VSelectChipsInput, { props: { modelValue: ["featured", "pinned"], options } })
    expect(wrapper.findComponent(VSelectInput).props("excludeValues")).toEqual(["featured", "pinned"])
  })

  it("removes a value via its chip button", async () => {
    const wrapper = mount(VSelectChipsInput, { props: { modelValue: ["featured", "pinned", "archived"], options } })
    await wrapper.findAll(".v-select-chips-input__remove")[1]!.trigger("click")
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([["featured", "archived"]])
  })

  it("labels and colors chips via the keyed enum metadata (partial coverage falls back)", () => {
    const wrapper = mount(VSelectChipsInput, { props: {
      modelValue: ["featured", "archived"],
      enum: ["featured", "archived"],
      enumLabels: { featured: "Featured" },
      enumColors: { featured: "red" },
    } })
    expect(chipLabels(wrapper)).toEqual(["Featured", "archived"])
    const chips = wrapper.findAll(".v-select-chips-input__chip")
    expect(chips[0]!.attributes("style")).toContain("color")
    expect(chips[1]!.attributes("style")).toBeUndefined()
  })

  it("keeps the color a picked option carries (e.g. from a reference method)", async () => {
    const wrapper = mount(VSelectChipsInput, { props: { modelValue: [], reference: { method: "m" } } })
    wrapper.findComponent(VSelectInput).vm.$emit("select", { value: 1, label: "News", color: "green" })
    await wrapper.setProps({ modelValue: [1] })
    const chip = wrapper.find(".v-select-chips-input__chip")
    expect(chip.text()).toBe("News")
    expect(chip.attributes("style")).toContain("color")
  })

  it("resolves reference labels with the same single batched request as the list", async () => {
    vi.mocked(dataApi.getReferenceOptions).mockReset()
    vi.mocked(dataApi.getReferenceOptions).mockResolvedValueOnce({
      items: [{ value: 1, label: "News" }, { value: 2, label: "Guide" }],
    })
    const wrapper = mount(VSelectChipsInput, {
      props: { modelValue: [1, 2], reference: { method: "posts.update.tagIds" } },
    })
    await flushPromises()

    expect(dataApi.getReferenceOptions).toHaveBeenCalledTimes(1)
    expect(dataApi.getReferenceOptions).toHaveBeenCalledWith("posts.update.tagIds", { values: [1, 2] })
    expect(chipLabels(wrapper)).toEqual(["News", "Guide"])
  })
})

describe("custom form components", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      posts: { type: "component", component: "users.update.posts" },
    },
    required: ["name"],
  }

  it("threads the field value, sibling values and the provided record into the loaded component", async () => {
    const wrapper = mount(VInputObject as any, {
      props: {
        schema,
        // Form values hold schema-declared fields only — never the primary key.
        modelValue: { name: "Alice", posts: [{ id: 1 }, { id: 2 }] },
      },
      // The dialogs provide the persisted record; identity travels here.
      global: { provide: { [FORM_ITEM_KEY as symbol]: ref({ id: 7, name: "Alice" }) } },
    })
    await flushPromises()

    // name (field key) / values.name (sibling) / item.id / modelValue.length
    expect(wrapper.find(".fake-custom").text()).toBe("posts/Alice/7/2")
  })

  it("passes item: null when nothing provides a record (create mode)", async () => {
    const wrapper = mount(VInputObject as any, {
      props: { schema, modelValue: { name: "Bob", posts: [] } },
    })
    await flushPromises()

    expect(wrapper.find(".fake-custom").text()).toBe("posts/Bob/null/0")
  })
})

describe("input rendering", () => {
  it("binds a text input to the model value", () => {
    const wrapper = mount(VInputText, { props: { modelValue: "hello" } })
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("hello")
  })

  it("reflects a checkbox's boolean model value", () => {
    const wrapper = mount(VCheckbox, { props: { modelValue: true } })
    expect(wrapper.text()).toBeDefined()
  })

  it("parses number input into a numeric model value", async () => {
    const wrapper = mount(VInputNumber, { props: { modelValue: 5 } })
    await wrapper.find("input").setValue("42.5")
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([42.5])
  })

  it("emits null (nullable) or undefined when a number input is emptied", async () => {
    const nullable = mount(VInputNumber, { props: { modelValue: 5, nullable: true } })
    await nullable.find("input").setValue("")
    expect(nullable.emitted("update:modelValue")?.at(-1)).toEqual([null])

    const plain = mount(VInputNumber, { props: { modelValue: 5 } })
    await plain.find("input").setValue("")
    expect(plain.emitted("update:modelValue")?.at(-1)).toEqual([undefined])
  })

  it("trims a stored ISO datetime to the native date input format", () => {
    const wrapper = mount(VDateInput, { props: { modelValue: "1990-05-01T00:00:00.000Z" } })
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("1990-05-01")
  })
})

describe("nullable clear cross", () => {
  it("shows the cross only for nullable fields with a value", () => {
    expect(mount(VInputText, { props: { modelValue: "x", nullable: true } }).find(".v-input-clear").exists()).toBe(true)
    expect(mount(VInputText, { props: { modelValue: "x" } }).find(".v-input-clear").exists()).toBe(false)
    expect(mount(VInputText, { props: { modelValue: "", nullable: true } }).find(".v-input-clear").exists()).toBe(false)
  })

  it("resets the value to null on click", async () => {
    const wrapper = mount(VInputText, { props: { modelValue: "x", nullable: true } })
    await wrapper.find(".v-input-clear").trigger("click")
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([null])
  })

  it("clears a nullable date field to null", async () => {
    const wrapper = mount(VDateInput, { props: { modelValue: "1990-05-01", nullable: true } })
    await wrapper.find(".v-input-clear").trigger("click")
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([null])
  })
})

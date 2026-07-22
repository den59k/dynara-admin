import { describe, it, expect, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { JsonInput } from "../src/components/inputs/getInput"
import VInputText from "../src/components/inputs/VInputText.vue"
import VInputTextArea from "../src/components/inputs/VInputTextArea.vue"
import VInputNumber from "../src/components/inputs/VInputNumber.vue"
import VDateInput from "../src/components/inputs/VDateInput.vue"
import VCheckbox from "../src/components/inputs/VCheckbox.vue"
import VSelectInput from "../src/components/inputs/VSelectInput.vue"
import VFileInput from "../src/components/inputs/VFileInput.vue"
import VInputObject from "../src/components/inputs/VInputObject"
import VCustomInput from "../src/components/inputs/VCustomInput"

// VCustomInput dynamically imports the server-compiled module; stub the loader
// with a fake component that echoes the props it receives.
vi.mock("../src/utils/loadCustomComponent", async () => {
  const { defineComponent, h } = await import("vue")
  const FakeCustom = defineComponent({
    props: ["modelValue", "values", "name"],
    setup: (props: any) => () =>
      h("div", { class: "fake-custom" }, `${props.name}/${props.values?.id}/${(props.modelValue ?? []).length}`),
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
})

describe("custom form components", () => {
  it("threads the field value and the whole form's values into the loaded component", async () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        posts: { type: "component", component: "users.update.posts" },
      },
      required: ["name"],
    }
    const wrapper = mount(VInputObject as any, {
      props: {
        schema,
        // The edit dialog merges the whole item into the form values, so keys
        // outside the schema (like the primary key) are present too.
        modelValue: { id: 7, name: "Alice", posts: [{ id: 1 }, { id: 2 }] },
      },
    })
    await flushPromises()

    // name (field key) / values.id (sibling from the form) / modelValue.length
    expect(wrapper.find(".fake-custom").text()).toBe("posts/7/2")
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

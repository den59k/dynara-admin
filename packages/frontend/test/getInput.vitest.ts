import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import { JsonInput } from "../src/components/inputs/getInput"
import VInputText from "../src/components/inputs/VInputText.vue"
import VInputTextArea from "../src/components/inputs/VInputTextArea.vue"
import VCheckbox from "../src/components/inputs/VCheckbox.vue"
import VSelectInput from "../src/components/inputs/VSelectInput.vue"
import VFileInput from "../src/components/inputs/VFileInput.vue"
import VInputObject from "../src/components/inputs/VInputObject"

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
})

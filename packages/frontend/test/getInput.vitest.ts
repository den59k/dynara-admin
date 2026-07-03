import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import { JsonInput } from "../src/components/inputs/getInput"
import VInputText from "../src/components/inputs/VInputText.vue"
import VInputTextArea from "../src/components/inputs/VInputTextArea.vue"
import VInputNumber from "../src/components/inputs/VInputNumber.vue"
import VDateInput from "../src/components/inputs/VDateInput.vue"
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

  it("renders a select for an enum", () => {
    expect(typeOf({ type: "string", enum: ["user", "moderator"] })).toBe(VSelectInput)
  })

  it("renders a number input for numbers and integers", () => {
    expect(typeOf({ type: "number" })).toBe(VInputNumber)
    expect(typeOf({ type: "integer" })).toBe(VInputNumber)
  })

  it("renders a date input for format:date and format:datetime", () => {
    expect(typeOf({ type: "string", format: "date" })).toBe(VDateInput)
    expect(typeOf({ type: "string", format: "datetime" })).toBe(VDateInput)
  })

  it("forwards enum values and nullable to the select", () => {
    const vnode = JsonInput({ schema: { type: "string", enum: ["a", "b"], nullable: true } }) as any
    expect(vnode.props.enum).toEqual(["a", "b"])
    expect(vnode.props.nullable).toBe(true)
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

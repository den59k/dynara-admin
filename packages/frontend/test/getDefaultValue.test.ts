import { describe, it, expect } from "bun:test"
import { getDefaultValue } from "../src/utils/getDefaultValue"

// The form dialog seeds its model with getDefaultValue(schema) before rendering
// inputs, so these defaults determine what an untouched "create" form submits.
describe("getDefaultValue", () => {
  it("uses an explicit default when present", () => {
    expect(getDefaultValue({ type: "string", default: "hi" })).toBe("hi")
  })

  it("returns null for nullable fields", () => {
    expect(getDefaultValue({ type: "string", nullable: true })).toBeNull()
  })

  it("returns 0 for numbers and integers", () => {
    expect(getDefaultValue({ type: "number" })).toBe(0)
    expect(getDefaultValue({ type: "integer" })).toBe(0)
  })

  it("returns false for booleans", () => {
    expect(getDefaultValue({ type: "boolean" })).toBe(false)
  })

  it("returns an empty string for plain strings", () => {
    expect(getDefaultValue({ type: "string" })).toBe("")
  })

  it("returns an empty array for arrays", () => {
    expect(getDefaultValue({ type: "array", items: { type: "string" } })).toEqual([])
  })

  it("starts select, reference and file fields empty (null), not at 0/\"\"", () => {
    expect(getDefaultValue({ type: "string", options: [{ value: "a", label: "A" }] })).toBeNull()
    expect(getDefaultValue({ type: "number", reference: { page: "users", label: "name" } })).toBeNull()
    expect(getDefaultValue({ type: "string", format: "file" })).toBeNull()
  })

  it("builds an object, defaulting required fields and leaving optionals undefined", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        bio: { type: "string" },
      },
      required: ["name", "age"],
    }
    expect(getDefaultValue(schema)).toEqual({ name: "", age: 0, bio: undefined })
  })
})

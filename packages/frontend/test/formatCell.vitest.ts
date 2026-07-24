import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import { formatValue, badgeColor, resolveColor, isEmptyValue } from "../src/utils/formatCell"
import VTable from "../src/components/VTable.vue"

describe("formatValue", () => {
  it("stringifies plain values", () => {
    expect(formatValue(42, {})).toBe("42")
    expect(formatValue("hi", { type: "text" })).toBe("hi")
  })

  it("formats a money value with a currency symbol", () => {
    // Locale-independent assertions: the amount and currency code are present.
    const out = formatValue(1500, { type: "money", currency: "USD" })
    expect(out).toMatch(/1[,.\s]?500/)
    expect(out).toMatch(/\$|USD/)
  })

  it("formats money without a currency as a grouped number", () => {
    expect(formatValue(1000000, { type: "money" })).toMatch(/1[,.\s]000[,.\s]000/)
  })

  it("passes a non-numeric money value through unchanged", () => {
    expect(formatValue("N/A", { type: "money", currency: "USD" })).toBe("N/A")
  })

  it("formats a date from epoch millis", () => {
    const millis = Date.UTC(2023, 0, 15)
    const out = formatValue(millis, { type: "date" })
    // The exact format is locale-dependent, but the year must appear.
    expect(out).toContain("2023")
  })

  it("includes the time for a datetime column", () => {
    const millis = Date.UTC(2023, 0, 15, 13, 30)
    const dateOnly = formatValue(millis, { type: "date", format: "date" })
    const dateTime = formatValue(millis, { type: "date", format: "datetime" })
    expect(dateTime.length).toBeGreaterThan(dateOnly.length)
  })

  it("passes an unparseable date through unchanged", () => {
    expect(formatValue("not-a-date", { type: "date" })).toBe("not-a-date")
  })
})

describe("badgeColor", () => {
  it("resolves a named color to its hex", () => {
    expect(badgeColor("admin", { colors: { admin: "red" } })).toBe("#DE3D5D")
  })

  it("uses an unknown color name verbatim (e.g. hex)", () => {
    expect(badgeColor("x", { colors: { x: "#123456" } })).toBe("#123456")
  })

  it("falls back to the neutral color when the value has no mapping", () => {
    expect(badgeColor("other", { colors: { admin: "red" } })).toBe("var(--text-secondary-color)")
  })
})

describe("resolveColor", () => {
  it("maps palette names to their hex and passes raw CSS colors through", () => {
    expect(resolveColor("purple")).toBe("#8B5CF6")
    expect(resolveColor("#FF0000")).toBe("#FF0000")
  })
})

// The badge column accepts array values (e.g. an enum-chips field): one pill
// per element, colored through the same `colors` record a form field's
// `enumColors` uses.
describe("badge column array rendering", () => {
  const columns = [{ title: "Labels", field: "labels", type: "badge" as const, colors: { featured: "red" } }]

  it("renders one pill per array element", () => {
    const wrapper = mount(VTable as any, { props: { data: [{ labels: ["featured", "pinned"] }], columns } })
    expect(wrapper.findAll(".v-table__badge").map((p) => p.text())).toEqual(["featured", "pinned"])
  })

  it("still renders a scalar value as a single pill", () => {
    const wrapper = mount(VTable as any, { props: { data: [{ labels: "featured" }], columns } })
    expect(wrapper.findAll(".v-table__badge")).toHaveLength(1)
  })

  it("renders the empty placeholder for an empty array", () => {
    const wrapper = mount(VTable as any, { props: { data: [{ labels: [] }], columns } })
    expect(wrapper.findAll(".v-table__badge")).toHaveLength(0)
    expect(wrapper.find(".v-table__empty").exists()).toBe(true)
  })
})

describe("isEmptyValue", () => {
  it("treats null, undefined and empty string as empty", () => {
    expect(isEmptyValue(null)).toBe(true)
    expect(isEmptyValue(undefined)).toBe(true)
    expect(isEmptyValue("")).toBe(true)
  })

  it("treats 0 and false as present", () => {
    expect(isEmptyValue(0)).toBe(false)
    expect(isEmptyValue(false)).toBe(false)
  })
})

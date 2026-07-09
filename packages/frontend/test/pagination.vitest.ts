import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import VPagination from "../src/components/VPagination.vue"

// Rendered labels of the numbered slots (chevrons are icon-only, so their
// buttons have empty text and are filtered out).
const labels = (wrapper: ReturnType<typeof mount>) =>
  [...wrapper.element.querySelectorAll(".v-pagination__button, .v-pagination__ellipsis")]
    .map((el) => el.textContent!.trim())
    .filter((text) => text !== "")

const make = (page: number, total: number, pageSize = 20) =>
  mount(VPagination, { props: { page, total, pageSize } })

describe("VPagination", () => {
  it("shows every page when there are few", () => {
    expect(labels(make(0, 100))).toEqual(["1", "2", "3", "4", "5"])
  })

  it("collapses the tail behind an ellipsis from the first page", () => {
    expect(labels(make(0, 500))).toEqual(["1", "2", "3", "4", "…", "25"])
  })

  it("shows both ellipses around a middle page", () => {
    expect(labels(make(12, 500))).toEqual(["1", "…", "12", "13", "14", "…", "25"])
  })

  it("widens the window near the last page", () => {
    expect(labels(make(24, 500))).toEqual(["1", "…", "22", "23", "24", "25"])
  })

  it("emits the target page and clamps out-of-range clicks", async () => {
    const wrapper = make(0, 100)
    const buttons = [...wrapper.findAll(".v-pagination__button")]
    // First button is the disabled prev chevron; click page "3".
    await buttons.find((b) => b.text() === "3")!.trigger("click")
    expect(wrapper.emitted("update:page")![0]).toEqual([2])
    // Prev from the first page emits nothing (disabled + clamped).
    await buttons[0].trigger("click")
    expect(wrapper.emitted("update:page")!.length).toBe(1)
  })
})

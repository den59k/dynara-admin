import { describe, it, expect, beforeEach } from "vitest"
import { defineComponent, h, nextTick, ref } from "vue"
import { mount } from "@vue/test-utils"
import VDialogProvider, { createDialogSystem, useDialogGuard, type DialogStore } from "../src/components/VDialogProvider.vue"

// A stand-in for a form dialog: registers a dirty-guard driven by `dirty`.
const dirty = ref(false)
const FakeFormDialog = defineComponent({
  setup() {
    useDialogGuard(() => dirty.value)
    return () => h("div", { class: "fake-form" }, "form")
  },
})

const mountProvider = () => {
  const wrapper = mount(VDialogProvider, {
    global: { plugins: [createDialogSystem()] },
  })
  const store = (wrapper.vm.$ as any).appContext.provides["dialogStore"] as DialogStore & {
    dialogHistory: any[]
  }
  return { wrapper, store }
}

describe("dialog dirty-guard", () => {
  beforeEach(() => {
    dirty.value = false
    document.body.innerHTML = ""
  })

  it("back() closes a clean dialog immediately", async () => {
    const { store } = mountProvider()
    store.open(FakeFormDialog as any)
    await nextTick()
    expect(store.dialogHistory.length).toBe(1)

    store.back()
    await nextTick()
    expect(store.dialogHistory.length).toBe(0)
  })

  it("back() on a dirty dialog stacks a discard confirmation instead of closing", async () => {
    const { store } = mountProvider()
    store.open(FakeFormDialog as any)
    await nextTick()
    dirty.value = true

    store.back()
    await nextTick()
    // The form dialog is still there; a confirmation dialog sits on top.
    expect(store.dialogHistory.length).toBe(2)
    expect(document.body.textContent).toContain("Discard changes?")
  })

  it("cancelling the confirmation returns to the form", async () => {
    const { store } = mountProvider()
    store.open(FakeFormDialog as any)
    await nextTick()
    dirty.value = true
    store.back()
    await nextTick()

    // The confirmation itself has no guard, so back() just pops it.
    store.back()
    await nextTick()
    expect(store.dialogHistory.length).toBe(1)
    expect(document.body.querySelector(".fake-form")).toBeTruthy()
  })

  it("confirming the discard closes both dialogs", async () => {
    const { store } = mountProvider()
    store.open(FakeFormDialog as any)
    await nextTick()
    dirty.value = true
    store.back()
    await nextTick()

    // The confirm button is the primary (non-outline) action of the top dialog.
    const buttons = [...document.body.querySelectorAll(".v-dialog__actions .v-button")]
    const confirmButton = buttons.find((b) => !b.classList.contains("outline")) as HTMLElement
    expect(confirmButton).toBeTruthy()
    confirmButton.click()
    await nextTick()
    await nextTick()
    expect(store.dialogHistory.length).toBe(0)
  })

  it("back(true) force-closes a dirty dialog without asking", async () => {
    const { store } = mountProvider()
    store.open(FakeFormDialog as any)
    await nextTick()
    dirty.value = true

    store.back(true)
    await nextTick()
    expect(store.dialogHistory.length).toBe(0)
  })
})

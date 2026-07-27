import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import VFileListInput from "../src/components/inputs/VFileListInput.vue"

// The gallery field: many pictures, uploaded together, reordered by dragging,
// each removable and (when the field declares a size) re-croppable.

const mocks = vi.hoisted(() => ({ sendXHR: vi.fn() }))
vi.mock("../src/api/request", () => ({
  apiUrl: (path: string) => `/api/admin${path}`,
  sendXHR: mocks.sendXHR,
}))
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { viewId: "posts" } }) }))

// happy-dom decodes no images and has no canvas, so the crop is stubbed; its
// geometry has its own tests (test/cropImage.test.ts).
const crop = vi.hoisted(() => ({ autoCrop: vi.fn() }))
vi.mock("../src/utils/cropImage", () => ({ autoCrop: crop.autoCrop }))

const dialogStore = { open: vi.fn(), close: vi.fn(), back: vi.fn(), setGuard: vi.fn() }

beforeEach(() => {
  mocks.sendXHR.mockReset()
  dialogStore.open.mockReset()
  crop.autoCrop.mockReset()
  crop.autoCrop.mockImplementation(async (file: File) => ({
    file: new File(["cropped"], file.name, { type: file.type }),
    rect: { x: 0, y: 0, width: 100, height: 100 },
  }))
  URL.createObjectURL = vi.fn(() => "blob:preview") as any
  URL.revokeObjectURL = vi.fn() as any
})

const value = (src: string) => ({ src, previewSrc: `${src}-thumb`, size: 10 })

const mountList = (props: Record<string, any> = {}) =>
  mount(VFileListInput as any, {
    props: { name: "gallery", image: true, structured: true, ...props },
    global: { provide: { dialogStore } },
  })

const png = (name: string) => new File(["x"], name, { type: "image/png" })

// Drives a pick through the hidden native input, the way the browser would.
const pickFiles = async (wrapper: any, files: File[]) => {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, "files", { value: files, configurable: true })
  await input.trigger("change")
  await flushPromises()
}

const tiles = (wrapper: any) => wrapper.findAll(".v-file-list-input__tile")
const srcs = (wrapper: any) => tiles(wrapper).map((t: any) => t.find("img").attributes("src"))
const actionOn = (wrapper: any, index: number, title: string) =>
  tiles(wrapper).at(index)!.findAll("a,button").find((el: any) => el.attributes("title") === title)

describe("VFileListInput display", () => {
  it("renders one tile per picture, thumbnails first", () => {
    const wrapper = mountList({ modelValue: [value("/a.png"), value("/b.png")] })

    expect(srcs(wrapper)).toEqual(["/a.png-thumb", "/b.png-thumb"])
  })

  it("marks the first picture as the cover, since the order is the setting", () => {
    const wrapper = mountList({ modelValue: [value("/a.png"), value("/b.png")] })

    expect(tiles(wrapper).at(0)!.find(".v-file-list-input__cover").exists()).toBe(true)
    expect(tiles(wrapper).at(1)!.find(".v-file-list-input__cover").exists()).toBe(false)
  })

  it("names a file it can't show a picture for", () => {
    const wrapper = mountList({ image: false, modelValue: [{ src: "/docs/report.pdf" }] })

    expect(tiles(wrapper).at(0)!.find("img").exists()).toBe(false)
    expect(tiles(wrapper).at(0)!.find(".v-file-list-input__name").text()).toBe("report.pdf")
  })

  it("is one wide drop zone while empty", () => {
    const wrapper = mountList({ modelValue: [] })

    expect(tiles(wrapper)).toHaveLength(0)
    expect(wrapper.classes()).toContain("v-file-list-input--empty")
    expect(wrapper.find(".v-file-list-input__add").exists()).toBe(true)
  })
})

describe("VFileListInput adding", () => {
  it("uploads everything picked at once and keeps the picked order", async () => {
    // Answer out of order: the second file's request settles first.
    mocks.sendXHR
      .mockImplementationOnce(async () => { await new Promise((r) => setTimeout(r, 10)); return { value: value("/a.png") } })
      .mockImplementationOnce(async () => ({ value: value("/b.png") }))
    const wrapper = mountList({ modelValue: [] })

    await pickFiles(wrapper, [png("a.png"), png("b.png")])
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()

    expect(mocks.sendXHR).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted("update:modelValue")!.at(-1)![0]).toEqual([value("/a.png"), value("/b.png")])
  })

  it("appends to what is already there", async () => {
    mocks.sendXHR.mockResolvedValue({ value: value("/new.png") })
    const wrapper = mountList({ modelValue: [value("/old.png")] })

    await pickFiles(wrapper, [png("new.png")])

    expect(wrapper.emitted("update:modelValue")!.at(-1)![0]).toEqual([value("/old.png"), value("/new.png")])
  })

  it("crops each picture to the field's size on the way in", async () => {
    mocks.sendXHR.mockResolvedValue({ value: value("/a.png") })
    const wrapper = mountList({ modelValue: [], imageSize: [300, 200] })

    await pickFiles(wrapper, [png("a.png"), png("b.png")])

    expect(crop.autoCrop).toHaveBeenCalledTimes(2)
    expect(crop.autoCrop.mock.calls[0]![1]).toEqual({ width: 300, height: 200 })
  })

  it("keeps the ones that uploaded when another fails, and says so", async () => {
    mocks.sendXHR
      .mockResolvedValueOnce({ value: value("/a.png") })
      .mockRejectedValueOnce(new Error("boom"))
    const wrapper = mountList({ modelValue: [] })

    await pickFiles(wrapper, [png("a.png"), png("b.png")])

    expect(wrapper.emitted("update:modelValue")!.at(-1)![0]).toEqual([value("/a.png")])
    expect(wrapper.find(".v-form-control__error").text()).toBe("Upload failed")
  })

  it("refuses files the field doesn't accept, and uploads the rest", async () => {
    mocks.sendXHR.mockResolvedValue({ value: value("/a.png") })
    const wrapper = mountList({ modelValue: [], accept: "image/*" })

    await pickFiles(wrapper, [png("a.png"), new File(["x"], "report.pdf", { type: "application/pdf" })])

    expect(mocks.sendXHR).toHaveBeenCalledTimes(1)
    expect(wrapper.find(".v-form-control__error").text()).toBe("Unsupported file type")
  })

  it("takes dropped files too", async () => {
    mocks.sendXHR.mockResolvedValue({ value: value("/a.png") })
    const wrapper = mountList({ modelValue: [] })

    await wrapper.find(".v-file-list-input__grid").trigger("drop", { dataTransfer: { files: [png("a.png")] } })
    await flushPromises()

    expect(mocks.sendXHR).toHaveBeenCalledTimes(1)
  })
})

describe("VFileListInput removing", () => {
  it("takes one picture out and leaves the rest in order", async () => {
    const wrapper = mountList({ modelValue: [value("/a.png"), value("/b.png"), value("/c.png")] })

    await actionOn(wrapper, 1, "Remove")!.trigger("click")

    expect(wrapper.emitted("update:modelValue")![0]).toEqual([[value("/a.png"), value("/c.png")]])
  })
})

describe("VFileListInput reordering", () => {
  const sortable = { sortable: true, modelValue: [value("/a.png"), value("/b.png"), value("/c.png")] }

  // Tiles are laid out left to right, 100px apart, so a pointer at x=n*100+50
  // is over tile n.
  const layOut = (wrapper: any) => {
    tiles(wrapper).forEach((tile: any, index: number) => {
      tile.element.getBoundingClientRect = () =>
        ({ left: index * 100, right: index * 100 + 100, top: 0, bottom: 100 }) as DOMRect
    })
  }

  const dragTile = async (wrapper: any, from: number, toX: number) => {
    layOut(wrapper)
    await tiles(wrapper).at(from)!.trigger("pointerdown", { pointerId: 1, clientX: from * 100 + 50, clientY: 50 })
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: toX, clientY: 50 }))
    await flushPromises()
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }))
  }

  it("moves a picture to where it was dragged", async () => {
    const wrapper = mountList(sortable)

    // Carry the third tile onto the first.
    await dragTile(wrapper, 2, 50)

    expect(wrapper.emitted("update:modelValue")!.at(-1)![0])
      .toEqual([value("/c.png"), value("/a.png"), value("/b.png")])
  })

  it("ignores a press that doesn't travel — a click is not a drag", async () => {
    const wrapper = mountList(sortable)

    // Two pixels of jitter, well under the threshold.
    await dragTile(wrapper, 0, 52)

    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
  })

  it("doesn't reorder a list that was never declared sortable", async () => {
    const wrapper = mountList({ ...sortable, sortable: false })

    await dragTile(wrapper, 2, 50)

    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
  })
})

describe("VFileListInput re-cropping", () => {
  const sized = { imageSize: [300, 200] as [number, number] }

  const addOne = async (wrapper: any) => {
    mocks.sendXHR.mockResolvedValue({ value: value("/a.png") })
    await pickFiles(wrapper, [png("a.png")])
    await wrapper.setProps({ modelValue: [value("/a.png")] })
  }

  it("offers Crop only for pictures whose original is still at hand", async () => {
    const wrapper = mountList({ ...sized, modelValue: [value("/stored.png")] })
    // Loaded from the record: the stored picture is already cropped, and what
    // fell outside is gone.
    expect(actionOn(wrapper, 0, "Crop")).toBeUndefined()

    await addOne(wrapper)

    expect(actionOn(wrapper, 0, "Crop")).toBeDefined()
  })

  it("re-crops from the original and replaces that picture in place", async () => {
    const wrapper = mountList({ ...sized, modelValue: [] })
    await addOne(wrapper)
    await wrapper.setProps({ modelValue: [value("/first.png"), value("/a.png")] })

    dialogStore.open.mockImplementation((_dialog: any, props: any) =>
      props.onDone({ file: png("a.png"), rect: { x: 9, y: 9, width: 90, height: 90 } }))
    mocks.sendXHR.mockResolvedValue({ value: value("/recropped.png") })
    await actionOn(wrapper, 1, "Crop")!.trigger("click")
    await flushPromises()

    // Opened on the picked original and the crop currently in effect…
    const [, dialogProps] = dialogStore.open.mock.calls[0]!
    expect(dialogProps.file.name).toBe("a.png")
    expect(dialogProps.rect).toEqual({ x: 0, y: 0, width: 100, height: 100 })
    // …and the new picture took the old one's place, not the end of the list.
    expect(wrapper.emitted("update:modelValue")!.at(-1)![0])
      .toEqual([value("/first.png"), value("/recropped.png")])
  })

  it("leaves the picture alone when the crop dialog is dismissed", async () => {
    const wrapper = mountList({ ...sized, modelValue: [] })
    await addOne(wrapper)
    const before = mocks.sendXHR.mock.calls.length
    dialogStore.open.mockImplementation((_dialog: any, props: any) => props.onDone(null))

    await actionOn(wrapper, 0, "Crop")!.trigger("click")
    await flushPromises()

    expect(mocks.sendXHR).toHaveBeenCalledTimes(before)
  })
})

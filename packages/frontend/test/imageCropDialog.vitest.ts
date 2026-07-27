import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import ImageCropDialog from "../src/components/dialogs/ImageCropDialog.vue"

// The crop dialog over a 2000x1000 landscape photo, displayed 400px wide (so
// one displayed pixel is five image pixels) and cropped to a 256x256 square.
// happy-dom decodes no images, so the <img> is given its dimensions by hand —
// everything downstream of that is the component's own arithmetic.
const IMAGE = { width: 2000, height: 1000 }
const DISPLAY_WIDTH = 400
const SCALE = DISPLAY_WIDTH / IMAGE.width

const dialogStore = { open: vi.fn(), close: vi.fn(), back: vi.fn(), setGuard: vi.fn() }

beforeEach(() => {
  dialogStore.back.mockReset()
  URL.createObjectURL = vi.fn(() => "blob:picked") as any
  URL.revokeObjectURL = vi.fn() as any
})

const file = () => new File(["x"], "photo.jpg", { type: "image/jpeg" })

const mountDialog = async (props: Record<string, any> = {}) => {
  const wrapper = mount(ImageCropDialog as any, {
    props: { file: file(), size: [256, 256], ...props },
    global: { provide: { dialogStore } },
    attachTo: document.body,
  })
  const image = wrapper.find("img").element as HTMLImageElement
  Object.defineProperty(image, "naturalWidth", { value: IMAGE.width, configurable: true })
  Object.defineProperty(image, "naturalHeight", { value: IMAGE.height, configurable: true })
  Object.defineProperty(image, "clientWidth", { value: DISPLAY_WIDTH, configurable: true })
  // The picture's box on screen, which pointer positions are read against.
  image.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: DISPLAY_WIDTH, height: IMAGE.height * SCALE }) as DOMRect
  await wrapper.find("img").trigger("load")
  return wrapper
}

// The selection's CSS box, in displayed pixels.
const selection = (wrapper: any) => {
  const style = wrapper.find(".image-crop-dialog__selection").attributes("style") ?? ""
  const px = (name: string) => Number(new RegExp(`${name}:\\s*([-\\d.]+)px`).exec(style)?.[1])
  return { left: px("left"), top: px("top"), width: px("width"), height: px("height") }
}

// Pointer position in *displayed* pixels, i.e. what a real mouse would report.
const pointer = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y })

describe("ImageCropDialog", () => {
  it("opens on the centred crop, drawn over the picture", async () => {
    const wrapper = await mountDialog()

    // The biggest square out of a 2000x1000 photo is 1000x1000 at x=500 —
    // which at this scale is a 200px box, 100px in.
    expect(selection(wrapper)).toEqual({ left: 100, top: 0, width: 200, height: 200 })
  })

  it("opens on the crop already in effect when it is given one", async () => {
    const wrapper = await mountDialog({ rect: { x: 0, y: 0, width: 600, height: 600 } })

    expect(selection(wrapper)).toEqual({ left: 0, top: 0, width: 120, height: 120 })
  })

  it("recentres on a click, and keeps the selection on the picture", async () => {
    const wrapper = await mountDialog()

    // Click near the right edge: the selection centres there, then clamps so
    // its right edge sits on the picture's.
    await wrapper.find("img").trigger("pointerdown", pointer(390, 100))

    expect(selection(wrapper)).toMatchObject({ left: 200, top: 0, width: 200 })
  })

  it("drags the selection with the pointer, from wherever it was grabbed", async () => {
    const wrapper = await mountDialog()

    // Grab the selection 20px in from its left edge and move left by 60px.
    await wrapper.find(".image-crop-dialog__selection").trigger("pointerdown", pointer(120, 100))
    window.dispatchEvent(new PointerEvent("pointermove", pointer(60, 100)))
    await flushPromises()

    expect(selection(wrapper)).toMatchObject({ left: 40, top: 0 })
  })

  it("resizes from a corner, keeping the square shape and the opposite corner", async () => {
    // A 600x600 selection at (200, 200) — 120px on screen, with room to grow.
    const wrapper = await mountDialog({ rect: { x: 200, y: 200, width: 600, height: 600 } })

    // Drag its SE corner from (160, 160) out to (180, …).
    await wrapper.find(".image-crop-dialog__handle.se").trigger("pointerdown", pointer(160, 160))
    window.dispatchEvent(new PointerEvent("pointermove", pointer(180, 160)))
    await flushPromises()

    // The NW corner stayed put and the box is square, 140px on screen.
    expect(selection(wrapper)).toEqual({ left: 40, top: 40, width: 140, height: 140 })
  })

  it("won't let a corner drag shrink the crop below the output resolution", async () => {
    const wrapper = await mountDialog({ rect: { x: 200, y: 200, width: 600, height: 600 } })

    // Drag the SE corner back onto the NW one: 256 image px is the floor.
    await wrapper.find(".image-crop-dialog__handle.se").trigger("pointerdown", pointer(160, 160))
    window.dispatchEvent(new PointerEvent("pointermove", pointer(40, 40)))
    await flushPromises()

    expect(selection(wrapper)).toMatchObject({ width: 256 * SCALE, height: 256 * SCALE })
  })

  it("puts the selection back in the middle on Centre", async () => {
    const wrapper = await mountDialog({ rect: { x: 0, y: 0, width: 600, height: 600 } })

    await wrapper.findAll("button.v-button").find((b) => b.text() === "Centre")!.trigger("click")

    expect(selection(wrapper)).toEqual({ left: 100, top: 0, width: 200, height: 200 })
  })

  it("answers with the crop on apply, and closes", async () => {
    const onDone = vi.fn()
    const wrapper = await mountDialog({ onDone })

    await wrapper.findAll("button.v-button").find((b) => b.text() === "Apply")!.trigger("click")
    await flushPromises()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0]![0].rect).toEqual({ x: 500, y: 0, width: 1000, height: 1000 })
    expect(dialogStore.back).toHaveBeenCalled()
  })

  it("answers null when dismissed, however it was dismissed", async () => {
    const onDone = vi.fn()
    const wrapper = await mountDialog({ onDone })

    // Any dismissal ends with the dialog unmounting, which is what is hooked.
    wrapper.unmount()

    expect(onDone).toHaveBeenCalledWith(null)
  })

  it("answers exactly once — a dismissal after apply changes nothing", async () => {
    const onDone = vi.fn()
    const wrapper = await mountDialog({ onDone })

    await wrapper.findAll("button.v-button").find((b) => b.text() === "Apply")!.trigger("click")
    await flushPromises()
    wrapper.unmount()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0]![0]).not.toBeNull()
  })
})

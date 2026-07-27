import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import VFileInput from "../src/components/inputs/VFileInput.vue"

// The upload field over both value shapes: the `{ src, previewSrc?, size? }`
// structure a `file`/`image` field stores, and the bare url a
// `{ type: "string", format }` field stores.

const mocks = vi.hoisted(() => ({ sendXHR: vi.fn() }))
vi.mock("../src/api/request", () => ({
  apiUrl: (path: string) => `/api/admin${path}`,
  sendXHR: mocks.sendXHR,
}))
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { viewId: "posts" } }) }))

// happy-dom has no object-URL support; the component makes one to preview a
// picked image while it uploads.
beforeEach(() => {
  mocks.sendXHR.mockReset()
  URL.createObjectURL = vi.fn(() => "blob:preview") as any
  URL.revokeObjectURL = vi.fn() as any
})

const mountInput = (props: Record<string, any> = {}) =>
  mount(VFileInput as any, { props: { name: "cover", ...props } })

// Drives a pick through the hidden native input, the way the browser would.
const pickFile = async (wrapper: any, file: File) => {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, "files", { value: [file], configurable: true })
  await input.trigger("change")
  await flushPromises()
}

const png = () => new File(["x"], "cover.png", { type: "image/png" })

describe("VFileInput display", () => {
  it("previews the handler's thumbnail, and links to the file itself", () => {
    const wrapper = mountInput({
      image: true,
      modelValue: { src: "/files/cover.png", previewSrc: "/files/thumb.png", size: 2048 },
    })

    expect(wrapper.find(".v-file-input__thumb img").attributes("src")).toBe("/files/thumb.png")
    expect(wrapper.find(".v-file-input__link").attributes("href")).toBe("/files/cover.png")
    expect(wrapper.find(".v-file-input__link").text()).toBe("cover.png")
    expect(wrapper.find(".v-file-input__size").text()).toBe("2 KB")
  })

  it("previews a bare url value too — the string spelling renders the same", () => {
    const wrapper = mountInput({ image: true, modelValue: "/files/cover.png" })

    expect(wrapper.find(".v-file-input__thumb img").attributes("src")).toBe("/files/cover.png")
    // No size to show when the value is just a url.
    expect(wrapper.find(".v-file-input__size").exists()).toBe(false)
  })

  it("shows a non-image file as a link with no preview", () => {
    const wrapper = mountInput({ modelValue: { src: "/files/report.pdf", size: 1536 } })

    expect(wrapper.find(".v-file-input__thumb").exists()).toBe(false)
    expect(wrapper.find(".v-file-input__link").text()).toBe("report.pdf")
    expect(wrapper.find(".v-file-input__size").text()).toBe("1.5 KB")
  })

  it("offers a drop zone when an image field is empty, a plain button otherwise", () => {
    expect(mountInput({ image: true }).find(".v-file-input__dropzone").exists()).toBe(true)
    expect(mountInput({}).find(".v-file-input__dropzone").exists()).toBe(false)
  })

  it("defaults an image field's picker to images, and honors an explicit accept", () => {
    expect(mountInput({ image: true }).find("input[type=file]").attributes("accept")).toBe("image/*")
    expect(mountInput({}).find("input[type=file]").attributes("accept")).toBeUndefined()
    expect(mountInput({ image: true, accept: ".png" }).find("input[type=file]").attributes("accept")).toBe(".png")
  })

  it("clears the field on remove", async () => {
    const wrapper = mountInput({ modelValue: { src: "/files/a.png" } })

    await wrapper.findAll("button.v-button").at(-1)!.trigger("click")

    expect(wrapper.emitted("update:modelValue")![0]).toEqual([null])
  })
})

describe("VFileInput upload", () => {
  it("stores what the handler returned, verbatim, for a structured field", async () => {
    const stored = { src: "/files/cover.png", previewSrc: "/files/thumb.png", size: 900, width: 1200 }
    mocks.sendXHR.mockResolvedValue({ value: stored, url: "/files/cover.png" })
    const wrapper = mountInput({ image: true, structured: true })

    await pickFile(wrapper, png())

    // Including the handler's own extra key — the panel never reshapes it.
    expect(wrapper.emitted("update:modelValue")![0]).toEqual([stored])
    const [url, body] = mocks.sendXHR.mock.calls[0]!
    expect(url).toBe("/api/admin/data/posts/upload")
    expect((body as FormData).get("field")).toBe("cover")
  })

  it("keeps a url-only field a string, even when the handler answers with a structure", async () => {
    mocks.sendXHR.mockResolvedValue({ value: { src: "/files/cover.png", size: 900 } })
    const wrapper = mountInput({ structured: false })

    await pickFile(wrapper, png())

    expect(wrapper.emitted("update:modelValue")![0]).toEqual(["/files/cover.png"])
  })

  it("fills a structured field from a handler that only returns a url", async () => {
    mocks.sendXHR.mockResolvedValue({ value: "/files/cover.png" })
    const wrapper = mountInput({ structured: true })

    await pickFile(wrapper, png())

    expect(wrapper.emitted("update:modelValue")![0]).toEqual([{ src: "/files/cover.png" }])
  })

  it("still understands a backend that only answers with { url }", async () => {
    mocks.sendXHR.mockResolvedValue({ url: "/files/cover.png" })
    const wrapper = mountInput({ structured: true })

    await pickFile(wrapper, png())

    expect(wrapper.emitted("update:modelValue")![0]).toEqual([{ src: "/files/cover.png" }])
  })

  it("shows the error and keeps the current value when the upload fails", async () => {
    mocks.sendXHR.mockRejectedValue(new Error("boom"))
    const wrapper = mountInput({ modelValue: { src: "/files/old.png" } })

    await pickFile(wrapper, png())

    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    expect(wrapper.find(".v-form-control__error").text()).toBe("Upload failed")
  })

  it("rejects a dropped file the field doesn't accept, without uploading it", async () => {
    const wrapper = mountInput({ image: true, structured: true })

    await wrapper.find(".v-file-input__control").trigger("drop", {
      dataTransfer: { files: [new File(["x"], "report.pdf", { type: "application/pdf" })] },
    })
    await flushPromises()

    expect(mocks.sendXHR).not.toHaveBeenCalled()
    expect(wrapper.find(".v-form-control__error").text()).toBe("Unsupported file type")
  })

  it("uploads a dropped file the field does accept", async () => {
    mocks.sendXHR.mockResolvedValue({ value: { src: "/files/cover.png" } })
    const wrapper = mountInput({ image: true, structured: true })

    await wrapper.find(".v-file-input__control").trigger("drop", { dataTransfer: { files: [png()] } })
    await flushPromises()

    expect(mocks.sendXHR).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted("update:modelValue")![0]).toEqual([{ src: "/files/cover.png" }])
  })
})

import { describe, it, expect } from "bun:test"
import {
  fileNameOf, formatFileSize, isImageSrc, matchesAccept, normalizeFileValue, previewSrcOf,
} from "../src/utils/fileValue"

// An upload field's value is either the structure the upload handler returned
// or a bare url string, depending on how the field was declared. Everything
// that renders one reads it through these helpers.

describe("normalizeFileValue", () => {
  it("reads both spellings into one shape", () => {
    expect(normalizeFileValue("/files/a.png")).toEqual({ src: "/files/a.png" })
    expect(normalizeFileValue({ src: "/files/a.png", previewSrc: "/t.png", size: 12 }))
      .toEqual({ src: "/files/a.png", previewSrc: "/t.png", size: 12 })
  })

  it("keeps only the fields it understands, and only when they're usable", () => {
    // Extra keys a handler added live on in the *stored* value; this is a read
    // view, so it reports just what the panel renders.
    expect(normalizeFileValue({ src: "/a.png", width: 100, previewSrc: "", size: "12" } as any))
      .toEqual({ src: "/a.png", previewSrc: undefined, size: undefined })
  })

  it("treats an empty or malformed value as no file", () => {
    expect(normalizeFileValue(null)).toBeNull()
    expect(normalizeFileValue("")).toBeNull()
    expect(normalizeFileValue({})).toBeNull()
    expect(normalizeFileValue({ previewSrc: "/t.png" })).toBeNull()
    expect(normalizeFileValue(42)).toBeNull()
  })
})

describe("isImageSrc", () => {
  it("recognizes image files, including past a query string", () => {
    expect(isImageSrc("/files/a.png")).toBe(true)
    expect(isImageSrc("/files/a.JPEG?v=2")).toBe(true)
    expect(isImageSrc("https://cdn/x/y.webp#frag")).toBe(true)
    expect(isImageSrc("blob:http://localhost/abc")).toBe(true)
    expect(isImageSrc("data:image/png;base64,iVBOR")).toBe(true)
  })

  it("does not claim other files", () => {
    expect(isImageSrc("/files/report.pdf")).toBe(false)
    expect(isImageSrc("/files/pngs/report")).toBe(false)
    expect(isImageSrc("/files/a.png.zip")).toBe(false)
  })
})

describe("previewSrcOf", () => {
  it("prefers the handler's thumbnail over the file itself", () => {
    expect(previewSrcOf({ src: "/a.png", previewSrc: "/thumb.png" })).toBe("/thumb.png")
  })

  it("falls back to the file when it is an image, and to nothing when it isn't", () => {
    expect(previewSrcOf({ src: "/a.png" })).toBe("/a.png")
    expect(previewSrcOf("/a.png")).toBe("/a.png")
    expect(previewSrcOf("/report.pdf")).toBeNull()
    expect(previewSrcOf(null)).toBeNull()
  })

  it("uses a thumbnail even for a non-image file — a pdf's preview is a picture", () => {
    expect(previewSrcOf({ src: "/report.pdf", previewSrc: "/report-page1.png" })).toBe("/report-page1.png")
  })
})

describe("fileNameOf", () => {
  it("takes the last path segment, percent-decoded and without the query", () => {
    expect(fileNameOf("/files/a.png")).toBe("a.png")
    expect(fileNameOf({ src: "https://cdn/x/My%20File.pdf?v=2" })).toBe("My File.pdf")
    expect(fileNameOf("/files/%E2%9C%93.png")).toBe("✓.png")
  })

  it("survives a malformed escape and an empty value", () => {
    expect(fileNameOf("/files/%zz.png")).toBe("%zz.png")
    expect(fileNameOf(null)).toBe("")
  })
})

describe("formatFileSize", () => {
  it("scales to the largest unit that fits", () => {
    expect(formatFileSize(0)).toBe("0 B")
    expect(formatFileSize(812)).toBe("812 B")
    expect(formatFileSize(2048)).toBe("2 KB")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(1024 * 1024 * 3.25)).toBe("3.3 MB")
  })

  it("shows nothing when the handler didn't report a size", () => {
    expect(formatFileSize(undefined)).toBe("")
    expect(formatFileSize(null)).toBe("")
    expect(formatFileSize(NaN)).toBe("")
  })
})

describe("matchesAccept", () => {
  const file = (name: string, type = "") => ({ name, type })

  it("accepts everything when the field didn't narrow it", () => {
    expect(matchesAccept(file("a.png", "image/png"))).toBe(true)
    expect(matchesAccept(file("a.png", "image/png"), "")).toBe(true)
  })

  it("matches extensions, wildcards and exact mime types", () => {
    expect(matchesAccept(file("a.PNG", "image/png"), ".png")).toBe(true)
    expect(matchesAccept(file("a.png", "image/png"), "image/*")).toBe(true)
    expect(matchesAccept(file("a.png", "image/png"), "image/png")).toBe(true)
    expect(matchesAccept(file("report.pdf", "application/pdf"), ".pdf,image/*")).toBe(true)
  })

  it("rejects what the list doesn't cover", () => {
    expect(matchesAccept(file("report.pdf", "application/pdf"), "image/*")).toBe(false)
    expect(matchesAccept(file("a.png", "image/png"), ".pdf")).toBe(false)
    // A file the browser gave no mime type for still matches by extension.
    expect(matchesAccept(file("a.png"), "image/*")).toBe(false)
    expect(matchesAccept(file("a.png"), ".png")).toBe(true)
  })
})

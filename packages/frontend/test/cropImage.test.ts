import { describe, it, expect } from "bun:test"
import { centeredCrop, moveCrop, resizeCrop, type Rect } from "../src/utils/cropImage"

// The crop selection, in image pixels. A landscape photo (2000x1000) cropped
// to a square is the interesting case: the height is the limit, and all the
// slack is horizontal.
const image = { width: 2000, height: 1000 }
const square = { width: 512, height: 512 }

describe("centeredCrop", () => {
  it("takes the biggest square out of the middle of a landscape picture", () => {
    expect(centeredCrop(image, square)).toEqual({ x: 500, y: 0, width: 1000, height: 1000 })
  })

  it("is limited by the other side for a portrait picture", () => {
    expect(centeredCrop({ width: 800, height: 2000 }, square)).toEqual({ x: 0, y: 600, width: 800, height: 800 })
  })

  it("takes the whole picture when it already has the right shape", () => {
    expect(centeredCrop({ width: 640, height: 640 }, square)).toEqual({ x: 0, y: 0, width: 640, height: 640 })
  })

  it("matches the output's aspect, not the picture's", () => {
    const wide = centeredCrop({ width: 1000, height: 1000 }, { width: 1280, height: 720 })
    expect(wide.width / wide.height).toBeCloseTo(1280 / 720, 10)
    expect(wide).toEqual({ x: 0, y: 218.75, width: 1000, height: 562.5 })
  })
})

describe("moveCrop", () => {
  const rect: Rect = { x: 500, y: 0, width: 1000, height: 1000 }

  it("moves the selection by the drag", () => {
    expect(moveCrop(rect, image, -200, 0)).toMatchObject({ x: 300, y: 0 })
  })

  it("stops at the picture's edges", () => {
    expect(moveCrop(rect, image, -9999, -9999)).toMatchObject({ x: 0, y: 0 })
    expect(moveCrop(rect, image, 9999, 9999)).toMatchObject({ x: 1000, y: 0 })
  })

  it("keeps the selection's size", () => {
    expect(moveCrop(rect, image, 9999, 9999)).toMatchObject({ width: 1000, height: 1000 })
  })
})

describe("resizeCrop", () => {
  // A 600x600 selection sitting at (200, 200) — room to grow in every direction.
  const rect: Rect = { x: 200, y: 200, width: 600, height: 600 }

  it("grows from the dragged corner, leaving the opposite one fixed", () => {
    // Dragging the SE corner out to (900, …): the NW corner stays at (200, 200).
    expect(resizeCrop(rect, image, square, "se", 900, 900)).toEqual({ x: 200, y: 200, width: 700, height: 700 })
    // Dragging NW inwards to (250, …): the SE corner stays at (800, 800).
    expect(resizeCrop(rect, image, square, "nw", 250, 250)).toEqual({ x: 250, y: 250, width: 550, height: 550 })
  })

  it("keeps the output's aspect ratio however the corner is dragged", () => {
    const wide = resizeCrop(rect, image, { width: 1600, height: 900 }, "se", 1000, 210)
    expect(wide.width / wide.height).toBeCloseTo(1600 / 900, 10)
  })

  it("can't grow past the edge the picture runs out at", () => {
    // From the NW anchor (200, 200) there are 800px of height left, so a square
    // selection stops at 800 even though there is far more width available.
    expect(resizeCrop(rect, image, square, "se", 9999, 9999)).toEqual({ x: 200, y: 200, width: 800, height: 800 })
  })

  it("won't shrink below the output resolution — that would only upscale", () => {
    expect(resizeCrop(rect, image, square, "se", 210, 210)).toMatchObject({ width: 512, height: 512 })
  })

  it("allows a smaller selection when the picture itself is smaller", () => {
    const small = { width: 300, height: 200 }
    const start: Rect = { x: 0, y: 0, width: 200, height: 200 }
    // 200 is the most a square can be here, so it is also the least.
    expect(resizeCrop(start, small, square, "se", 10, 10)).toMatchObject({ width: 200, height: 200 })
  })

  it("stays inside the picture whichever corner is dragged", () => {
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      const out = resizeCrop(rect, image, square, corner, -9999, -9999)
      expect(out.x).toBeGreaterThanOrEqual(0)
      expect(out.y).toBeGreaterThanOrEqual(0)
      expect(out.x + out.width).toBeLessThanOrEqual(image.width)
      expect(out.y + out.height).toBeLessThanOrEqual(image.height)
    }
  })
})

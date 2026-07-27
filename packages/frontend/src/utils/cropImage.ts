// Cropping a picked picture to the size its field asked for.
//
// The crop is a rectangle in *image pixels* — the selection you see over the
// picture in the crop dialog, and the region drawn into the output canvas.
// Picking a file crops it centred without asking (see `autoCrop`); the dialog
// opens on that same rectangle, so adjusting starts from what you already have.

export type Size = { width: number, height: number }
export type Rect = { x: number, y: number, width: number, height: number }
// Which corner of the selection is being dragged; the opposite one stays put.
export type Corner = "nw" | "ne" | "sw" | "se"

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// The largest rectangle of the output's shape that fits, centred on the image.
export const centeredCrop = (image: Size, output: Size): Rect => {
  const aspect = output.width / output.height
  const width = Math.min(image.width, image.height * aspect)
  const height = width / aspect
  return { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height }
}

// Drags the selection around, never off the picture.
export const moveCrop = (rect: Rect, image: Size, dx: number, dy: number): Rect => ({
  ...rect,
  x: clamp(rect.x + dx, 0, Math.max(0, image.width - rect.width)),
  y: clamp(rect.y + dy, 0, Math.max(0, image.height - rect.height)),
})

// Resizes from one corner towards the pointer, keeping the opposite corner
// fixed and the aspect locked. The selection can't grow past the picture's
// edges, and won't shrink below the output resolution — cropping smaller than
// that would only upscale pixels that aren't there.
export const resizeCrop = (rect: Rect, image: Size, output: Size, corner: Corner, x: number, y: number): Rect => {
  const aspect = output.width / output.height
  const right = corner === "ne" || corner === "se"
  const bottom = corner === "se" || corner === "sw"
  const anchorX = right ? rect.x : rect.x + rect.width
  const anchorY = bottom ? rect.y : rect.y + rect.height

  // How much picture there is between the fixed corner and the edge it grows towards.
  const roomX = right ? image.width - anchorX : anchorX
  const roomY = bottom ? image.height - anchorY : anchorY
  const maxWidth = Math.max(0, Math.min(roomX, roomY * aspect))
  const minWidth = Math.min(maxWidth, output.width, image.width, image.height * aspect)

  const width = clamp(Math.abs(x - anchorX), minWidth, maxWidth)
  const height = width / aspect
  return {
    x: right ? anchorX : anchorX - width,
    y: bottom ? anchorY : anchorY - height,
    width,
    height,
  }
}

// Canvas can't keep every format: only PNG and WebP survive as themselves, so
// anything else (JPEG, HEIC, GIF…) comes back as JPEG rather than silently
// becoming a huge PNG.
const outputType = (type: string) => (type === "image/png" || type === "image/webp" ? type : "image/jpeg")

const renamed = (name: string, type: string) => {
  const stem = name.replace(/\.[^.]+$/, "") || "image"
  return `${stem}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`
}

// Loads a picked file into something a canvas can draw from.
export const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read the image"))
    }
    image.src = url
  })

// Draws `rect` of the loaded image into a canvas of exactly `output` and hands
// back a File to upload in place of the original. The server is still the
// authority on what gets stored — this only saves it the guesswork of deciding
// which part of the picture the user meant.
export const cropToFile = (image: CanvasImageSource, source: File, rect: Rect, output: Size): Promise<File> => {
  const canvas = document.createElement("canvas")
  canvas.width = output.width
  canvas.height = output.height
  const context = canvas.getContext("2d")
  if (!context) return Promise.resolve(source)
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, output.width, output.height)

  const type = outputType(source.type)
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], renamed(source.name, type), { type }) : source),
      type,
      0.92,
    )
  })
}

// What a picked picture becomes with nobody touching it: the centre of it, at
// the field's resolution. A file that can't be read at all is passed through
// unchanged — the upload handler crops server-side anyway, so a broken decode
// here is not worth failing the upload over.
export const autoCrop = async (file: File, output: Size): Promise<{ file: File, rect: Rect } | null> => {
  let image: HTMLImageElement
  try {
    image = await loadImage(file)
  } catch {
    return null
  }
  const natural = { width: image.naturalWidth, height: image.naturalHeight }
  const rect = centeredCrop(natural, output)
  return { file: await cropToFile(image, file, rect, output), rect }
}

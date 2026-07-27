import { describe, it, expect } from "bun:test"
import { Router } from "dynara"
import { createAdminPanel } from "../src/main"

// The `file` / `image` field types: schema aliases registered on
// compact-json-schema (see form-schema.ts). A form declares `"image??"` and
// gets a validated `{ src, previewSrc?, size? }` value plus the `format` hint
// the frontend renders the upload input from.

const buildPage = (form: any, upload?: any) => {
  const saved: any[] = []
  const admin = createAdminPanel()
  const page = admin
    .createPage({ title: "Posts", path: "posts" })
    .data(async () => [])
    .primaryKey("id", "number")
    .createForm(form, async (data) => { saved.push(data) })
  if (upload) page.upload(upload)
  const app = new Router()
  app.register(admin)
  return { app, saved }
}

const meta = async (app: Router) => await (await app.inject({ method: "GET", url: "/api/admin/pages/posts" })).json() as any

describe("file / image field types", () => {
  it("unfolds into the value object, keeping the format hint and annotations", async () => {
    const { app } = buildPage({
      title: "string",
      cover: "image??",
      resume: { type: "file?", label: "Resume", accept: ".pdf,.doc" },
    })

    const schema = (await meta(app)).createForm.schema
    expect(schema.properties.cover).toEqual({
      type: "object",
      format: "image",
      nullable: true,
      properties: {
        src: { type: "string" },
        previewSrc: { type: "string" },
        size: { type: "number" },
      },
      required: ["src"],
    })
    // Annotations written next to the type survive the expansion.
    expect(schema.properties.resume).toMatchObject({
      type: "object", format: "file", label: "Resume", accept: ".pdf,.doc",
    })
    // `??` is nullable, a bare `?` only optional — neither is required.
    expect(schema.required).toEqual(["title"])
  })

  it("validates the submitted value as the structure, not as a url string", async () => {
    const { app, saved } = buildPage({ title: "string", cover: "image??" })
    const post = (body: any) => app.inject({ method: "POST", url: "/api/admin/data/posts/items", body })

    const ok = await post({ title: "A", cover: { src: "/f/a.png", previewSrc: "/f/a-thumb.png", size: 2048 } })
    expect(ok.status).toBe(200)
    expect(saved[0]).toEqual({ title: "A", cover: { src: "/f/a.png", previewSrc: "/f/a-thumb.png", size: 2048 } })

    // Only `src` is required; the rest is what the upload handler chose to add.
    expect((await post({ title: "B", cover: { src: "/f/b.png" } })).status).toBe(200)
    // Nullable, so clearing the field is accepted…
    expect((await post({ title: "C", cover: null })).status).toBe(200)
    // …but a bare url string or a value without `src` is not.
    expect((await post({ title: "D", cover: "/f/d.png" })).status).toBe(400)
    expect((await post({ title: "E", cover: { size: 12 } })).status).toBe(400)
  })

  it("leaves a url-only field (string + format) alone", async () => {
    const { app, saved } = buildPage({ title: "string", cover: { type: "string?", format: "file" } })

    const schema = (await meta(app)).createForm.schema
    expect(schema.properties.cover).toEqual({ type: "string", format: "file" })

    const res = await app.inject({ method: "POST", url: "/api/admin/data/posts/items", body: { title: "A", cover: "/f/a.png" } })
    expect(res.status).toBe(200)
    expect(saved[0]).toEqual({ title: "A", cover: "/f/a.png" })
  })
})

describe("upload handler results", () => {
  const upload = async (app: Router, name = "a.png") => {
    const form = new FormData()
    form.append("file", new File(["hello"], name, { type: "image/png" }))
    form.append("field", "cover")
    return await app.inject({ method: "POST", url: "/api/admin/data/posts/upload", body: form })
  }

  it("returns a structured result as the field value, with its src as url", async () => {
    const { app } = buildPage({ cover: "image??" }, async (file: File) => ({
      src: `/files/${file.name}`,
      previewSrc: `/files/thumb-${file.name}`,
      size: file.size,
    }))

    const res = await upload(app)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      value: { src: "/files/a.png", previewSrc: "/files/thumb-a.png", size: 5 },
      url: "/files/a.png",
    })
  })

  it("still accepts a handler that returns a bare url", async () => {
    const { app } = buildPage({ cover: { type: "string?", format: "file" } }, async (file: File) => `/files/${file.name}`)

    expect(await (await upload(app)).json()).toEqual({ value: "/files/a.png", url: "/files/a.png" })
  })
})

// `imageSize` is resolved from the page's own schema and handed to the handler,
// so the size a picture is stored at is the field's decision — not something
// the uploading client gets to name.
describe("imageSize reaching the upload handler", () => {
  const uploadTo = async (form: any, field: string) => {
    const seen: any[] = []
    const { app } = buildPage(form, async (_file: File, ctx: any) => {
      seen.push(ctx.size)
      return "/files/a.png"
    })
    const body = new FormData()
    body.append("file", new File(["x"], "a.png", { type: "image/png" }))
    body.append("field", field)
    await app.inject({ method: "POST", url: "/api/admin/data/posts/upload", body })
    return seen[0]
  }

  it("passes the size the field declared", async () => {
    expect(await uploadTo({ cover: { type: "image??", imageSize: [512, 512] } }, "cover")).toEqual([512, 512])
  })

  it("passes nothing when the field declared none, or isn't in the form", async () => {
    expect(await uploadTo({ cover: "image??" }, "cover")).toBeUndefined()
    expect(await uploadTo({ cover: { type: "image??", imageSize: [512, 512] } }, "other")).toBeUndefined()
  })

  it("finds a gallery's size, declared on the array or on its pictures", async () => {
    const onItems = { gallery: { type: "array", items: { type: "image", imageSize: [800, 600] } } }
    expect(await uploadTo(onItems, "gallery")).toEqual([800, 600])

    const onArray = { gallery: { type: "array", items: "image", imageSize: [64, 64] } }
    expect(await uploadTo(onArray, "gallery")).toEqual([64, 64])
  })

  it("finds a nested field — inside an object, and inside a rows table", async () => {
    const nested = {
      profile: { type: "object", properties: { photo: { type: "image??", imageSize: [200, 300] } } },
    }
    expect(await uploadTo(nested, "photo")).toEqual([200, 300])

    const rows = {
      gallery: { type: "array", items: { shot: { type: "image??", imageSize: [64, 64] } } },
    }
    expect(await uploadTo(rows, "shot")).toEqual([64, 64])
  })
})

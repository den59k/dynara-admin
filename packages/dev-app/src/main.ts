import { Router } from "dynara"
// Imported straight from the local package source (not the built `dist`) so this
// harness dogfoods whatever you're editing in `packages/backend` with no build
// step — `bun --watch` reloads the panel on every change.
import { createAdminPanel } from "../../backend/src/main"
import { client, db } from "./db"

// The user object `onRequest` resolves and every page handler receives as `ctx.user`.
type User = { id: number; name: string }

const admin = createAdminPanel<User>({ title: "Dynara Dev App" })

// Trivial single-account auth — enough to exercise the full login → CRUD flow.
admin.registerAuthMethod({
  title: "Sign in (admin / admin)",
  fields: { login: "string", password: "string" },
  onLogin: async ({ login, password }) => {
    if (login === "admin" && password === "admin") return { token: "dev-token" }
    return null
  },
  onRequest: async (token) => (token === "dev-token" ? { id: 1, name: "admin" } : null),
})

// Shared form schema for the Users page (create + update use the same fields).
const userForm = { name: "string", email: "string?", age: "number" } as const

admin
  .createPage({ title: "Users", path: "users", icon: "users" })
  .data(async ({ take, skip, sort, search }) => {
    const $where = search ? { name: { $includes: search } } : undefined
    const $order = sort ? { [sort.field]: sort.dir } : { id: "asc" }
    const items = await client.user.findMany({
      id: true,
      name: true,
      email: true,
      age: true,
      $where,
      $order: $order as any,
      $limit: take,
      $skip: skip,
    })
    const total = await client.user.count($where ? { $where } : undefined)
    return { items, total }
  })
  .primaryKey("id", "number")
  .item(async (id) =>
    client.user.findFirst({ id: true, name: true, email: true, age: true, $where: { id } })
  )
  .table([
    { title: "ID", field: "id", width: 60, sortable: true },
    { title: "Name", field: "name", sortable: true },
    { title: "Email", field: "email" },
    { title: "Age", field: "age", width: 80, sortable: true },
  ])
  .createForm(userForm, async (data) => {
    await client.user.insert(data)
  })
  .updateForm(userForm, async (id, data) => {
    await client.user.update({ id }, data)
  })
  .onDelete(async (ids) => {
    await client.$transaction(ids.map((id) => client.user.delete({ id })))
  })

// Posts — showcases a foreign-key `reference` field pointing at the Users page.
const postForm = {
  title: "string",
  body: "string?",
  published: "boolean",
  // Renders as a searchable select backed by an async method (resolved
  // server-side, exposed at /select/:id) rather than another page's list. It is
  // called with the current `search`; and with `value` to resolve the label of
  // an already-selected author when the edit form opens.
  authorId: {
    type: "number",
    reference: async ({ search, value }: { search?: string; value?: string }) => {
      const $where =
        value != null ? { id: Number(value) } :
        search ? { name: { $includes: search } } : undefined
      const users = await client.user.findMany({
        id: true,
        name: true,
        $where,
        $order: { name: "asc" },
        $limit: 20,
      })
      return users.map((u) => ({ value: u.id, label: u.name }))
    },
  },
} as const

admin
  .createPage({ title: "Posts", path: "posts", icon: "file" })
  .data(async ({ take, skip, sort, search }) => {
    const $where = search ? { title: { $includes: search } } : undefined
    const $order = sort ? { [sort.field]: sort.dir } : { id: "asc" }
    const items = await client.post.findMany({
      id: true,
      title: true,
      published: true,
      author: { name: true },
      $where,
      $order: $order as any,
      $limit: take,
      $skip: skip,
    })
    const total = await client.post.count($where ? { $where } : undefined)
    // Flatten the related author's name so a plain field column can render it.
    return { items: items.map((p) => ({ ...p, authorName: p.author?.name ?? "—" })), total }
  })
  .primaryKey("id", "number")
  .item(async (id) => {
    const post = await client.post.findFirst({
      id: true,
      title: true,
      body: true,
      published: true,
      author: { id: true },
      $where: { id },
    })
    if (!post) return null
    // The update form's field is `authorId`; expose it from the related record.
    return { ...post, authorId: post.author?.id ?? null }
  })
  .table([
    { title: "ID", field: "id", width: 60, sortable: true },
    { title: "Title", field: "title", sortable: true },
    { title: "Author", field: "authorName", width: "1fr" },
    { title: "Published", field: "published", width: 100, sortable: true },
  ])
  .createForm(postForm, async ({ authorId, ...rest }) => {
    await client.post.insert({ ...rest, author: authorId ? { id: authorId } : null })
  })
  .updateForm(postForm, async (id, { authorId, ...rest }) => {
    await client.post.update({ id }, { ...rest, author: authorId ? { $connect: { id: authorId } } : null })
  })
  .onDelete(async (ids) => {
    await client.$transaction(ids.map((id) => client.post.delete({ id })))
  })

const app = new Router()
app.register(admin)

const port = Number(process.env.PORT ?? 3000)
await app.listen(port)

// Release the embedded DB handle (and its temp dir) on a clean shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    db.close()
    process.exit(0)
  })
}

console.log(`\n  Dynara dev app → http://localhost:${port}/admin`)
console.log(`  Login with  admin / admin\n`)

import { join } from "node:path"
import { Router } from "dynara"
// Imported straight from the local package source (not the built `dist`) so this
// harness dogfoods whatever you're editing in `packages/backend` with no build
// step — `bun --watch` reloads the panel on every change.
import { createAdminPanel, HTTPError } from "../../backend/src/main"
import { client, db } from "./db"

// The user object `onRequest` resolves and every page handler receives as `ctx.user`.
type User = { id: number; name: string; role: "admin" | "viewer" }

const admin = createAdminPanel<User>({ title: "Dynara Dev App" })

// Two accounts so the access-control demo has something to show: `admin` has full
// access; `viewer` is read-only and can't see the Users page at all.
const ACCOUNTS: Record<string, User> = {
  admin: { id: 1, name: "admin", role: "admin" },
  viewer: { id: 2, name: "viewer", role: "viewer" },
}
const isAdmin = (user: User) => user.role === "admin"

admin.registerAuthMethod({
  title: "Sign in (admin/admin or viewer/viewer)",
  fields: { login: "string", password: "string" },
  onLogin: async ({ login, password }) => {
    // Demo-only: the token is the username; a real app would sign a JWT.
    if (ACCOUNTS[login] && password === login) return { token: login }
    return null
  },
  onRequest: async (token) => ACCOUNTS[token] ?? null,
})

// Shared form schema for the Users page (create + update use the same fields).
// `email`/`birthday` are nullable (`??`) so the form shows a clear cross that
// resets them to null; `role` renders as a select from the enum; `birthday`
// uses dynara's native `date` type — the handler receives a JS Date directly.
const userForm = {
  name: "string",
  email: "string??",
  age: "number",
  role: ["user", "moderator"],
  balance: "number",
  birthday: "date??",
} as const

// Maps the list options' `search`/`filter` to a MarciDB `$where`. Shared by the
// Users page's `.data()` and `.count()` so the two never drift apart.
const buildUserWhere = ({ search, filter }: { search?: string; filter?: Record<string, any> }): any => {
  const conditions: any[] = []
  if (search) conditions.push({ name: { $includes: search } })
  if (filter?.role) conditions.push({ role: filter.role })
  if (filter?.minBalance != null) conditions.push({ balance: { $gte: filter.minBalance } })
  return conditions.length ? { $and: conditions } : undefined
}

admin
  // `access` as a bare predicate gates the whole page: only admins see Users in
  // the sidebar; a viewer hitting its routes gets 403.
  .createPage({ title: "Users", path: "users", icon: "users", search: true, access: isAdmin })
  // Typed filters render above the table; their validated values arrive on the
  // list options as `filter`. Every field is optional (apply-if-set).
  .filters({
    role: { type: "string?", options: [{ value: "user", label: "User" }, { value: "moderator", label: "Moderator" }] },
    minBalance: "number?",
  })
  // Shared filter → MarciDB `$where`, so `.data()` and `.count()` stay in sync
  // without duplicating the mapping. Reads only `search`/`filter` off the options.
  .data(async ({ take, skip, sort, ...options }) => {
    const $where = buildUserWhere(options)
    const $order = sort ? { [sort.field]: sort.dir } : { id: "asc" }
    return client.user.findMany({
      id: true,
      name: true,
      email: true,
      age: true,
      role: true,
      balance: true,
      $where,
      $order: $order as any,
      $limit: take,
      $skip: skip,
    })
  })
  // Separate from `.data()` so the count query (a full scan under a non-indexed
  // filter) isn't re-run on every page flip — the UI caches it per filter/search.
  .count(async (options) => {
    const $where = buildUserWhere(options)
    return client.user.count($where ? { $where } : undefined)
  })
  .primaryKey("id", "number")
  // MarciDB returns DateTime as epoch millis; the date input accepts that as-is,
  // so the row is returned unchanged.
  .item(async (id) =>
    client.user.findFirst({ id: true, name: true, email: true, age: true, role: true, balance: true, birthday: true, $where: { id } })
  )
  .table([
    { title: "ID", field: "id", width: 60, sortable: true },
    { title: "Name", field: "name", sortable: true },
    { title: "Email", field: "email" },
    // A colored pill keyed on the role value.
    { title: "Role", field: "role", width: 120, type: "badge", colors: { moderator: "purple", user: "gray" } },
    // Currency-formatted number.
    { title: "Balance", field: "balance", width: 110, sortable: true, type: "money", currency: "USD" },
    { title: "Age", field: "age", width: 80, sortable: true },
  ])
  // `birthday` arrives as a JS Date (or null) — dynara decoded the native `date`
  // field — so it goes straight to the DB with no conversion.
  .createForm(userForm, async (data) => {
    await client.user.insert(data)
  })
  .updateForm(userForm, async (id, data) => {
    await client.user.update({ id }, data)
  })
  .onDelete(async (ids) => {
    await client.$transaction(ids.map((id) => client.user.delete({ id })))
  })
  // Flagship row action: opens a form dialog to top up a single user's balance,
  // then returns a message shown as a toast. `id` is the row's primary key.
  .action("topUp", {
    title: "Top up balance",
    icon: "add",
    // `label` (and static `options`, `reference`, …) type-check inline thanks to
    // the SchemaAnnotations augmentation in dynara-admin.
    form: { amount: { type: "number", label: "Amount to add" }, comment: { type: "string?", label: "Comment", multiline: true } },
  }, async (id, { amount }) => {
    const user = await client.user.findFirst({ balance: true, name: true, $where: { id } })
    if (!user) throw new HTTPError("User not found", 404)
    await client.user.update({ id }, { balance: user.balance + amount })
    return { message: `Topped up ${user.name} by ${amount}` }
  })
  // A confirm-only row action (no form): resets one user's balance to zero.
  .action("resetBalance", {
    title: "Reset balance",
    confirm: "Set this user's balance back to zero?",
    danger: true,
  }, async (id) => {
    await client.user.update({ id }, { balance: 0 })
    return { message: "Balance reset" }
  })
  // A bulk action over the current checkbox selection: `ids` are the checked
  // primary keys. Renders next to Delete when rows are selected.
  .action("grantBonus", {
    title: "Grant 100 bonus",
    icon: "like",
    bulk: true,
  }, async (ids) => {
    const users = await client.user.findMany({ id: true, balance: true, $where: { id: { $in: ids } } })
    for (const u of users) {
      await client.user.update({ id: u.id }, { balance: u.balance + 100 })
    }
    return { message: `Granted a bonus to ${users.length} user(s)` }
  })

// Posts — showcases a foreign-key `reference` field pointing at the Users page.
const postForm = {
  title: "string",
  // `??` (nullable), not `?` (optional): the DB column is nullable and `item()`
  // returns null, which the update form must be able to resubmit.
  body: "string??",
  published: "boolean",
  // Renders as a searchable select backed by an async method (resolved
  // server-side, exposed at /select/:id) rather than another page's list. It is
  // called with the current `search`; and with `value` to resolve the label of
  // an already-selected author when the edit form opens. Nullable (`??`), so
  // the select shows a clear cross — Post.author is optional in the DB.
  authorId: {
    type: "number??",
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
  // Granular access: everyone can read Posts, but only admins may create/update,
  // delete, or run actions. A viewer sees the table with no Add/Edit/Delete.
  .createPage({ title: "Posts", path: "posts", icon: "file", search: true, access: { write: isAdmin, delete: isAdmin } })
  // No `.count()` here on purpose: Posts demonstrates keyset (next/prev)
  // pagination. When the UI has no total it sends `cursor` (the previous page's
  // last id) instead of `skip`, so we page via MarciDB's O(log n) `$cursor`
  // rather than an O(n) `$skip` — and the engine handles the sort order.
  .data(async ({ take, skip, cursor, sort, search }) => {
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
      $cursor: cursor != null ? { id: cursor } : undefined,
    })
    // Flatten the related author's name so a plain field column can render it.
    return items.map((p) => ({ ...p, authorName: p.author?.name ?? "—" }))
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
    // Renders a ✓ / ✗ instead of the raw "true"/"false".
    { title: "Published", field: "published", width: 100, sortable: true, type: "boolean" },
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

// Home dashboard: three built-in stat cards plus a custom Vue widget. The stat
// `data` resolvers run server-side per request; the component widget's resolver
// output is passed to RecentPosts.vue as its `data` prop.
admin.dashboard([
  {
    type: "stat", title: "Users", icon: "users", link: "users",
    data: async () => ({ value: await client.user.count() }),
  },
  {
    type: "stat", title: "Posts", icon: "file", link: "posts",
    data: async () => ({ value: await client.post.count() }),
  },
  {
    type: "stat", title: "Published", icon: "check",
    data: async () => {
      const total = await client.post.count()
      const published = await client.post.count({ $where: { published: true } })
      return { value: published, label: `of ${total}`, delta: total ? Math.round((published / total) * 100) : 0 }
    },
  },
  {
    type: "component", title: "Recent posts", span: 2,
    component: join(import.meta.dir, "widgets", "RecentPosts.vue"),
    data: async () => ({
      posts: await client.post.findMany({ id: true, title: true, published: true, $order: { id: "desc" }, $limit: 6 }),
    }),
  },
])

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

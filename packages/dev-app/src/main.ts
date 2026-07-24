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

// Role display metadata, keyed by value and shared across the whole page — the
// form select, the filter select and the table badge all read these, so the
// labels and colors can never drift apart (mirrors Posts' LABEL_COLORS).
const ROLE_LABELS = { user: "User", moderator: "Moderator" }
const ROLE_COLORS = { user: "gray", moderator: "purple" }

// Shared form schema for the Users page (create + update use the same fields).
// `email`/`birthday` are nullable (`??`) so the form shows a clear cross that
// resets them to null; `role` renders as a select over the enum, showing a
// colored dot per value from `enumColors`; `birthday` uses dynara's native
// `date` type — the handler receives a JS Date directly.
const userForm = {
  name: "string",
  email: "string??",
  age: "number",
  // `enumLabels`/`enumColors` add display metadata over the enum, keyed by
  // value — the enum itself stays the single source of truth for validation.
  role: {
    type: "string",
    enum: ["user", "moderator"],
    enumLabels: ROLE_LABELS,
    enumColors: ROLE_COLORS,
  },
  balance: "number",
  birthday: "date??",
  // An editable table: an array of object rows, where the row schema doubles
  // as the column definition — each property is a column (its label the
  // header, its input the cell editor — so the day enum renders as a select
  // inside its cell, labels included). `sortable` adds a drag-handle column;
  // the submitted array carries the rows in their visible order. Stored as a
  // MarciDB `Json` column — the array replaces the previous value whole.
  schedule: {
    type: "array",
    label: "Schedule",
    sortable: true,
    items: {
      // `width` sets the column's relative weight (fr): Day takes twice the
      // width of each time column.
      day: {
        type: "string",
        enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        enumLabels: { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" },
        label: "Day",
        width: 2,
      },
      from: { type: "string", label: "From" },
      to: { type: "string??", label: "To" },
    },
  },
} as const

// The update form adds a display-only custom component: a read-only list of the
// user's posts, rendered by a host-owned .vue file (compiled and served through
// the same pipeline as page components). `type: "component"` fields carry no
// submitted value — the component receives whatever `.item()` returned under
// the key as its `modelValue`, and is stripped from request validation.
const userUpdateForm = {
  ...userForm,
  posts: {
    type: "component",
    label: "Posts by this user",
    component: join(import.meta.dir, "components", "UserPosts.vue"),
  },
} as const

// A schedule row's `to` is nullable. The form's optional marker also widens its
// static type with `undefined`, which the `schedule` Json column rejects — even
// though the submitted value is only ever a string or null. Coerce it so each
// row is valid JSON before it reaches the DB.
const normalizeSchedule = (rows: { day: string; from: string; to?: string | null }[]) =>
  rows.map((r) => ({ ...r, to: r.to ?? null }))

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
    role: { type: "string?", enum: ["user", "moderator"], enumLabels: ROLE_LABELS, enumColors: ROLE_COLORS },
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
  // so the row is returned unchanged. `posts` feeds the update form's
  // display-only component field.
  .item(async (id) => {
    const user = await client.user.findFirst({ id: true, name: true, email: true, age: true, role: true, balance: true, birthday: true, schedule: true, $where: { id } })
    if (!user) return null
    const posts = await client.post.findMany({
      id: true,
      title: true,
      published: true,
      $where: { author: { id } },
      $order: { id: "desc" },
      $limit: 8,
    })
    return { ...user, posts }
  })
  .table([
    { title: "ID", field: "id", width: 60, sortable: true },
    { title: "Name", field: "name", sortable: true },
    { title: "Email", field: "email" },
    // A colored pill keyed on the role value — same ROLE_COLORS the form and
    // filter selects use, so the badge and the dots always match.
    { title: "Role", field: "role", width: 120, type: "badge", colors: ROLE_COLORS },
    // Currency-formatted number.
    { title: "Balance", field: "balance", width: 110, sortable: true, type: "money", currency: "USD" },
    { title: "Age", field: "age", width: 80, sortable: true },
  ])
  // `birthday` arrives as a JS Date (or null) — dynara decoded the native `date`
  // field — so it goes straight to the DB with no conversion.
  .createForm(userForm, async ({ schedule, ...data }) => {
    await client.user.insert({ ...data, schedule: normalizeSchedule(schedule) })
  })
  // `posts` is display-only: the panel never submits it, but destructure it off
  // anyway so the DB update only ever sees real columns.
  .updateForm(userUpdateForm, async (id, { posts: _posts, schedule, ...data }) => {
    await client.user.update({ id }, { ...data, schedule: normalizeSchedule(schedule) })
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

// Tags — a minimal CRUD page; its rows feed the Posts form's relation list.
admin
  .createPage({ title: "Tags", path: "tags", icon: "tag", search: true, access: { write: isAdmin, delete: isAdmin } })
  .data(async ({ take, skip, sort, search }) => {
    const $where = search ? { title: { $includes: search } } : undefined
    const $order = sort ? { [sort.field]: sort.dir } : { id: "asc" }
    return client.tag.findMany({ id: true, title: true, $where, $order: $order as any, $limit: take, $skip: skip })
  })
  .count(async ({ search }) => {
    return client.tag.count(search ? { $where: { title: { $includes: search } } } : undefined)
  })
  .primaryKey("id", "number")
  .item(async (id) => client.tag.findFirst({ id: true, title: true, $where: { id } }))
  .table([
    { title: "ID", field: "id", width: 60, sortable: true },
    { title: "Title", field: "title", sortable: true },
  ])
  .createForm({ title: "string" }, async (data) => {
    await client.tag.insert(data)
  })
  .updateForm({ title: "string" }, async (id, data) => {
    await client.tag.update({ id }, data)
  })
  .onDelete(async (ids) => {
    await client.$transaction(ids.map((id) => client.tag.delete({ id })))
  })

// Posts — showcases a foreign-key `reference` field pointing at the Users page,
// a relation *list* (`tagIds`): the same searchable select, but every pick is
// appended to a list (the whole id array is submitted in its visible order),
// and a primitive-array chips field (`labels`).

// One value → color record serves both the form field's `enumColors` and the
// table's badge column `colors` — same shape, so the two can never disagree.
// Palette names or raw CSS colors (e.g. "#FF0000") both work.
const LABEL_COLORS = { featured: "red", pinned: "purple", translated: "blue", archived: "gray" }
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
  // The relation list. `sortable` enables drag-reordering in the form; the
  // array's order is what the handlers receive — MarciDB's `@list` many-link
  // stores it as an ordered array of ids, so no separate position field exists.
  // The same reference contract as above, plus `values`: when the edit form
  // opens, the panel resolves all picked ids' labels in one batched call.
  tagIds: {
    type: "array",
    items: "number",
    label: "Tags",
    sortable: true,
    reference: async ({ search, value, values }: { search?: string; value?: string; values?: string[] }) => {
      const $where =
        values ? { id: { $in: values.map(Number) } } :
        value != null ? { id: Number(value) } :
        search ? { title: { $includes: search } } : undefined
      const tags = await client.tag.findMany({
        id: true,
        title: true,
        $where,
        $order: { title: "asc" },
        // A batch must return every requested id; the dropdown stays capped.
        $limit: values ? values.length : 20,
      })
      return tags.map((t) => ({ value: t.id, label: t.title }))
    },
  },
  // A primitive array over a static enum — the values ARE the list, no lookup
  // table behind them. Renders as a compact chips box (the default view for a
  // static source; a reference array can opt in with `view: "chips"`). Stored
  // as a MarciDB scalar `String[]`; the submitted array replaces it whole.
  // `enumLabels`/`enumColors` add display metadata over the enum, keyed by
  // value — the enum itself stays the single source of truth for validation.
  labels: {
    type: "array",
    items: {
      type: "string",
      enum: ["featured", "pinned", "translated", "archived"],
      enumLabels: { featured: "Featured", pinned: "Pinned", translated: "Translated", archived: "Archived" },
      enumColors: LABEL_COLORS,
    },
    label: "Labels",
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
      tags: { title: true },
      labels: true,
      $where,
      $order: $order as any,
      $limit: take,
      $skip: skip,
      $cursor: cursor != null ? { id: cursor } : undefined,
    })
    // Flatten the related author's name (and the ordered tag titles) so plain
    // field columns can render them.
    return items.map((p) => ({
      ...p,
      authorName: p.author?.name ?? "—",
      tagNames: p.tags.map((t) => t.title).join(", "),
    }))
  })
  .primaryKey("id", "number")
  .item(async (id) => {
    const post = await client.post.findFirst({
      id: true,
      title: true,
      body: true,
      published: true,
      author: { id: true },
      tags: { id: true },
      labels: true,
      $where: { id },
    })
    if (!post) return null
    // The update form's fields are `authorId`/`tagIds`; expose them from the
    // related records. `tags` comes back in stored (list) order.
    return { ...post, authorId: post.author?.id ?? null, tagIds: post.tags.map((t) => t.id) }
  })
  .table([
    { title: "ID", field: "id", width: 60, sortable: true },
    { title: "Title", field: "title", sortable: true },
    { title: "Author", field: "authorName", width: "1fr" },
    { title: "Tags", field: "tagNames", width: "1fr" },
    // The array-aware badge column: one pill per label, colored by the same
    // record the form's chips use.
    { title: "Labels", field: "labels", width: "1fr", type: "badge", colors: LABEL_COLORS },
    // Renders a ✓ / ✗ instead of the raw "true"/"false".
    { title: "Published", field: "published", width: 100, sortable: true, type: "boolean" },
  ])
  // The `@list` many-link takes the ordered id array directly on insert…
  .createForm(postForm, async ({ authorId, tagIds, ...rest }) => {
    await client.post.insert({
      ...rest,
      author: authorId ? { id: authorId } : null,
      tags: tagIds.map((id) => ({ id })),
    })
  })
  // …and `$set` replaces the whole list (order included) on update — the form
  // always submits the complete array, so no diffing is needed.
  .updateForm(postForm, async (id, { authorId, tagIds, ...rest }) => {
    await client.post.update({ id }, {
      ...rest,
      author: authorId ? { $connect: { id: authorId } } : null,
      tags: { $set: tagIds.map((id) => ({ id })) },
    })
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

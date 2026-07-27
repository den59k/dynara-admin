// Users — the flagship page: filters, an image upload, an editable rows table,
// a display-only custom component, and row/bulk actions.

import { join } from "node:path"
import { HTTPError, type AdminPanel } from "../../../backend/src/main"
import { isAdmin, type User } from "../auth"
import { client } from "../db"
import { storeUpload } from "../uploads"

// Role display metadata, keyed by value and shared across the whole page — the
// form select, the filter select and the table badge all read these, so the
// labels and colors can never drift apart (mirrors Posts' LABEL_COLORS).
const ROLE_LABELS = { user: "User", moderator: "Moderator" }
const ROLE_COLORS = { user: "gray", moderator: "purple" }

// Shared form schema (create + update use the same fields). `email`/`birthday`
// are nullable (`??`) so the form shows a clear cross that resets them to null;
// `role` renders as a select over the enum, showing a colored dot per value
// from `enumColors`; `birthday` uses dynara's native `date` type — the handler
// receives a JS Date directly.
const userForm = {
  name: "string",
  email: "string??",
  age: "number",
  // An upload field. `"image"` is the picture-first variant — a thumbnail with
  // a click/drop zone — and stores the structure `storeUpload` returns
  // (`{ src, previewSrc?, size? }`), not just a url: that's what lets the
  // compression in src/uploads.ts hand the UI a thumbnail to render instead of
  // the full picture. `??` lets the input clear it back to null. Use `"file"`
  // for a document, and `{ type: "file??", accept: ".pdf" }` to narrow the picker.
  avatar: { type: "image??", label: "Avatar" },
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
    component: join(import.meta.dir, "../components/UserPosts.vue"),
  },
} as const

// A schedule row's `to` is nullable. The form's optional marker also widens its
// static type with `undefined`, which the `schedule` Json column rejects — even
// though the submitted value is only ever a string or null. Coerce it so each
// row is valid JSON before it reaches the DB.
const normalizeSchedule = (rows: { day: string; from: string; to?: string | null }[]) =>
  rows.map((r) => ({ ...r, to: r.to ?? null }))

// Maps the list options' `search`/`filter` to a MarciDB `$where`. Shared by
// `.data()` and `.count()` so the two never drift apart.
const buildWhere = ({ search, filter }: { search?: string; filter?: Record<string, any> }): any => {
  const conditions: any[] = []
  if (search) conditions.push({ name: { $includes: search } })
  if (filter?.role) conditions.push({ role: filter.role })
  if (filter?.minBalance != null) conditions.push({ balance: { $gte: filter.minBalance } })
  return conditions.length ? { $and: conditions } : undefined
}

export default (admin: AdminPanel<User>) => {
  admin
    // `access` as a bare predicate gates the whole page: only admins see Users
    // in the sidebar; a viewer hitting its routes gets 403.
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
      const $where = buildWhere(options)
      const $order = sort ? { [sort.field]: sort.dir } : { id: "asc" }
      return client.user.findMany({
        id: true,
        name: true,
        email: true,
        age: true,
        role: true,
        balance: true,
        avatar: true,
        $where,
        $order: $order as any,
        $limit: take,
        $skip: skip,
      })
    })
    // Separate from `.data()` so the count query (a full scan under a non-indexed
    // filter) isn't re-run on every page flip — the UI caches it per filter/search.
    .count(async (options) => {
      const $where = buildWhere(options)
      return client.user.count($where ? { $where } : undefined)
    })
    .primaryKey("id", "number")
    // MarciDB returns DateTime as epoch millis; the date input accepts that as-is,
    // so the row is returned unchanged. `posts` feeds the update form's
    // display-only component field.
    .item(async (id) => {
      const user = await client.user.findFirst({
        id: true, name: true, email: true, age: true, role: true,
        balance: true, birthday: true, schedule: true, avatar: true,
        $where: { id },
      })
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
      // An image column over the upload field: it renders the value's
      // `previewSrc` (the thumbnail) and falls back to `src`.
      { title: "", field: "avatar", width: 56, type: "image" },
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
    // Backs the page's `avatar` field: the panel POSTs the picked file here and
    // stores whatever this returns as the field's value. `ctx.field` says which
    // field was uploaded to, so one handler can route several (avatars here,
    // attachments elsewhere).
    .upload(async (file) => storeUpload(file))
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
}

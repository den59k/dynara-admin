// Posts — showcases a foreign-key `reference` field pointing at the Users page,
// a relation *list* (`tagIds`): the same searchable select, but every pick is
// appended to a list (the whole id array is submitted in its visible order),
// and a primitive-array chips field (`labels`).

import type { AdminPanel } from "../../../backend/src/main"
import { isAdmin, type User } from "../auth"
import { client } from "../db"

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

export default (admin: AdminPanel<User>) => {
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
}

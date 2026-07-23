# dynara-admin

[![NPM version](https://img.shields.io/npm/v/dynara-admin)](https://www.npmjs.com/package/dynara-admin)

A headless admin panel framework for [Bun](https://bun.sh), built as a plugin for the [`dynara`](https://github.com/den59k/dynara) web framework. You define pages with a fluent builder API; `dynara-admin` handles routing, auth, and serves a built-in Vue 3 UI.

> **Status:** early development, API may change between versions.


---

## Monorepo structure

| Package | Description |
|---|---|
| [`packages/backend`](packages/backend) | **`dynara-admin`** — the publishable npm package |
| [`packages/frontend`](packages/frontend) | Vue 3 SPA bundled into the backend package at build time |
| [`packages/dyn-orm`](packages/dyn-orm) | Lightweight type-safe ORM (not published to npm, local workspace only) |
| [`packages/dev-app`](packages/dev-app) | Runnable demo app that dogfoods the panel against an embedded MarciDB (not published) |
| [`packages/plugins`](packages/plugins) | Bun build plugins for Vue SFC and SVG sprites |

---

## Installation

```bash
bun add dynara-admin
```

**Peer dependencies:**

```bash
bun add dynara compact-json-schema
```

---

## Quick start

```typescript
import { Router } from "dynara";
import { createAdminPanel } from "dynara-admin";

const app = new Router();
const adminPanel = createAdminPanel();

// Register auth
adminPanel.registerAuthMethod({
  fields: { login: { type: "string" }, password: { type: "string" } },
  // Verify the credentials and return a bearer token, or null to reject.
  onLogin: async ({ login, password }) => {
    if (login !== "admin" || password !== "secret") return null;
    return { token: signToken({ id: 1 }) };
  },
  // Resolve the token to a user (returned as `ctx.user` to every page handler),
  // or null to reject the request with 401.
  onRequest: async (token) => verifyToken(token),
});

// Define a CRUD page
adminPanel
  .createPage({ title: "Users", path: "users" })
  .data(async ({ take, skip }) => db.users.findMany({ take, skip }))
  // Optional: enables a total + numbered pagination (omit for keyset next/prev).
  .count(async () => db.users.count())
  .primaryKey("id", "number")
  .item(async (id) => db.users.findFirst({ where: { id } }))
  .table([
    { title: "ID", field: "id", width: 50 },
    { title: "Name", field: "name" },
    { title: "Label", template: "{id} - {name}" },
  ])
  .createForm(userSchema, async (data) => db.users.create(data))
  .updateForm(userSchema, async (id, data) => db.users.update({ where: { id }, data }))
  .onDelete(async (ids) => db.users.deleteMany({ where: { id: { in: ids } } }));

app.register(adminPanel);
app.listen(3000);
```

The admin panel is available at `http://localhost:3000/admin`.

---

## Panel configuration

`createAdminPanel(options?)` accepts:

| Option | Default | Description |
|---|---|---|
| `basePath` | `"/admin"` | Where the UI is mounted. The API is served under `"/api" + basePath` (e.g. `basePath: "/panel"` → UI at `/panel`, API at `/api/panel`). |
| `title` | `"Dynara Admin"` | Shown in the sidebar and page title. |
| `locale` | `"en"` | UI language (`"en"` or `"ru"`); localizes the built-in panel strings. |

```typescript
const adminPanel = createAdminPanel({ basePath: "/panel", title: "Acme Admin" });
// UI: http://localhost:3000/panel   API: http://localhost:3000/api/panel
```

---

## Page builder API

| Method | Description |
|---|---|
| `.data(fn)` | Fetch the list — receives `{ take, skip, cursor?, sort?, search?, filter? }`, returns the rows as an array |
| `.count(fn)` | *Optional.* Return the unpaginated `total` for the current `{ search?, filter? }`. Present → numbered pagination with a total; absent → keyset next/prev via `cursor`. Fetched separately so paging doesn't recompute it. |
| `.primaryKey(field, type)` | Declare the identity field (`"number"` or `"string"`) |
| `.item(fn)` | Fetch a single record by id |
| `.table(columns)` | Column definitions for the table view — see [Column types](#column-types) below |
| `.createForm(schema, fn)` | Form schema + async handler for record creation |
| `.updateForm(schema, fn)` | Form schema + async handler for record update |
| `.onDelete(fn)` | Async handler for bulk delete — receives an array of ids |
| `.action(name, config, fn)` | Declare a row / bulk / toolbar action — see [Actions](#actions) below |
| `.filters(schema)` | Declare a typed filter bar — see [Filters](#filters) below |
| `.component(path)` | Absolute path to a `.vue` file rendered as the page body; compiled on-demand and served to the frontend |
| `.componentData(name, fn)` | Register a named GET endpoint the custom component can fetch; `fn` receives query params |
| `.componentData(name, schema, fn)` | Same as above with a [`compact-json-schema`](https://github.com/den59k/compact-json-schema) for query param validation |
| `.componentAction(name, fn)` | Register a named POST endpoint (a mutation) the custom component can invoke; `fn` receives just the request context |
| `.componentAction(name, schema, fn)` | Same as above with a `compact-json-schema` validating the request body; `fn` receives `(data, ctx)` |
| `.upload(fn)` | Handle uploads for `{ format: "file" }` fields; `fn(file, ctx)` stores the file and returns the URL/id saved as the value |

Every page handler (`.data`, `.item`, `.createForm`, `.updateForm`, `.onDelete`, `.componentData`, `.componentAction`) receives a request context as its last argument — `ctx.user` is the value returned by `onRequest`, for per-user authorization and audit logging.

Inside a custom component, invoke a `componentAction` with `sendAction(view, name, body)` or the route-bound `useAction(name)` helper (both exported from `dynara-admin/ui`).

`createPage` also accepts a `group` (sidebar section), `icon` (see
[Icons](#icons)), `search` (opt in to the list search box), and `access`
(per-user gating — see [Access control](#access-control)), e.g.
`createPage({ title: "Users", path: "users", group: "People", icon: "users", search: true })`.
Pages without a group are listed first.

### Icons

Everywhere the panel takes an `icon` — sidebar pages, actions, action columns
and dashboard widgets — the value is a [Tabler](https://tabler.io/icons) icon
name:

```ts
.createPage({ title: "Users", path: "users", icon: "users" })
.action("topUp", { title: "Top up", icon: "wallet" }, handler)
```

The full set (~6,200 icons, MIT) ships inside the package, so there is nothing
to install and no network access at runtime. Only the icons your config actually
names are sent to the browser — a panel using twenty icons ships twenty icons,
not the whole pack.

Browse and search the set at [icon-registry.jt3.ru](https://icon-registry.jt3.ru)
(pack: `tabler`). A handful of friendlier aliases are also accepted — `delete`,
`add`, `close`, `more`, `edit`, `image` and similar map onto their Tabler names.

An unknown name is a startup error listing the closest matches, so a typo
surfaces immediately rather than rendering an invisible icon:

```
[dynara-admin] unknown icon name(s) — not in the Tabler Icons set:
  "uzers" — did you mean: users, user?
```

In production (`NODE_ENV=production`) this is downgraded to a warning, so a typo
can never stop a deployed server from booting.

### Search

Set `search: true` on `createPage` to render a search box above the table. The
typed text arrives (debounced) as the `search` field of the `.data()` list
options — the panel does not filter for you, so your handler decides what
`search` means:

```typescript
adminPanel
  .createPage({ title: "Users", path: "users", search: true })
  .data(async ({ take, skip, search }) => {
    const where = search ? { name: { $includes: search } } : undefined
    return db.users.findMany({ where, take, skip })
  })
  .count(async ({ search }) => {
    const where = search ? { name: { $includes: search } } : undefined
    return db.users.count({ where })
  })
```

The box only appears when `search: true` is set — because the panel can't tell
whether a given `.data()` honors the option.

### Filters

Where `search` is free text, `.filters(schema)` declares typed controls — selects,
number inputs, date pickers, toggles — rendered as a bar above the table. The
submitted values are validated server-side and handed to `.data()` as `filter`:

```typescript
adminPanel
  .createPage({ title: "Users", path: "users" })
  .filters({
    // Rendered as a select (static options, or a `reference` like form fields).
    role: { type: "string?", options: [{ value: "user", label: "User" }, { value: "moderator", label: "Moderator" }] },
    active: "boolean?",         // toggle
    minBalance: "number?",      // number input
    createdAfter: "date?",      // date picker → the handler receives a Date
  })
  .data(async ({ filter, take, skip }) => {
    const where = buildWhere(filter)
    return db.users.findMany({ where, take, skip })
  })
  // Share the filter → where mapping so `.data()` and `.count()` never drift.
  .count(async ({ filter }) => db.users.count({ where: buildWhere(filter) }))
```

where `buildWhere` turns the validated filter into your ORM's query:

```typescript
function buildWhere(filter?: Record<string, any>) {
  const where: any = {}
  if (filter?.role) where.role = filter.role
  if (filter?.minBalance != null) where.balance = { gte: filter.minBalance }
  if (filter?.createdAfter) where.createdAt = { gte: filter.createdAfter }   // a JS Date
  return where
}
```

- The schema uses the same `compact-json-schema` format as forms; **every field
  should be optional** (`"…?"`) — a filter only applies when set.
- Values are validated against the schema (a type mismatch → `400`); `date`
  fields are decoded to `Date`. Unknown/empty values are dropped, so `filter`
  contains only what the user actually set (or is `undefined`).
- The active filters live in the URL (`?filter=…`), so filtered views are
  deep-linkable and survive refresh; a "Clear filters" button resets them.

### Actions

An action is a server-side operation the user triggers from the UI. Declare it
with `.action(name, config, handler)`; the panel renders a button and (when the
action has a `form`) a dialog, POSTs to the handler, and shows the returned
`message` as a toast. The handler stays on the server — only its descriptor is
sent to the frontend.

There are three kinds, chosen by the config:

```typescript
adminPanel
  .createPage({ title: "Users", path: "users" })
  .primaryKey("id", "number")
  // ...

  // Row action (default) — listed in the row's "⋯" menu; the handler receives
  // that row's primary key. A `form` opens a dialog first; the validated body
  // is the handler's second argument. Forms use the same schema as createForm,
  // so every input type works (selects, references, file uploads, …).
  .action("topUp", {
    title: "Top up balance",
    icon: "wallet",
    form: { amount: "number", comment: "string?" },
  }, async (id, data, ctx) => {
    await db.users.update({ where: { id }, data: { balance: { increment: data.amount } } })
    return { message: `Topped up by ${data.amount}` }   // shown as a toast
  })

  // Row action with no form — runs immediately, or after a plain confirm.
  // `danger: true` styles it red.
  .action("ban", { title: "Ban user", confirm: "Ban this user?", danger: true },
    async (id, data, ctx) => { await db.users.update({ where: { id }, data: { banned: true } }) })

  // Bulk action — appears next to Delete when rows are checked; receives the
  // selected primary keys.
  .action("grantBonus", { title: "Grant bonus", bulk: true, form: { amount: "number" } },
    async (ids, data, ctx) => { /* ids: number[] */ return { message: `Granted to ${ids.length}` } })

  // Toolbar action — a page-level button (no target row), placement "toolbar".
  .action("recalculate", { title: "Recalculate all", placement: "toolbar" },
    async (data, ctx) => { await recalcRatings(); return { message: "Recalculated" } })
```

**Action config**

| Field | Description |
|---|---|
| `title` | Button label (and dialog title when `form` is set) |
| `icon` | [Tabler icon name](#icons) (optional) |
| `form` | A `compact-json-schema` form; when present, a dialog collects the payload passed to the handler as `data` |
| `confirm` | Plain-text confirmation shown before running (ignored when `form` is set) |
| `danger` | Style the button red |
| `placement: "toolbar"` | Page-level action with no target row |
| `bulk: true` | Operates on the checkbox selection; the handler receives `ids[]` |

Every handler receives the request `ctx` (`ctx.user`) as its last argument, and
may throw `HTTPError` to reject. Its return value is sent back to the UI; a
`{ message }` is surfaced as a toast.

### Access control

Gate a page per-user with `access` — the host owns the rule (no DB required), and
the panel both **enforces** it (403 on the routes) and **reflects** it in the UI
(hidden sidebar entries, hidden Add / Edit / Delete / action buttons). `access`
receives the user your auth `onRequest` resolved.

```typescript
// A bare predicate gates the whole page: hidden from the sidebar and 403 on every
// route for anyone it rejects.
adminPanel.createPage({ title: "Billing", path: "billing", access: (user) => user.role === "admin" })

// The granular form gates each facet independently. Unspecified = allowed, so this
// is a page everyone can read but only admins can change:
adminPanel.createPage({
  title: "Posts", path: "posts",
  access: {
    read:   (user) => true,                      // sidebar visibility + list/item data
    write:  (user) => user.role === "admin",     // create / update / upload / actions
    delete: (user) => user.role === "admin",     // delete
  },
})
```

| Facet | Gates |
|---|---|
| `read` | Sidebar visibility, page metadata, list & item data, `componentData` |
| `write` | Create, update, file upload, declared actions, `componentAction` |
| `delete` | Bulk delete |

A denied facet returns **403** and the corresponding UI affordance disappears
(the page metadata is computed per user, so a read-only user simply gets a table
with no Add / Edit / Delete). `access` may be async.

Form schemas use [`compact-json-schema`](https://github.com/den59k/compact-json-schema) format.

### Select & reference fields

A form field renders as a select when it carries `options` or `reference`:

```typescript
.createForm({
  title: "string",
  // Static options
  status: { type: "string", options: [{ value: "draft", label: "Draft" }, { value: "live", label: "Live" }] },
  // Foreign-key reference — a searchable select backed by another page's list.
  // `label` is the field shown; `value` defaults to that page's primary key.
  authorId: { type: "number", reference: { page: "users", label: "name" } },
}, async (data) => { /* ... */ })
```

A `reference` field fetches options from the referenced page's `.data` (using the
`search`/`take` params), so that page should honor `search` for the select to filter.

### Custom form components

Any form field (create/update forms and action forms) can be rendered by your own
`.vue` file instead of a built-in input. Point the field's `component` at the file —
it is compiled and served through the same pipeline as page components; the
serialized schema only ever carries an opaque key, never the server path.

Two flavors:

```typescript
.updateForm({
  name: "string",
  // 1. Display-only block (`type: "component"`): carries no submitted value and
  //    is excluded from request validation. Its `modelValue` is whatever the
  //    page's `.item()` returned under the key — e.g. a read-only related list.
  posts: {
    type: "component",
    label: "Posts by this user",
    component: join(import.meta.dir, "components", "UserPosts.vue"),
  },
  // 2. Custom input: a real type plus `component`. The value validates and
  //    submits as that type; the component edits it via v-model.
  tags: { type: "array", items: "string", component: join(import.meta.dir, "components", "TagsInput.vue") },
}, async (id, data) => { /* data.tags is a validated string[]; data.posts never arrives */ })
```

The component receives:

| Prop | Description |
|------|-------------|
| `modelValue` | The field's current value (for a display-only field: what `.item()` returned under the key) |
| `values` | The form's current values — the editable fields, unsaved edits included. Does **not** contain the primary key |
| `item` | The persisted record — the table row, refreshed from `.item()` when the page declares it; `null` when creating. In an action form: the row a row action targets (`null` for toolbar/bulk actions). Use this for identity (`item.id`) and server fields the form doesn't declare |
| `name` | The field key |

Emit `update:modelValue` to change the value (custom inputs). A minimal
display-only component:

```vue
<template>
  <ul><li v-for="p in modelValue ?? []" :key="p.id">{{ p.title }}</li></ul>
</template>
<script setup lang="ts">
defineProps<{ modelValue?: { id: number; title: string }[], item?: { id: number } | null }>()
</script>
```

### File uploads

A `{ format: "file" }` field renders a file picker with an upload progress bar.
Register a page-level `.upload` handler that stores the file and returns the
URL/id saved as the field value:

```typescript
adminPanel
  .createPage({ title: "Users", path: "users" })
  // ...
  .createForm({ name: "string", avatar: { type: "string", format: "file" } }, async (data) => { /* data.avatar is the URL */ })
  .upload(async (file, ctx) => {
    // ctx.field is "avatar"; store `file` (a Web File) wherever you like
    return await storage.put(file)   // return the URL/id
  })
```

### Column types

Pass an array of column descriptors to `.table()`. Each column must have a `title` and optionally a `width` (pixels or `"Nfr"` fraction).

| Column kind | Required fields | Description |
|---|---|---|
| Field | `field` | Renders the value of `field` from the row object |
| Template | `template` | String with `{field}` placeholders, e.g. `"{id} - {name}"` (powered by [`itomori`](https://github.com/den59k/itomori)) |
| Action | `onClick` | Button column (icon or text label); only available after `.primaryKey()` |

> **Note:** `.table()` expects an array, not an object map. Passing the old `{ id: { ... } }` object form makes the frontend throw `columns.map is not a function`.

A field column can carry a `type` hint so the value renders as more than raw text
(an empty/`null` value always shows a muted `—`):

```typescript
.table([
  { title: "Active", field: "active", type: "boolean" },                    // ✓ / ✗
  { title: "Created", field: "createdAt", type: "date", format: "datetime" }, // localized (accepts epoch millis or ISO)
  { title: "Role", field: "role", type: "badge", colors: { admin: "red", user: "gray" } }, // colored pill
  { title: "Avatar", field: "avatar", type: "image" },                      // thumbnail (value is the src)
  { title: "Balance", field: "balance", type: "money", currency: "USD" },   // currency-formatted number
])
```

| `type` | Extra fields | Renders as |
|---|---|---|
| `boolean` | — | A green ✓ (truthy) or muted ✗ (falsy) |
| `date` | `format?: "date" \| "datetime"` | Localized date (default) or date-time |
| `badge` | `colors?: Record<value, color>` | A colored pill; `color` is a name (`red`, `green`, `blue`, `yellow`, `orange`, `purple`, `gray`) or any CSS color / hex |
| `image` | — | A small rounded thumbnail from the value URL |
| `money` | `currency?: string` | `Intl`-formatted number (with the currency symbol when set) |

---

## Dashboard

`adminPanel.dashboard(widgets)` replaces the default home page with a grid of
widgets. There are two kinds: built-in **stat** cards (a big number, the 90% case)
and **custom Vue** widgets. Each widget's `data` resolver runs server-side and its
result is delivered to the widget; stat data is rendered by the panel, a component
widget's data is passed to your `.vue` file as its `data` prop.

```typescript
adminPanel.dashboard([
  // Built-in stat card. `data` returns { value, label?, delta? }. `link` makes
  // the card navigate to a page; `span` sets how many grid columns it occupies.
  { type: "stat", title: "Users", icon: "users", link: "users",
    data: async (ctx) => ({ value: await db.users.count() }) },

  { type: "stat", title: "Published", icon: "check",
    data: async (ctx) => {
      const [total, live] = [await db.posts.count(), await db.posts.count({ published: true })]
      return { value: live, label: `of ${total}`, delta: Math.round((live / total) * 100) }  // delta → ▲/▼ %
    } },

  // Custom Vue widget: a .vue file (compiled & served like a page component). Its
  // `data` resolver's output arrives as the component's `data` prop.
  { type: "component", title: "Recent posts", span: 2,
    component: join(import.meta.dir, "widgets", "RecentPosts.vue"),
    data: async (ctx) => ({ posts: await db.posts.findMany({ take: 6, orderBy: { id: "desc" } }) }) },
])
```

```vue
<!-- widgets/RecentPosts.vue -->
<template>
  <ul>
    <li v-for="p in data?.posts ?? []" :key="p.id">{{ p.title }}</li>
  </ul>
</template>
<script setup lang="ts">
defineProps<{ data?: { posts: { id: number; title: string }[] } }>()
</script>
```

| Widget field | Applies to | Description |
|---|---|---|
| `type` | both | `"stat"` or `"component"` |
| `title` | both | Card heading |
| `icon` | both | [Tabler icon name](#icons) |
| `span` | both | Grid columns to occupy, 1–4 (default 1) |
| `data` | both | Server-side resolver; receives `ctx` (`ctx.user`). Required for `stat`, optional for `component` |
| `link` | stat | Page path to navigate to on click |
| `component` | component | Absolute path to a `.vue` file rendered with the resolved `data` as a prop |

The dashboard is the home page whenever it's configured and no page is registered
at `path: "/"`.

---

## dyn-orm

`dyn-orm` is a lightweight, type-safe query builder included in this repository as a local workspace package. It is **not published to npm** — import it through the monorepo workspace (`"dyn-orm": "*"` in your workspace `package.json`).

```typescript
import { table, createData } from "dyn-orm";

const users = table("users", {
  id: { type: "integer", primaryKey: true, default: "inc" },
  name: { type: "text" },
  email: { type: "text", unique: true },
});

const db = createData({ users });

const list = await db.users.findMany({ take: 20, skip: 0 });
const user = await db.users.findFirst({ where: { id: 1 } });
```

---

## Development

**Requirements:** [Bun](https://bun.sh) v1.2+

```bash
# Install dependencies
bun install

# Build the frontend and copy it into the backend package
bun run packages/frontend/build.ts

# Build the backend package for publishing
cd packages/backend && bun run build

# Run the backend tests
cd packages/backend && bun test
```

### Updating the icon pack

The embedded Tabler pack (`packages/backend/src/icons/tabler.json`) is generated
and committed, so builds are reproducible and the published package never talks
to a registry at build or run time. To re-sync it:

```bash
# Regenerate the pack from an icon-registry (accepts a local data/v1 checkout,
# which avoids thousands of HTTP requests)
cd packages/backend && bun run build:icons

# Re-derive the frontend's bundled built-in icons from that pack, so the icons
# the UI renders itself stay the same artwork as the server-resolved ones
cd packages/frontend && bun scripts/sync-builtin-icons.ts

# CI: verify they're in sync without writing
cd packages/frontend && bun scripts/sync-builtin-icons.ts --check
```

Built-in icon files keep their existing names; the Tabler icon each maps to is
the same name, or the alias declared in `packages/backend/src/icons.ts`.

---

## License

MIT © [den59k](https://github.com/den59k)

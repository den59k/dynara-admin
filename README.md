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
  .data(async ({ take, skip }) => ({
    items: await db.users.findMany({ take, skip }),
    total: await db.users.count(),
  }))
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
| `.data(fn)` | Fetch the list — receives `{ take, skip, sort?, search? }`, returns `{ items, total }` (the unpaginated `total` drives pagination) |
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

`createPage` also accepts a `group` (sidebar section), `icon` (from the built-in
icon set), `search` (opt in to the list search box), and `access` (per-user
gating — see [Access control](#access-control)), e.g.
`createPage({ title: "Users", path: "users", group: "People", icon: "users", search: true })`.
Pages without a group are listed first.

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
    return { items: await db.users.findMany({ where, take, skip }), total: await db.users.count({ where }) }
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
    const where: any = {}
    if (filter?.role) where.role = filter.role
    if (filter?.minBalance != null) where.balance = { gte: filter.minBalance }
    if (filter?.createdAfter) where.createdAt = { gte: filter.createdAt }   // a JS Date
    return { items: await db.users.findMany({ where, take, skip }), total: await db.users.count({ where }) }
  })
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

  // Row action (default) — a per-row button (visible on hover) that receives
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
| `icon` | Icon name from the built-in set (optional) |
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
| `icon` | both | Icon name from the built-in set |
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

---

## License

MIT © [den59k](https://github.com/den59k)

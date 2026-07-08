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
| `.component(path)` | Absolute path to a `.vue` file rendered as the page body; compiled on-demand and served to the frontend |
| `.componentData(name, fn)` | Register a named GET endpoint the custom component can fetch; `fn` receives query params |
| `.componentData(name, schema, fn)` | Same as above with a [`compact-json-schema`](https://github.com/den59k/compact-json-schema) for query param validation |
| `.componentAction(name, fn)` | Register a named POST endpoint (a mutation) the custom component can invoke; `fn` receives just the request context |
| `.componentAction(name, schema, fn)` | Same as above with a `compact-json-schema` validating the request body; `fn` receives `(data, ctx)` |
| `.upload(fn)` | Handle uploads for `{ format: "file" }` fields; `fn(file, ctx)` stores the file and returns the URL/id saved as the value |

Every page handler (`.data`, `.item`, `.createForm`, `.updateForm`, `.onDelete`, `.componentData`, `.componentAction`) receives a request context as its last argument — `ctx.user` is the value returned by `onRequest`, for per-user authorization and audit logging.

Inside a custom component, invoke a `componentAction` with `sendAction(view, name, body)` or the route-bound `useAction(name)` helper (both exported from `dynara-admin/ui`).

`createPage` also accepts a `group` (sidebar section), `icon` (from the built-in
icon set), and `search` (opt in to the list search box), e.g.
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

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
| `locale` | `"en"` | UI language (`"en"` or `"ru"`). |

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
| `.component(path)` | Absolute path to a `.vue` file rendered as the page body; compiled on-demand and served to the frontend |
| `.componentData(name, fn)` | Register a named GET endpoint the custom component can fetch; `fn` receives query params |
| `.componentData(name, schema, fn)` | Same as above with a [`compact-json-schema`](https://github.com/den59k/compact-json-schema) for query param validation |
| `.componentAction(name, fn)` | Register a named POST endpoint (a mutation) the custom component can invoke; `fn` receives just the request context |
| `.componentAction(name, schema, fn)` | Same as above with a `compact-json-schema` validating the request body; `fn` receives `(data, ctx)` |

Every page handler (`.data`, `.item`, `.createForm`, `.updateForm`, `.onDelete`, `.componentData`, `.componentAction`) receives a request context as its last argument — `ctx.user` is the value returned by `onRequest`, for per-user authorization and audit logging.

Inside a custom component, invoke a `componentAction` with `sendAction(view, name, body)` or the route-bound `useAction(name)` helper (both exported from `dynara-admin/ui`).

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

### Column types

Pass an array of column descriptors to `.table()`. Each column must have a `title` and optionally a `width` (pixels or `"Nfr"` fraction).

| Column kind | Required fields | Description |
|---|---|---|
| Field | `field` | Renders the value of `field` from the row object |
| Template | `template` | String with `{field}` placeholders, e.g. `"{id} - {name}"` (powered by [`itomori`](https://github.com/den59k/itomori)) |
| Action | `onClick` | Button column (icon or text label); only available after `.primaryKey()` |

> **Note:** `.table()` expects an array, not an object map. Passing the old `{ id: { ... } }` object form makes the frontend throw `columns.map is not a function`.

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

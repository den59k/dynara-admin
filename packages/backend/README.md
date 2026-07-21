# dynara-admin

> Spin up a headless CMS / admin panel in minutes on top of [`dynara`](https://www.npmjs.com/package/dynara).

`dynara-admin` turns a set of route files into a fully functional admin panel: list views with pagination, item pages, create/update forms, and bulk delete — all wired to **your own** data layer.

It is **database-agnostic**: there is no built-in ORM and no assumptions about your storage. You provide async handlers, and the panel calls them. That's why the page API is expressed as a small set of hooks (`.data`, `.item`, `.createForm`, …) rather than a schema bound to a particular database.

It is built on `dynara`, a Bun-first framework with a Fastify-like API. Because of that you can port the panel to Fastify if you ever need to, but on `dynara` (running on Bun) it's faster.

## Features

- **Headless** — ships the backend and the page-definition API; your data and UI logic stay yours.
- **Database-agnostic** — works with any ORM or raw driver; you just return data from async functions.
- **Pluggable auth** — define your own login fields and token logic via `registerAuthMethod`.
- **File-based pages** — drop a file into a routes folder and register it; one file = one admin page.
- **Typed page builder** — a fluent, fully typed API for tables, forms, and actions.
- **Fastify-compatible** — runs fastest on `dynara` (Bun), but the surface is portable to Fastify.

## Installation

```bash
bun add dynara-admin
```

## Quick start

Create a panel, load your page modules from a folder, attach an auth method, and register it on your app.

```typescript
import { createAdminPanel, HTTPError } from "dynara-admin"
import { Glob } from "bun"
import { join } from "node:path"

const adminPanel = createAdminPanel()

// Load every page module from ./routes-admin
const adminPages = new Glob("**/*.ts")
for await (const routeFile of adminPages.scan({ cwd: join(__dirname, "routes-admin") })) {
  const module = await import(join(__dirname, "routes-admin", routeFile))
  if (!module.default) {
    continue
  }
  adminPanel.register(module.default, routeFile.slice(0, routeFile.indexOf(".")))
}

// Mount onto your dynara (or Fastify-compatible) app
app.register(adminPanel)
```

## Authentication

Register an auth method by describing the login form fields and providing the login / per-request logic. Throw an `HTTPError` to reject a request.

```typescript
import { createAdminPanel, HTTPError } from "dynara-admin"

const accounts: Record<string, string> = {
  root: "123123"
}

adminPanel.registerAuthMethod({
  fields: {
    login: { type: "string", label: "Login" },
    password: { type: "string", label: "Password", hidden: true }
  },
  async onLogin(data) {
    if (!accounts[data.login] || accounts[data.login] !== data.password) {
      throw new HTTPError("Wrong login or password", 403)
    }
    return generateToken({ login: data.login })
  },
  async onRequest(token) {
    const data = verifyToken(token)
    if (!data) {
      throw new HTTPError("Wrong token")
    }
  }
})
```

- `fields` — the fields shown on the login screen (same field options as form schemas; see below).
- `onLogin(data)` — receives the submitted fields and returns a token string on success.
- `onRequest(token)` — runs on each authenticated request; throw to reject.

(`generateToken` / `verifyToken` above are your own token helpers — use whatever you like, e.g. JWT.)

## Defining a page

Each page is a module with a default export: a function that receives the `AdminPanel` instance and the page `path`, and returns a configured page. Forms are described with [`compact-json-schema`](https://www.npmjs.com/package/compact-json-schema).

```typescript
import { type AdminPanel } from "dynara-admin"
import { schema } from "compact-json-schema"
import { db } from "../plugins/db"

const userSchema = schema({
  name: { type: "string", width: 0.5, label: "First name" },
  surname: { type: "string", width: 0.5, label: "Last name" },
  description: { type: "string", multiline: true, label: "Bio" }
})

export default (admin: AdminPanel, path: string) =>
  admin.createPage({ title: "Users", path })
    .data(async ({ take, skip }) => {
      return await db.users.findMany({ select: { id: true, name: true }, take, skip })
    })
    .primaryKey("id", "number")
    .item(async (id) => {
      return await db.users.findFirst({ where: { id } })
    })
    .table([
      { title: "ID", field: "id", width: 60 },
      { title: "Name", field: "name" },
      { title: "Label", template: "{id} - {name}" }
    ])
    .createForm(userSchema, async (data) => {
      await db.users.create(data)
    })
    .updateForm(userSchema, async (itemId, data) => {
      await db.users.update({ id: itemId }, data)
    })
    .onDelete(async (ids) => {
      await db.users.delete({ id: { in: ids } })
    })
```

## Page API reference

The page builder is a fluent chain returned by `admin.createPage(...)`.

| Method | Description |
| --- | --- |
| `createPage({ title, path })` | Starts a page. `title` is shown in the UI; `path` is the route segment. |
| `.data(async ({ take, skip, cursor, sort, search, filter }) => rows)` | Returns the rows for the current list page as an array. `take`/`skip` position numbered pages; `cursor` (the previous page's last primary key) is sent instead when the page has no `.count()`. |
| `.count(async ({ search, filter }) => total)` | *Optional.* Returns the unpaginated row count for the current filter/search. Declaring it enables numbered pagination with a total; omit it to fall back to keyset next/prev via `cursor`. Kept separate from `.data()` so the count isn't recomputed on every page flip. |
| `.primaryKey(name, type)` | Declares the primary key field and its type (e.g. `"id"`, `"number"`). Used to identify items. |
| `.item(async (id) => row)` | Fetches a single record by its primary key for the item page. |
| `.table(columns)` | Configures the list columns (see column options below). |
| `.createForm(schema, async (data) => {})` | Defines the "create" form and its submit handler. |
| `.updateForm(schema, async (itemId, data) => {})` | Defines the "update" form; receives the item's primary key and the new data. |
| `.onDelete(async (ids) => {})` | Bulk delete handler; receives an array of primary keys. |

### Table columns

`.table([ ... ])` takes an **array** of column descriptors. Every column has a `title` and an optional `width` (pixels, or a `"Nfr"` fraction). The column kind is determined by which extra field it carries:

| Column kind | Required field | Description |
| --- | --- | --- |
| Field | `field` | Renders the value of `field` from the row object. |
| Template | `template` | String with `{field}` placeholders, e.g. `"{id} - {name}"` (powered by [`itomori`](https://github.com/den59k/itomori)). |
| Action | `onClick` | Button column (set `icon` and/or `text`); only available after `.primaryKey()`. Receives the row's primary key. |

```typescript
.table([
  { title: "ID", field: "id", width: 60 },
  { title: "Name", field: "name" },
  { title: "Label", template: "{id} - {name}" },
  { title: "", onClick: (id) => console.log(id), icon: "edit" }
])
```

> **Note:** `.table()` expects an array, not an object map. Passing the old `{ id: { ... } }` object form makes the frontend throw `columns.map is not a function`.

### Field options

Form schemas (`compact-json-schema`) and auth `fields` share the same field options:

| Option | Description |
| --- | --- |
| `type` | Field type, e.g. `"string"`. `"number"` / `"integer"` render a numeric input; `"date"` renders a date picker. |
| `label` | Field label shown in the UI. |
| `width` | Fraction of the row the field occupies, e.g. `0.5` for half-width. |
| `multiline` | Render a multi-line text area instead of a single-line input. |
| `hidden` | Mask the input (e.g. for passwords). |
| `format` | `"datetime"` switches a `date` field to a date+time picker; `"file"` renders an upload field. |

An array of values renders as a select (a `compact-json-schema` enum):

```typescript
const userForm = schema({
  role: ["user", "moderator"],  // enum → select
  birthday: "date??",           // nullable date picker; handler gets a JS Date
})
```

#### Optional vs nullable

A `?` suffix makes a field *optional* (may be omitted from the request), while `??` makes it *nullable* (an explicit `null` is accepted). Nullable fields show a clear cross in the form that resets the value to `null` — use `??` for DB-nullable columns, so an edit form can both display and resubmit the `null` your `item()` handler returns.

#### Dates

Declare a date field with dynara's native `date` type (`"date"`, `"date?"`, or `"date??"`). dynara validates the incoming value and **decodes it into a JS `Date`** before your `createForm` / `updateForm` handler runs, so no manual conversion is needed. On the wire the picker sends `"YYYY-MM-DD"` (or a full ISO string), and an untouched edit form resends whatever your `item()` returned — a `Date`, ISO string, or epoch-millis number are all accepted. Add `format: "datetime"` (`{ type: "date??", format: "datetime" }`) to get a date+time picker.

> Requires `dynara ^0.0.3` and `compact-json-schema ^0.1.6`. Plain-string date fields with `format: "date"` are still honored by the frontend for older setups, but the native type is preferred.

## Why dynara (and Fastify)

`dynara` is a Bun-specific framework with a Fastify-like API. `dynara-admin` targets that surface, so:

- On **Bun + dynara** you get the fastest path.
- The API is close enough to **Fastify** that the panel can be moved over if your stack requires it.

## License

MIT
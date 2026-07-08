# PLAN.md — dynara-admin development roadmap

The goal: a **user-friendly headless admin panel** with zero DBMS dependency. The host app
owns all data access (any ORM, any storage, even plain arrays); `dynara-admin` owns routing,
auth plumbing, and a polished generic UI. Everything below keeps that contract: every new
feature is declared through the builder API and serialized as plain JSON to the frontend —
no feature may assume a database exists.

## Where we are

Already working: auth (single method, bearer token), CRUD pages (list / item / create /
update / bulk delete), schema-driven forms (text, number, boolean, date, textarea, select,
enum, file upload, nullable fields), static options + async `reference` selects, sortable
columns, pagination, sidebar groups/icons, custom Vue page components with
`componentData` / `componentAction`, i18n (en/ru), path-traversal-safe asset serving.

### ✅ Delivered in this pass (M1 core + toasts + auth fixes)

- **Declarative actions (1.1 + 1.2)** — `.action(name, config, handler)` with three kinds:
  row (per-row, receives the id; optional `form` dialog reusing the full input stack),
  bulk (operates on the checkbox selection), and toolbar (page-level). Serialized as JSON
  in `PageMeta.actions`; handlers stay server-side; POST `…/data/:path/actions/:name`.
  This replaces the never-functional function-valued `ActionColumn`. The flagship
  "top up balance" scenario is live in the dev-app.
- **Search box (1.3)** — opt-in via `createPage({ search: true })` → `PageMeta.search`;
  debounced input in `DataPage.vue` wired to the already-working `search` list param.
- **Toasts (3.1)** — `VToastProvider` + `useToast()`; action results surface their
  returned `message` as a toast.
- **Auth hygiene (3.2, partial)** — the sidebar logout button now clears the token and
  redirects; the frontend redirects to `/auth` on **401 and 403** (expired tokens no
  longer strand the user).

### Remaining known gaps

- List state (page, sort, search) is not reflected in the URL — no deep links, broken
  back button, state lost on refresh. *(M2.2)*
- No loading/empty/error states in the table yet. *(M2.3)*
- `HomePage.vue` is an empty stub. *(M3.4)*
- All values render via `{{ value }}`: booleans as `true/false`, dates as epoch millis,
  no badges/images/links. *(M2.1)*

---

## Milestone 1 — Item actions & search (the core UX gap)

### 1.1 Declarative item actions ⭐ flagship feature

The "top up user balance" scenario: a per-row action that opens a schema-driven dialog
and posts to a server handler. Replaces the broken function-valued `ActionColumn`.

```typescript
adminPanel
  .createPage({ title: "Users", path: "users" })
  // ...
  .action("topUpBalance", {
    title: "Top up balance",
    icon: "wallet",
    // Optional schema → the UI opens a form dialog before invoking the handler.
    // Same compact-json-schema as createForm, so every input type works,
    // including reference selects and file uploads.
    form: { amount: "number", comment: "string?" },
    // Optional plain-confirm variant instead of a form:
    // confirm: "Ban this user?", danger: true,
  }, async (id, data, ctx) => {
    await db.users.update({ where: { id }, data: { balance: { increment: data.amount } } })
    return { message: `Balance topped up by ${data.amount}` }   // shown as a toast
  })
```

- **Backend:** store actions on `PageEntry`; serialize `{ name, title, icon, form?,
  confirm?, danger?, placement? }` in `PageMeta` (handler stays server-side); register
  `POST ${apiBase}/data/:path/actions/:name` accepting `{ itemId, data? }`, validated
  against the action's form schema. Reuse the `registerReferenceMethods` walk so action
  forms support `reference` fields too.
- **Frontend:** render actions in the existing hover `v-table__actions` cell (and in the
  row-edit dialog footer); a new generic `ActionDialog.vue` renders `JsonInput` from the
  action's form schema, submits, shows the returned `message` as a toast, and refreshes
  the list.
- **Placement option** `placement: "row" | "toolbar" | "both"` — toolbar actions
  (e.g. "Recalculate all ratings") render as page-level buttons and receive no `id`.
- Remove (or deprecate with a loud runtime warning) the function-valued `ActionColumn`
  from the backend `.table()` types — it never worked and misleads users.

### 1.2 Bulk actions on selection

Checkbox selection already exists but only powers delete. Extend actions with
`bulk: true` → the handler receives `ids: KeyType[]`; the button appears next to the
Delete button when rows are selected (e.g. "Ban selected", "Export selected").
Delete itself becomes just a built-in bulk action.

### 1.3 Search input

- Add a debounced (~300 ms) search field to `DataPage.vue`, wired to the already-working
  `search` list param; reset `page` to 0 on change.
- Backend can't know whether a page's `.data` honors `search`, so make it explicit:
  `createPage({ ..., search: true })` (or `.searchable()`) → `PageMeta.search` → the UI
  shows the input only where it works. The dev-app pages already honor `search`.

### 1.4 Declarative filters

Search covers text; real tables need typed filters (status selects, date ranges, flags):

```typescript
.filters({
  role: { type: "string?", options: [...] },      // renders as a select
  published: "boolean?",                          // renders as a checkbox/toggle
  createdAfter: "date?",                          // renders as a date picker
})
```

- The schema is serialized in `PageMeta`; values are passed to `.data()` as a new
  `filter` field on `ListOptions` (sent as a JSON-encoded query param, validated
  server-side against the schema).
- UI: a filter bar above the table reusing `JsonInput` — no new input components needed.
- Active-filter chips + "clear all".

---

## Milestone 2 — Data presentation

### 2.1 Column formatters (declarative, JSON-serializable)

```typescript
.table([
  { title: "Active", field: "active", type: "boolean" },          // ✓ / ✗
  { title: "Created", field: "createdAt", type: "date", format: "datetime" },
  { title: "Role", field: "role", type: "badge",
    colors: { admin: "red", moderator: "blue" } },                // enum pill
  { title: "Avatar", field: "avatar", type: "image" },            // thumbnail
  { title: "Price", field: "price", type: "money", currency: "USD" },
  { title: "Author", field: "authorName", type: "link", page: "users", idField: "authorId" }, // cross-page link
])
```

- One `renderCell` dispatch in `VTable.vue`; `null`/`undefined` render as a muted `—`
  everywhere instead of empty/`null` text.
- The `link` type answers "navigate from a post to its author" without custom components.

### 2.2 List state in the URL

Encode `page`, `sort`, `search`, and `filters` into the route query
(`/users?page=2&sort=-name&search=bob`). Deep links, refresh survival, working
back/forward. Straightforward: derive `listParams` from `route.query` instead of local refs.

### 2.3 Table states & pagination polish

- **Loading:** skeleton rows on first load; keep stale data + subtle progress on param changes.
- **Empty:** proper empty state ("No items yet" + Add button; "Nothing found" + clear-search when filtered).
- **Error:** inline error with a Retry button (surface `HTTPError` body).
- Pagination: page-size selector (20/50/100, persisted per page in `localStorage`),
  numbered pages instead of bare prev/next.

---

## Milestone 3 — Feedback & shell

### 3.1 Toast notifications

A tiny `useToast()` provider (like the existing `VDialogProvider`): success toasts after
create/update/delete/action (using the action's returned `message`), error toasts for any
failed request that isn't a form-field validation error. This is a prerequisite polish
for actions (1.1) landing well.

### 3.2 Auth hygiene

- **Wire the logout button:** clear the token, redirect to `/auth`; optional server-side
  `onLogout(token)` in the auth method to revoke.
- **Fix status-code handling:** treat 401 *and* 403 uniformly in the frontend (redirect
  to `/auth`); ideally a global fetch-level interceptor in `request.ts` rather than the
  current sidebar-only `watch(error)`.
- **`GET ${apiBase}/me`:** return a display representation of `ctx.user`
  (via optional `userLabel: (user) => ({ name, email? })` on the auth method); show it
  above the logout button.

### 3.3 Access control (per-page, user-driven)

Zero-DBMS RBAC — the host decides, the panel enforces visibility:

```typescript
.createPage({ title: "Billing", path: "billing", access: (user) => user.role === "admin" })
```

- `/pages` filters the sidebar per user; every page route re-checks `access` server-side
  (403 otherwise).
- Finer grain: `access: { read: fn, write: fn, delete: fn }` — a read-only user gets a
  table with no Add/Edit/Delete affordances (`PageMeta` computed per user).

### 3.4 Dashboard (HomePage)

Replace the stub with a declarative widget builder:

```typescript
adminPanel.dashboard([
  { type: "stat", title: "Users", icon: "users", value: async (ctx) => db.users.count(), link: "users" },
  { type: "stat", title: "Revenue (30d)", value: async (ctx) => `$${await revenue()}` },
  { type: "table", title: "Latest signups", page: "users", take: 5 },
])
```

Stat cards + recent-items tables cover 90% of admin dashboards; anything fancier already
has an escape hatch (`.component()` on a `path: "/"` page).

---

## Milestone 4 — Records & forms

### 4.1 Item detail view (optional per page)

Editing in a dialog is fine for small records, but a "user card" (the balance top-up
scenario again) wants a dedicated page:

- Route `/:viewId/:itemId` rendering the `.item()` payload; edit form inline or in the
  existing dialog; item actions (1.1) as header buttons.
- Opt-in: `createPage({ ..., itemView: true })` — dialogs stay the default.
- Related lists: `.itemSection("Posts", { page: "posts", filter: (id) => ({ authorId: id }) })`
  renders the other page's table scoped to the record.
- Deep-linkable: an action toast like "User created" can link straight to the record.

### 4.2 Form improvements

- **Unsaved-changes guard:** confirm before closing a dirty dialog (data loss is the #1
  admin-panel complaint).
- **Layout hints:** `width` is already in the frontend `Schema` type — document and
  support side-by-side fields; add `section` labels for long forms.
- **Arrays of objects:** repeatable sub-form (add/remove/reorder rows) for
  `{ type: "array", items: {...} }` — schema support exists, input doesn't.
- **Dependent references:** let a `reference` method receive current form values
  (e.g. city select filtered by chosen country).
- Optional `richtext`/`markdown` format (lazy-loaded editor, keep the core bundle small).

### 4.3 CSV export

`createPage({ ..., export: true })` → `GET ${apiBase}/data/:path/export` streams CSV by
paging through the page's own `.data()` (take/skip loop) — zero DB coupling. UI: an
Export button honoring the current search/filters. (`downloadXHR` in `request.ts` is
already there for the client side.)

---

## Milestone 5 — Platform & DX

- **Multiple auth methods:** `registerAuthMethod` silently overwrites on second call
  today — either support several (tabs on the login page) or throw.
- **Global hooks for auditing:** `adminPanel.onMutation(({ page, action, user, ids, data }) => ...)`
  fired on every insert/update/delete/action — an audit log in one line, host-owned storage.
- **Realtime-ish freshness:** optional polling interval per page
  (`createPage({ refetchInterval: 10_000 })`); revisit SSE later.
- **Theming:** CSS custom properties are already used throughout — expose a documented
  theme object (`createAdminPanel({ theme: { primary: "#..." } })`) + dark mode toggle
  (persisted, `prefers-color-scheme` default).
- **Responsive layout:** collapsible sidebar (hamburger) below ~900px; horizontal-scroll
  tables on narrow screens.
- **Keyboard & a11y:** focus trap in dialogs, `Esc` to close (verify), `/` to focus
  search, labels/aria on inputs.
- **Docs:** the README is already good; grow it into a docs site (VitePress) with a
  cookbook — "add a row action", "custom page component", "auth with JWT", "file uploads
  to S3". Publish `dyn-orm` or clearly mark it internal.
- **Tests:** backend route tests exist; add action/filter/access coverage and a Playwright
  smoke test against the dev-app (login → CRUD → action dialog).

---

## Suggested order

| Priority | Items | Why |
|---|---|---|
| ✅ done | 1.3 search input, 3.1 toasts, 3.2 auth fixes (logout, 401) | Small, fixes visible papercuts, prerequisites for actions landing well |
| ✅ done | **1.1 item actions** (+ 1.2 bulk) | The flagship gap — makes the panel *operational*, not just CRUD |
| **P0** | 2.3 table states (loading / empty / error) | The last of the visible papercuts |
| **P1** | 1.4 filters, 2.1 column formatters, 2.2 URL state | Makes tables genuinely usable on real data |
| **P1** | 3.3 access control, 3.4 dashboard | Expected of any admin framework |
| **P2** | 4.1 item view, 4.2 forms, 4.3 export | Depth features |
| **P3** | Milestone 5 | Platform maturity |

Every item stays true to the design constraint: **declared server-side, serialized as
JSON, rendered generically** — the host app keeps full ownership of data access.

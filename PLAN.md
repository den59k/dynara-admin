# dynara-admin — Development Plan

> Status as of 2026-07-02, v0.0.2. The core works and is proven in dogfooding,
> but several protocol-level decisions should be fixed **before** the API
> surface hardens — every consumer written today bakes them in.
>
> `packages/dyn-orm` is out of scope: it will be removed. Persistence-layer
> integration targets **marci-db** (our own database) via an adapter interface
> (see Milestone 3).

---

## Milestone 1 — Core fixes (breaking, do first) → v0.1.0

These change the wire protocol or the public API. Doing them now is cheap;
doing them after more consumers exist is not.

### 1.1 Auth hardening (security)

- [x] **Fix the auth-bypass in the `onRequest` hook.** `req.raw.url.endsWith("/auth")`
      exempts *any* URL ending in `/auth` — e.g. `GET /api/admin/data/<page>/items/auth`
      (string primary keys) or a `componentData` named `auth` are served without a
      token. Match the exact path `/api/admin/auth` instead (`packages/backend/src/main.ts:64`).
- [x] **Authenticate `/admin/custom/:name`.** Compiled custom components are served
      to anyone; they can embed non-public logic. Registered via `routesRaw`, so the
      dynara hook never runs — add an explicit token check in the handler.
      (Token is read from the `?token=` query param, since a browser `import()`
      cannot attach an `Authorization` header; `DataPage.vue` appends it.)
- [x] **Return 401 on failed login** instead of `200` with a `null` body; drop the
      `if (!token)` special case in `AuthPage.vue`.
- [x] **Separate "token" from "user" in the auth contract.**
      Today `onLogin` returns `K` and `onRequest` receives `K` — the same type for
      the credential result and the bearer token, and `onRequest` returns `void`.
      Target contract:
      ```ts
      onLogin(data): Promise<{ token: string } | null>
      onRequest(token: string): Promise<User | null>   // null → 401
      ```
      Thread the resolved `User` into every page handler (`data`, `item`, `onInsert`,
      `onUpdate`, `onDelete`, `componentData`) as a context argument — this is the
      prerequisite for per-user authorization and audit logging later.

### 1.2 List-data protocol

- [x] **Return `{ items, total }` from `.data()`** instead of a bare array — without
      a total the UI can never paginate.
- [x] **Actually send `take`/`skip` from the frontend.** `dataApi.getData` currently
      passes no query params, so every page loads the entire table.
      (`DataPage.vue` now has a basic prev/next pager off `total`.)
- [x] **Add `sort` to the protocol.** Columns already declare `sortable?: boolean`,
      but nothing wires it: `.data()` should receive `{ take, skip, sort?: { field, dir } }`.
      (Wire format is `sortField`/`sortDir` query params; the sorting *UI* is M2.)
- [x] **Add `search` (single free-text query param) now**, even if the UI ships later —
      it's the last field the list request will ever need, and adding it later is a
      breaking change for `.data()` implementers.

### 1.3 Update-form correctness

- [x] **Row click uses the wrong schema.** `DataPage.vue` opens `AddItemDialog` with
      `tableData.createForm.schema` for editing; it must use `updateForm.schema`.
- [x] Split `AddItemDialog` into create/edit modes explicitly (or two dialogs) —
      the current `props.item?` branching plus a second `getPageData` request inside
      the dialog is fragile. (Now driven by an `isEdit` computed; `primaryKey`/
      `itemAccess` are passed in as props instead of re-fetching `getPageData`.)

### 1.4 Panel configuration

- [x] `createAdminPanel(options)` — today it accepts nothing. Minimum:
      ```ts
      { basePath?: string /* default "/admin" */, title?: string, locale?: "en" | "ru" }
      ```
      `/admin` and `/api/admin` are hardcoded in ~10 places across backend and
      frontend; derive both from `basePath`.
      (Backend derives `uiBase`/`apiBase`; the served index.html has asset paths
      rewritten and `__DYNARA_BASE__`/`__DYNARA_API_BASE__`/`__DYNARA_TITLE__`/
      `__DYNARA_LOCALE__` injected, which the frontend reads. `locale` is accepted
      and exposed but the string table itself is M2 i18n. Verified end-to-end
      against a running server with `basePath: "/panel"`.)

### 1.5 Page registry hygiene

- [x] Validate page paths at `createPage` time: reject duplicates (currently two
      pages with the same path silently collide on routes) and characters that
      break the route template.
- [x] Formalize or remove the `__home__` sentinel — it currently leaks into the
      frontend (`DataPage.vue`, `exportApi.ts`) as a magic string.
      (Backend uses a `HOME_PATH` constant; the frontend uses `HOME_VIEW_ID`
      from `src/constants.ts`.)
- [x] Component name collisions: `componentFiles` is keyed by file basename, so two
      `.component()` files named `Stats.vue` on different pages overwrite each other.
      Key by page path + name or hash the absolute path. (Keyed `${segment}__${name}`.)

### 1.6 Internal typing

- [x] `PageEntry` is `any` throughout — the fluent API is typed for the consumer but
      the implementation is unchecked. Type it properly.
- [x] Extract the page-metadata shape (`/api/admin/pages/:path` response) into one
      shared type used by both backend and `dataApi.ts` (`FullPage` is currently
      redeclared by hand and already drifts).
      (Backend now has an authoritative `PageMeta` type enforced as the handler's
      return; `FullPage` mirrors it with a keep-in-sync note. A *literal* shared
      type is blocked: `dynara-admin` resolves to the published package in the bun
      cache, not the local workspace source — so full unification waits on publish
      or a shared types package.)

---

## Milestone 2 — Features the dogfooding projects keep hitting → v0.2.x

- [ ] **Pagination UI** in `VTable`/`DataPage` (depends on 1.2).
- [ ] **Sorting UI** — clickable headers for `sortable` columns (depends on 1.2).
- [ ] **Mutations from custom components** — `componentData` is GET-only; add
      `componentAction(name, schema, handler)` (POST) so custom pages can write
      without hand-rolling routes.
- [ ] **Reference/select inputs** — form field type that loads options from an async
      source (another page's `.data` or an inline options handler). Needed for any
      foreign-key field.
- [ ] **File uploads** — the frontend already ships `sendXHR` with progress; the core
      has no upload contract. Add a `file` schema type + upload endpoint per page.
- [ ] **i18n** — UI strings are hardcoded Russian while README/package are English.
      Extract to a locale table, default `en`, ship `ru`. Small surface now; painful
      later.
- [ ] **Sidebar structure** — page groups/sections and icons in `createPage` options.

---

## Milestone 3 — marci-db integration

Keep the core headless and storage-agnostic; integrate marci-db through an
adapter, not direct coupling.

- [ ] Remove `packages/dyn-orm` from the workspace.
- [ ] Define a minimal `DataSource` interface the page builder can consume:
      ```ts
      { list({take, skip, sort, search}), get(id), create(data), update(id, data), delete(ids), schema() }
      ```
- [ ] Ship a `dynara-admin/marci-db` adapter package:
      `.fromCollection(db.users)` → auto-generates `.data/.item/.createForm/.updateForm/.onDelete`
      and derives form + table schema from the collection's schema introspection.
- [ ] Manual `.data(...)` etc. remains the escape hatch — the adapter is sugar on
      top of the same page builder, not a parallel path.

---

## Milestone 4 — DX, build & release

- [ ] **Restore dev mode.** `if (true || isProduction)` in `main.ts` is dead code;
      the vite-dev-server branch is commented out. Decide on one dev story
      (vite middleware or Bun HMR) and make `bun dev` in a consumer project serve
      an editable panel frontend.
- [ ] **Stop copying the frontend build into `backend/src/frontend`.** Build output
      belongs in `dist` only; committed artifacts in `src` and a tracked
      `backend/dist` cause noisy diffs and stale-build bugs.
- [ ] **CI** — GitHub Actions: `bun test` + backend build + `vue-tsc` on the frontend
      on every push. Publish on tag.
- [ ] **Frontend tests** — none exist. Start with component tests for the form
      generator (`getInput`/`JsonInput` + `getDefaultValue`) and an e2e smoke
      (login → list → create → edit → delete) against a fixture app.
- [ ] Static-asset handler: return 404 for missing files under `/admin/assets/`
      (currently throws → 500) and verify the traversal guard against
      percent-encoded `..` on Windows paths.

---

## Later / ideas (not scheduled)

- Multiple auth methods (`registerAuthMethod` currently overwrites — keep last-wins
  until this lands).
- Roles & per-page access rules (builds on the User context from 1.1).
- Audit-log middleware around `onInsert`/`onUpdate`/`onDelete`.
- Dashboard widgets for the default home page.
- Theming/branding beyond the title.

---

## Suggested order

1. **1.1 + 1.3** — security and correctness bugs, no design work needed.
2. **1.2** — the list protocol; touches backend, `dataApi`, `VTable`, tests.
3. **1.4–1.6** — config + hygiene, then cut **v0.1.0** and migrate the dogfooding projects.
4. Milestone 2 features as dogfooding demands them; Milestone 3 alongside marci-db's own development.

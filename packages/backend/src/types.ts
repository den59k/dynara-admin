// Shared types: the public API surface (re-exported from main.ts), the internal
// registration entries, and the PanelState threaded through the modules.

import type { Router } from "dynara"
import type { SchemaItem, SchemaType } from "compact-json-schema"
import type { NormalizedAccess, PageAccess } from "./access.ts"

export type AdminPanelPlugin<T extends any[]> = (app: AdminPanel, ...options: T) => void | Promise<void>

export type AuthMethod<T extends SchemaItem, User> = {
  title?: string,
  fields: T,
  // Resolves the submitted credentials to a bearer token, or null when they are invalid.
  onLogin: (data: SchemaType<T>) => { token: string } | null | Promise<{ token: string } | null>,
  // Resolves a bearer token to the authenticated user, or null → 401.
  onRequest: (token: string) => User | null | Promise<User | null>
}

// Non-generic view of an AuthMethod used inside the plugin. The public generic
// form is only needed at the `registerAuthMethod` boundary — instantiating
// `SchemaType<any>` in the route builders blows up TypeScript's depth limit.
export type AuthMethodInternal<User> = {
  title?: string,
  fields: SchemaItem,
  onLogin: (data: any) => { token: string } | null | Promise<{ token: string } | null>,
  onRequest: (token: string) => User | null | Promise<User | null>
}

// Passed as the last argument to every page handler so implementations can read
// the authenticated user (authorization, audit logging, per-user scoping).
export type RequestContext<User = unknown> = { user: User }

// The list request shape handed to `.data()`. `sort`/`search`/`filter` are
// optional and only present when the frontend sends them. `filter` is the
// validated, decoded object described by the page's `.filters()` schema (dates
// arrive as `Date`); absent keys mean "not filtered".
//
// `cursor` is the primary key of the last row of the previous page. It is only
// sent for pages *without* a `.count()` — there the UI paginates by keyset
// (next/prev) instead of by page number, so the handler should return rows
// strictly after `cursor` in the current sort order (and ignore `skip`).
export type ListOptions<KeyType = any> = {
  take?: number,
  skip?: number,
  cursor?: KeyType,
  sort?: { field: string, dir: "asc" | "desc" },
  search?: string,
  filter?: Record<string, any>
}

// A single select option returned by a reference method. `color` tints the
// value's chip/badge in the UI — a palette name ("red", "green", "blue",
// "yellow", "orange", "purple", "gray") or any raw CSS color.
export type SelectOption = { value: any, label: string, color?: string }

// The query a reference method receives. Exactly one of the fields is set:
//   `search` — the user's current search text (filter the option list);
//   `value`  — resolve the label of one already-selected value;
//   `values` — batch form of `value`: resolve labels for several selected
//              values in one call. Sent by relation-list fields when an edit
//              form opens, so N picked ids cost one request, not N. Return an
//              option per id you recognize (order doesn't matter); ids you
//              don't return fall back to per-`value` lookups client-side, so a
//              handler that ignores `values` still works — just less
//              efficiently.
export type ReferenceQuery = { search?: string, value?: string, values?: string[] }

// An async options source for a select field, declared inline in a form schema
// as `{ type, reference: async (query, ctx) => SelectOption[] }`. It is pulled
// out of the schema at registration time (see extractReferenceMethods), stored
// server-side, and exposed at `${apiBase}/select/:refId`; the serialized schema
// carries only a `{ method: refId }` descriptor, so it stays plain JSON.
export type ReferenceMethod<User = unknown> =
  (query: ReferenceQuery, ctx: RequestContext<User>) => SelectOption[] | Promise<SelectOption[]>

// A foreign-key reference source for a select field, as written in a form/filter
// schema: an async resolver, or a declarative pointer at another page's list.
export type SelectReference =
  | ReferenceMethod<any>
  | { page: string, label: string, value?: string }

// compact-json-schema exposes `SchemaAnnotations` — the set of keywords allowed
// on any typed schema object without changing its inferred type — and invites
// consumers to extend it by declaration merging. We register the keywords the
// panel's form/filter/action inputs read, so `{ type: "string", label,
// options }` and friends type-check inline (no `as const` or generic-inference
// dance needed). Purely a type-level change — `unfoldSchema` already passes
// these through at runtime.
declare module "compact-json-schema" {
  interface SchemaAnnotations {
    // Human-readable field label shown by the panel inputs (falls back to the key).
    label?: string
    // Static select options.
    options?: SelectOption[]
    // Async / cross-page select source (see SelectReference).
    reference?: SelectReference
    // Renderer hints: `format: "file" | "date" | "datetime"`, multiline text.
    format?: string
    multiline?: boolean
    // On an array field whose values come from `options`/`reference` (a
    // relation list): let the user reorder the list by dragging. Off by
    // default — the list keeps insertion order. Either way the submitted
    // array carries the visible order; persisting it is the host's concern.
    sortable?: boolean
    // On an array field with a select source: which multi-value input renders
    // it. "chips" — a compact box of removable chips (the default for a static
    // options/enum source — the tags case); "list" — one row per value (the
    // default when the source is a reference). `sortable: true` always renders
    // the list, since chips can't be reordered.
    view?: "chips" | "list"
    // Display metadata over an `enum`, keyed by the enum value so entries can't
    // drift when the enum is reordered (and partial coverage is fine — missing
    // values fall back to the raw value / neutral color). `enumLabels` maps
    // value → shown name; `enumColors` maps value → chip/badge color (palette
    // name or raw CSS color) and is shaped exactly like a badge table column's
    // `colors`, so one shared constant serves both. Sugar over `options`, for
    // when the enum should stay the single source of truth.
    enumLabels?: Record<string | number, string>
    enumColors?: Record<string | number, string>
    // Path to a .vue file rendering this field instead of the built-in input
    // (compiled and served like page components). Paired with a real type it is
    // a custom input (the value validates and submits as that type); with
    // `type: "component"` it is display-only — see extractFormComponents.
    component?: string
  }
  // Registers `"component"` as a valid schema type: a display-only form block
  // rendered by a custom Vue component. It is stripped from request validation
  // (no value is submitted), hence the `unknown` mapping.
  interface SchemaTypesMap {
    component: unknown
  }
}

// The serializable form of a declared action, as delivered to the frontend in
// `PageMeta.actions`. The handler stays server-side; only its descriptor travels.
export type ActionMeta = {
  name: string,
  title: string,
  icon?: string,
  // When present, the UI opens a form dialog (built from this schema) before
  // invoking the action; otherwise the action runs immediately (or after a
  // plain confirm, if `confirm` is set).
  form?: { schema: SchemaItem },
  confirm?: string,
  danger?: boolean,
  // "row" (per-row, receives the row id), "toolbar" (page-level, no target),
  // or "bulk" (operates on the current checkbox selection).
  kind: "row" | "toolbar" | "bulk",
}

// The `${apiBase}/pages/:path` response — the single source of truth for a
// page's metadata shape. The frontend's `FullPage` mirrors this (the two
// packages can't share a type until this one is published).
export type PageMeta = {
  title?: string,
  path?: string,
  table?: ColumnId<any, any>[],
  component?: string,
  primaryKey?: PropertyKey,
  createForm?: { schema: SchemaItem },
  updateForm?: { schema: SchemaItem },
  itemAccess: boolean,
  allowDelete?: true,
  // True when the page opted in via `createPage({ search: true })` — only then
  // does the UI show a search box (the panel can't know if `.data` honors search).
  search?: true,
  // True when the page declared a `.count()` resolver. Drives the pagination
  // mode: numbered (with a total) when set, keyset next/prev when not.
  hasCount?: true,
  actions?: ActionMeta[],
  // The form schema for the page's filter bar, declared via `.filters()`.
  filters?: { schema: SchemaItem },
}

// The value a `stat` widget's data resolver returns.
export type StatValue = { value: string | number, label?: string, delta?: number }

// A dashboard widget's serializable descriptor (sent to the frontend). The data
// resolver stays server-side; its result is fetched from `${apiBase}/dashboard/:i/data`.
export type DashboardWidgetMeta = {
  type: "stat" | "component",
  title?: string,
  icon?: string,
  // Grid columns to span (1–4); default 1.
  span?: number,
  // Page path a `stat` widget links to on click.
  link?: string,
  // Custom-component key a `component` widget renders (served from /custom/:name).
  component?: string,
  // Whether the widget has a server-side data resolver to fetch.
  hasData: boolean,
}

// A built-in stat card: a big number with an optional label, trend, icon, and link.
export type StatWidget<User = unknown> = {
  type: "stat",
  title: string,
  icon?: string,
  span?: number,
  link?: string,
  data: (ctx: RequestContext<User>) => StatValue | Promise<StatValue>,
}

// A custom Vue widget: a `.vue` file (compiled and served like a page component)
// that receives the resolved `data` as its `data` prop.
export type ComponentWidget<User = unknown> = {
  type: "component",
  title?: string,
  span?: number,
  component: string,
  data?: (ctx: RequestContext<User>) => any | Promise<any>,
}

export type DashboardWidget<User = unknown> = StatWidget<User> | ComponentWidget<User>

export type AdminPanel<User = unknown> = {
  createPage<T extends object>(options: CreatePageOptions<User>): PageWithPrimaryKey<T, string, T, User>,
  register<T extends any[]>(func: AdminPanelPlugin<T>, ...options: T): void
  registerAuthMethod<T extends SchemaItem>(method: AuthMethod<T, User>): void
  // Configure the home dashboard from a list of widgets (built-in stats and/or
  // custom Vue components). Replaces the default empty home page.
  dashboard(widgets: DashboardWidget<User>[]): void
}

export type AdminPanelDynara<User = unknown> = ((app: Router<any>) => Promise<void>) & AdminPanel<User>

export type Ctx = RequestContext<any>

// Internal storage for a dashboard widget: its descriptor plus the server-side
// data resolver. For component widgets, `component` holds the registered key.
export type DashboardWidgetEntry = {
  type: "stat" | "component",
  title?: string,
  icon?: string,
  span?: number,
  link?: string,
  component?: string,
  data?: (ctx: Ctx) => any,
}

// Internal storage for a declared action: its serializable descriptor plus the
// server-side handler and the (already-unfolded) form schema.
export type ActionEntry = {
  name: string,
  title: string,
  icon?: string,
  confirm?: string,
  danger?: boolean,
  kind: "row" | "toolbar" | "bulk",
  schema?: SchemaItem,
  // The schema the route validates the body against: `schema` minus any
  // display-only component fields (identical when there are none).
  bodySchema?: SchemaItem,
  handler: (...args: any[]) => any,
}

export type PageEntry = {
  title?: string,
  path?: string,
  group?: string,
  icon?: string,
  search?: boolean,
  access?: NormalizedAccess,
  actions: ActionEntry[],
  // The filter form schema (unfolded JSON, serialized to the frontend) and its
  // TypeBox validator (used to validate/decode the JSON-encoded `filter` param).
  filters?: any,
  filtersCheck?: any,
  table?: ColumnId<any, any>[],
  data?: (options: ListOptions, ctx: Ctx) => any[] | Promise<any[]>,
  // Optional unpaginated row count for the current filter/search. When present
  // the UI shows a total and numbered pagination; when absent it falls back to
  // keyset (next/prev) pagination via `ListOptions.cursor`.
  count?: (options: ListOptions, ctx: Ctx) => number | Promise<number>,
  itemData?: (id: any, ctx: Ctx) => Promise<any>,
  onInsert?: (obj: any, ctx: Ctx) => Promise<void>,
  onUpdate?: (key: any, obj: any, ctx: Ctx) => Promise<void>,
  onDelete?: (keys: any[], ctx: Ctx) => Promise<void>,
  createForm?: { schema: SchemaItem },
  updateForm?: { schema: SchemaItem },
  // What the create/update routes validate against: the form schema minus any
  // display-only component fields (same reference when there are none).
  createBodySchema?: SchemaItem,
  updateBodySchema?: SchemaItem,
  primaryKey?: PropertyKey,
  primaryKeyType?: SchemaItem,
  component?: string,
  componentData: { name: string, schema?: SchemaItem, method: (args: any, ctx: Ctx) => any }[],
  componentActions: { name: string, schema?: SchemaItem, method: (...args: any[]) => any }[],
  upload?: (file: File, ctx: Ctx & { field?: string }) => string | Promise<string>
}

// The shared state behind one panel instance. Built by createAdminPanel, filled
// during configuration (createPage / registerAuthMethod / dashboard), and read
// by the route installers when the plugin runs.
export type PanelState = {
  // Everything the panel serves derives from these — the UI base and the API
  // base are the only two prefixes that used to be hardcoded across the app.
  uiBase: string          // e.g. "/admin"
  apiBase: string         // e.g. "/api/admin"
  title: string
  locale: string
  isProduction: boolean
  pages: PageEntry[]
  dashboardWidgets: DashboardWidgetEntry[]
  // .vue files registered for compile-and-serve (page components, dashboard
  // widgets, custom form components), keyed by the name used in /custom/:name.
  componentFiles: Map<string, string>
  // Reference methods extracted from form schemas (see extractReferenceMethods),
  // keyed by a page-qualified id and served from `${apiBase}/select/:refId`.
  referenceMethods: Map<string, ReferenceMethod<any>>
  authMethod: AuthMethodInternal<any> | null
}

export type CreateAdminPanelOptions = {
  // Where the panel UI is mounted. The API is served under "/api" + basePath.
  // Default "/admin" (→ API under "/api/admin").
  basePath?: string
  // Shown in the sidebar / document title.
  title?: string
  // UI language. Default "en".
  locale?: "en" | "ru"
}

export type CreatePageOptions<User = unknown> = {
  title?: string
  path?: string
  // Sidebar section this page is listed under. Pages without a group are
  // listed first, ungrouped, in registration order.
  group?: string
  // Icon name (from the built-in icon set) shown next to the sidebar link.
  icon?: string
  // Opt in to the list search box. The panel can't tell whether a page's
  // `.data` honors the `search` option, so it only renders the input when this
  // is set. The `.data` handler is responsible for actually filtering.
  search?: boolean
  // Per-user access policy. A predicate gates the whole page; the granular
  // `{ read, write, delete }` form gates each facet. The panel hides pages /
  // affordances the user can't reach and rejects the matching routes with 403.
  access?: PageAccess<User>
}

// Shared descriptor for a declared action, minus the target-specific handler.
// `form` is a plain `SchemaItem` (not a generic) — the many action overloads
// would otherwise instantiate `SchemaType<S>` deeply enough to blow TypeScript's
// recursion limit, the same reason the route builders avoid it. The handler's
// `data` argument is therefore typed loosely; validate it via the schema.
export type ActionConfigBase = {
  // Button label (and dialog title when a form is shown).
  title: string
  // Icon name from the built-in set, shown on the action button.
  icon?: string
  // Opens a form dialog built from this schema before running; the validated
  // body is passed to the handler as `data`.
  form?: SchemaItem
  // Plain-text confirmation shown before running (ignored when `form` is set —
  // the form dialog is itself the confirmation step).
  confirm?: string
  // Style the action as destructive (red).
  danger?: boolean
}

export type RowActionConfig = ActionConfigBase & { placement?: "row", bulk?: false }
export type ToolbarActionConfig = ActionConfigBase & { placement: "toolbar", bulk?: false }
export type BulkActionConfig = ActionConfigBase & { bulk: true }

export interface ColumnBase {
  title: string
  width?: number | `${number}fr`
}

// A cell renderer hint for a field column. Omitted → the raw value as text.
//   boolean → ✓ / ✗   | date → localized date (`format: "datetime"` adds time)
//   badge   → colored pill (`colors` maps value → color name/hex)
//   image   → thumbnail (value is the src) | money → `currency`-formatted number
export type ColumnType = "text" | "boolean" | "date" | "badge" | "image" | "money"

export type FieldColumn<T> = ColumnBase & {
  field: keyof T
  sortable?: boolean
  type?: ColumnType
  format?: "date" | "datetime"
  currency?: string
  colors?: Record<string, string>
}

export type TemplateColumn<T> = ColumnBase & {
  template: string
}

export type ActionColumn<T, KeyType> = ColumnBase & {
  icon?: string,
  text?: string,
  onClick: (itemId: KeyType) => Promise<void> | void
}

export type Column<T> = FieldColumn<T> | TemplateColumn<T>
export type ColumnId<T, KeyType> = Column<T> | ActionColumn<T, KeyType>

export interface Page<T extends object, User = unknown> {
  table(table: Column<T>[]): this,
  createForm<S extends SchemaItem>(schema: S, onInsert: (data: SchemaType<S>, ctx: RequestContext<User>) => Promise<void>): this,
  primaryKey<KeyType extends SchemaItem = "string">(key: keyof T, type?: KeyType): PageWithPrimaryKey<T, SchemaType<KeyType>, T, User>,
  // The list resolver: returns the current page of rows as a plain array. The
  // unpaginated total is a separate concern — declare `.count()` for it. When no
  // `.count()` is set, the UI paginates by keyset and `ListOptions.cursor` (the
  // previous page's last primary key) arrives here instead of `skip`.
  data<T2 extends object>(query: (options: ListOptions, ctx: RequestContext<User>) => T2[] | Promise<T2[]>): Page<T2, User>,
  // Optional: the unpaginated row count for the given filter/search (pagination
  // fields are irrelevant). Declaring it switches the UI to numbered pagination
  // with a total; without it the UI uses keyset next/prev. Kept separate from
  // `.data()` so the (often expensive) count isn't recomputed on every page flip.
  count(query: (options: ListOptions, ctx: RequestContext<User>) => number | Promise<number>): this,
  component(url: any): this
  componentData(name: string, data: (args: Record<string,any>, ctx: RequestContext<User>) => Promise<any> | any): this
  componentData<S extends SchemaItem>(name: string, schema: S, data: (args: SchemaType<S>, ctx: RequestContext<User>) => Promise<any> | any): this
  componentAction(name: string, handler: (ctx: RequestContext<User>) => Promise<any> | any): this
  componentAction<S extends SchemaItem>(name: string, schema: S, handler: (data: SchemaType<S>, ctx: RequestContext<User>) => Promise<any> | any): this
  // Handle file uploads for `{ format: "file" }` form fields. Store the file and
  // return the URL/id that becomes the field value. `ctx.field` is the field name.
  upload(handler: (file: File, ctx: RequestContext<User> & { field?: string }) => string | Promise<string>): this
  // Declare the page's filter bar. Uses the same compact-json-schema format as
  // forms (selects via `options`/`reference`, booleans, dates, …); every field
  // should be optional, since a filter only applies when set. The submitted,
  // validated values arrive on the `.data()` list options as `filter`. Inline
  // `options`/`label`/`reference` type-check thanks to the SchemaAnnotations
  // augmentation above.
  filters(schema: SchemaItem): this
  // Toolbar (page-level) action — rendered as a button above the table, receives
  // no target row. With a `form`, the handler also receives the collected `data`
  // as its first argument. Its return value's `message`, if any, is shown as a toast.
  action(name: string, config: ToolbarActionConfig, handler: (data: any, ctx: RequestContext<User>) => any): this
}

export interface PageWithPrimaryKey<T extends object, KeyType, Item extends object, User = unknown> extends Page<T, User> {
  table(table: ColumnId<T, KeyType>[]): this,
  item<T2 extends object>(query: (itemId: KeyType, ctx: RequestContext<User>) => Promise<T2 | null>): PageWithPrimaryKey<T, KeyType, T2, User>,
  updateForm<S extends SchemaItem>(schema: S, onUpdate: (id: KeyType, data: SchemaType<S>, ctx: RequestContext<User>) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item, User>,
  onDelete(onDelete: (ids: KeyType[], ctx: RequestContext<User>) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item, User>
  // Row action — rendered per row (hover buttons + the edit dialog footer),
  // receives that row's primary key. With `form`, a dialog collects `data`
  // first (passed as the second argument). The handler's returned `message`,
  // if any, is shown as a toast.
  action(name: string, config: RowActionConfig, handler: (id: KeyType, data: any, ctx: RequestContext<User>) => any): this
  // Bulk action — rendered next to Delete when rows are checked, receives the
  // selected primary keys (and collected `data` when a `form` is set).
  action(name: string, config: BulkActionConfig, handler: (ids: KeyType[], data: any, ctx: RequestContext<User>) => any): this
  // Toolbar action (inherited shape from Page, restated so this interface's
  // `action` remains assignable to the base).
  action(name: string, config: ToolbarActionConfig, handler: (data: any, ctx: RequestContext<User>) => any): this
}

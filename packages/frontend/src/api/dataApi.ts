import { request, apiUrl } from "./request";
import type { TableColumn } from '../components/VTable.vue'

type Page = {
  title: string,
  path: string,
  group?: string,
  icon?: string,
}

// A declared action's serializable descriptor (mirror of the backend `ActionMeta`).
export type ActionMeta = {
  name: string,
  title: string,
  icon?: string,
  form?: { schema: any },
  confirm?: string,
  danger?: boolean,
  kind: "row" | "toolbar" | "bulk",
}

// Mirror of the backend `PageMeta` type (the `/pages/:path` response). Keep the
// two in sync — they can't share a type until the backend package is published.
export type FullPage = Page & {
  primaryKey: string,
  table: TableColumn<any>[]
  createForm: { schema: any }
  updateForm: { schema: any }
  component?: string,
  itemAccess: boolean,
  allowDelete?: boolean,
  search?: boolean,
  // True when the page declared a `.count()`: numbered pagination with a total.
  // When false the list paginates by keyset (next/prev via `cursor`).
  hasCount?: boolean,
  actions?: ActionMeta[],
  filters?: { schema: any },
}

export type ListParams = {
  take?: number,
  skip?: number,
  // Keyset cursor: the previous page's last primary key (no-count pages only).
  cursor?: any,
  sort?: { field: string, dir: "asc" | "desc" },
  search?: string,
  // Filter values keyed by field; JSON-encoded into the `filter` query param.
  filter?: Record<string, any>,
}

export type ListResult<T = any> = { items: T[] }

const buildListQuery = (params: ListParams) => {
  const qs = new URLSearchParams()
  if (params.take != null) qs.set("take", String(params.take))
  if (params.skip != null) qs.set("skip", String(params.skip))
  if (params.cursor != null) qs.set("cursor", String(params.cursor))
  if (params.sort) {
    qs.set("sortField", params.sort.field)
    qs.set("sortDir", params.sort.dir)
  }
  if (params.search) qs.set("search", params.search)
  if (params.filter && Object.keys(params.filter).length) qs.set("filter", JSON.stringify(params.filter))
  const q = qs.toString()
  return q ? `?${q}` : ""
}

// The count endpoint only varies with search/filter, so its cache key omits
// pagination — the total isn't refetched when you flip pages.
export type CountParams = Pick<ListParams, "search" | "filter">
const buildCountQuery = (params: CountParams) =>
  buildListQuery({ search: params.search, filter: params.filter })

export const dataApi = {
  getPages: () => request<Page[]>(apiUrl("/pages")),
  getPageData: (pageId: string) => request<FullPage>(apiUrl(`/pages/${pageId}`)),
  getData: (pageId: string, params: ListParams = {}) =>
    request<ListResult>(apiUrl(`/data/${pageId}/items${buildListQuery(params)}`)),
  // The unpaginated total for pages that declared `.count()`. Keyed on
  // search/filter only, so paging doesn't retrigger it.
  getCount: (pageId: string, params: CountParams = {}) =>
    request<{ total: number }>(apiUrl(`/data/${pageId}/count${buildCountQuery(params)}`)),
  getItemData: (pageId: string, itemId: number) => request(apiUrl(`/data/${pageId}/items/${itemId}`)),

  // Options for a select field backed by an inline `reference` method. `search`
  // filters the list; `value` (search omitted) resolves the label of an already
  // selected value. The method is page-qualified, so no page id is needed here.
  getReferenceOptions: (refId: string, params: { search?: string, value?: any } = {}) => {
    const qs = new URLSearchParams()
    if (params.search) qs.set("search", params.search)
    if (params.value != null) qs.set("value", String(params.value))
    const q = qs.toString()
    return request<ListResult<{ value: any, label: string }>>(apiUrl(`/select/${refId}${q ? `?${q}` : ""}`))
  },

  createItem: (pageId: string, values: any) => request(apiUrl(`/data/${pageId}/items`), values),
  updateItem: (pageId: string, itemId: any, values: any) => request(apiUrl(`/data/${pageId}/items/${itemId}`), values),
  deleteItems: (pageId: string, itemIds: any) => request(apiUrl(`/data/${pageId}/items`), { itemIds }, { method: "DELETE" }),

  // Invoke a declared action. Target goes in the query (itemId for a row action,
  // comma-separated itemIds for a bulk action, neither for a toolbar action);
  // the optional form `data` is the JSON body. The handler's return value is
  // passed back (e.g. `{ message }` for a toast).
  runAction: (pageId: string, name: string, opts: { itemId?: any, itemIds?: any[], data?: any } = {}) => {
    const qs = new URLSearchParams()
    if (opts.itemId != null) qs.set("itemId", String(opts.itemId))
    if (opts.itemIds && opts.itemIds.length) qs.set("itemIds", opts.itemIds.map(String).join(","))
    const q = qs.toString()
    return request<{ message?: string } | null>(
      apiUrl(`/data/${pageId}/actions/${name}${q ? `?${q}` : ""}`),
      opts.data,
      { method: "POST" }
    )
  },
}

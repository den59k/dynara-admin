import { request } from "./request";
import type { TableColumn } from '../components/VTable.vue'

type Page = {
  title: string,
  path: string,
}

export type FullPage = Page & {
  primaryKey: string,
  table: TableColumn<any>[]
  createForm: { schema: any }
  updateForm: { schema: any }
  component?: string,
  itemAccess: boolean,
  allowDelete?: boolean
}

export type ListParams = {
  take?: number,
  skip?: number,
  sort?: { field: string, dir: "asc" | "desc" },
  search?: string,
}

export type ListResult<T = any> = { items: T[], total: number }

const buildListQuery = (params: ListParams) => {
  const qs = new URLSearchParams()
  if (params.take != null) qs.set("take", String(params.take))
  if (params.skip != null) qs.set("skip", String(params.skip))
  if (params.sort) {
    qs.set("sortField", params.sort.field)
    qs.set("sortDir", params.sort.dir)
  }
  if (params.search) qs.set("search", params.search)
  const q = qs.toString()
  return q ? `?${q}` : ""
}

export const dataApi = {
  getPages: () => request<Page[]>("/api/admin/pages"),
  getPageData: (pageId: string) => request<FullPage>(`/api/admin/pages/${pageId}`),
  getData: (pageId: string, params: ListParams = {}) =>
    request<ListResult>(`/api/admin/data/${pageId}/items${buildListQuery(params)}`),
  getItemData: (pageId: string, itemId: number) => request(`/api/admin/data/${pageId}/items/${itemId}`),

  createItem: (pageId: string, values: any) => request(`/api/admin/data/${pageId}/items`, values),
  updateItem: (pageId: string, itemId: any, values: any) => request(`/api/admin/data/${pageId}/items/${itemId}`, values),
  deleteItems: (pageId: string, itemIds: any) => request(`/api/admin/data/${pageId}/items`, { itemIds }, { method: "DELETE" })
}

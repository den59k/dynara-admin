import { request } from "./request";

type Page = {
  title: string,
  path: string
}

export const dataApi = {
  getPages: () => request<Page[]>("/api/admin/pages"),
  getPageData: (pageId: string) => request(`/api/admin/pages/${pageId}`),
  getData: (pageId: string) => request(`/api/admin/data/${pageId}`),
  saveItem: (pageId: string, values: any) => request(`/api/admin/data/${pageId}`, values)
}
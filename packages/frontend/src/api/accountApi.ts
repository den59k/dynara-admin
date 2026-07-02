import { request } from "./request";

export const accountApi = {
  getAuthData: () => request("/api/admin/auth"),
  login: (values: any) => request<{ token: string }>("/api/admin/auth", values)
}
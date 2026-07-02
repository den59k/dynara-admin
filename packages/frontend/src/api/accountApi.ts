import { request, apiUrl } from "./request";

export const accountApi = {
  getAuthData: () => request(apiUrl("/auth")),
  login: (values: any) => request<{ token: string }>(apiUrl("/auth"), values)
}
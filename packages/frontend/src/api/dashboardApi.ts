import { request, apiUrl } from "./request"

// Mirror of the backend `DashboardWidgetMeta`.
export type DashboardWidget = {
  type: "stat" | "component",
  title?: string,
  icon?: string,
  span?: number,
  link?: string,
  component?: string,
  hasData: boolean,
}

// The shape a `stat` widget's data endpoint returns.
export type StatValue = { value: string | number, label?: string, delta?: number }

export const dashboardApi = {
  getWidgets: () => request<DashboardWidget[]>(apiUrl("/dashboard")),
  getWidgetData: (index: number) => request<any>(apiUrl(`/dashboard/${index}/data`)),
}

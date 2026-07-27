// The route id used for the home ("/") page. Mirrors the backend's HOME_PATH
// sentinel — the page whose configured path is "" / "/" is served under this id.
export const HOME_VIEW_ID = "__home__"

// The panel's name, from `createAdminPanel({ title })` — injected by the
// backend alongside the other runtime config. It names the sidebar, the home
// page and the browser tab, so it is read once here rather than in each.
export const PANEL_TITLE: string = (window as any).__DYNARA_TITLE__ || "Dynara Admin"

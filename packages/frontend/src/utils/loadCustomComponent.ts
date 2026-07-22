import { UI_BASE } from '../api/request'

// Dynamically imports a server-compiled custom Vue component (page components,
// dashboard widgets, custom form fields — all served from
// `${UI_BASE}/custom/:key`). The auth token travels as a query param because a
// dynamic `import()` cannot carry an Authorization header.
export const loadCustomComponent = async (name: string) => {
  const jwt = window.localStorage.getItem("dynara-admin__token")
  const suffix = jwt ? `?token=${encodeURIComponent(jwt)}` : ''
  const { default: component } = await import(/* @vite-ignore */ `${UI_BASE}/custom/${name}${suffix}`)
  return component
}

// Custom .vue components (page components, dashboard widgets, custom form
// fields): on-demand compilation to browser ESM and the /custom/:name route
// that serves them.

import type { BunRequest } from "bun"
import { HTTPError } from "dynara"
import { authenticate } from "./auth.ts"
import type { PanelState } from "./types.ts"

export const installComponentRoute = (state: PanelState, routesRaw: Record<string, any>) => {
  const compiled = new Map<string, string>()   // кэш только для prod

  routesRaw[`${state.uiBase}/custom/:name`] = {
    GET: async (req: BunRequest) => {
      // This route is registered on the raw Bun router, so the dynara onRequest
      // hook never runs — authenticate explicitly when a method is configured.
      if (state.authMethod) {
        try {
          await authenticate(state, req)
        } catch (e) {
          if (e instanceof HTTPError) return new Response(e.message, { status: e.statusCode })
          throw e
        }
      }

      const file = state.componentFiles.get(req.params.name)
      if (!file) return new Response("Not found", { status: 404 })

      let code = state.isProduction ? compiled.get(file) : undefined
      if (!code) {
        code = await compileComponent(file, state.isProduction)
        if (state.isProduction) compiled.set(file, code)
      }
      return new Response(code, {
        headers: {
          "Content-Type": "text/javascript",
          "Cache-Control": state.isProduction ? "public, max-age=31536000, immutable" : "no-cache",
        },
      })
    }
  }
}

const compileComponent = async (file: string, isProduction: boolean) => {

  const { VuePlugin } = await import("../../plugins/vue-plugin")

  const res = await Bun.build({
    entrypoints: [file],
    external: ["vue", "vue-router", "dynara-admin/ui"],
    target: "browser",
    format: "esm",
    minify: isProduction,
    define: { "process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development") },
    plugins: [VuePlugin({ inlineStyles: true })],
  })
  if (!res.success) throw new Error(res.logs.join("\n"))
  return await res.outputs[0].text()
}

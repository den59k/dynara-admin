import { defineConfig, type Plugin } from "vitest/config"
import vue from "@vitejs/plugin-vue"

// The real `?svg-glob` import is handled by a Bun build plugin (svg-plugin.ts);
// under vitest we stub it so icon components load without inlining the SVGs.
const svgGlobStub = (): Plugin => ({
  name: "svg-glob-stub",
  resolveId(id) {
    if (id.endsWith("?svg-glob")) return "\0svg-glob-stub"
  },
  load(id) {
    if (id === "\0svg-glob-stub") return "export const contents = {}; export const attrs = {}"
  },
})

// Component/SFC tests run under vitest (Vue plugin + happy-dom). They use the
// `.vitest.ts` suffix so the repo's root `bun test` (which globs *.test.ts /
// *.spec.ts) does not try to run them.
export default defineConfig({
  plugins: [vue(), svgGlobStub()],
  test: {
    include: ["test/**/*.vitest.ts"],
    environment: "happy-dom",
  },
})

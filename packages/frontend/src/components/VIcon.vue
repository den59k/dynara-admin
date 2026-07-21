<script lang="ts">
// @ts-ignore
import { h, type HTMLAttributes } from 'vue';
// @ts-ignore
import { contents, attrs } from '../assets/icons?svg-glob'

// Icons come from two places:
//
//  - built-in — the set this UI renders itself (close, check, chevrons…),
//    globbed from src/assets/icons at build time and inlined into the bundle.
//  - runtime  — icons named in the host app's server-side config (page, action,
//    widget and table-column icons). The backend resolves those against the
//    embedded Tabler pack and inlines just the referenced ones into index.html
//    as `window.__DYNARA_ICONS__`, so the payload tracks the config rather than
//    the size of the pack.
//
// Both sets are Tabler artwork, so they render as one visual system.
type RuntimeIcons = {
  defaults: Record<string, string>,
  icons: Record<string, string>,
  overrides?: Record<string, Record<string, string>>,
}

const runtime: RuntimeIcons = (window as any).__DYNARA_ICONS__ ?? { defaults: {}, icons: {} }

// Both maps are empty under the component-test stub (vitest.config.ts replaces
// the ?svg-glob plugin), where warning for every icon in the tree is pure noise.
const hasIcons = Object.keys(contents).length > 0 || Object.keys(runtime.icons).length > 0

const warned = new Set<string>()

export default (props: { icon: string } & HTMLAttributes) => {
  const body = contents[props.icon] ?? runtime.icons[props.icon]

  if (body === undefined) {
    // An unresolved name renders as nothing rather than an invisible sized box.
    // The backend already fails on unknown names in its own config; this catches
    // icons referenced from custom components, which it never sees.
    if (hasIcons && !warned.has(props.icon)) {
      warned.add(props.icon)
      console.warn(`[dynara-admin] unknown icon "${props.icon}"`)
    }
    return h("svg")
  }

  const iconAttrs = attrs[props.icon] ?? runtime.overrides?.[props.icon] ?? runtime.defaults
  return h("svg", { ...iconAttrs, innerHTML: body })
}
</script>

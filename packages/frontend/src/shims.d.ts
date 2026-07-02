// Ambient declarations for non-code assets imported for their side effects
// (styles) or via build-plugin query suffixes. These have no type information,
// so we declare them as empty modules to keep `vue-tsc` type-checking clean.

declare module "*.css" {}
declare module "*.sass" {}
declare module "*.scss" {}

// SVG glob handled by the build's svg-plugin (imported as `...?svg-glob`).
declare module "*?svg-glob" {
  export const contents: Record<string, string>
  export const attrs: Record<string, Record<string, string>>
}

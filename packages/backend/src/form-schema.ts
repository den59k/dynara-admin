// Form-schema processing: everything that happens to an unfolded form schema
// between page registration and the wire — extracting inline reference methods
// and custom field components into server-side registries, stripping
// display-only fields from validation, and validating filter query params.

import { HTTPError } from "dynara"
import { FormatRegistry } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"
import type { ReferenceMethod } from "./types.ts"

// TypeBox rejects a string carrying a format it doesn't know, so the `file`
// format the panel's upload fields use must be registered (into the same
// registry dynara's validator reads — typebox is a shared peer). The value of a
// file field is whatever URL/id the page's upload handler returned — an opaque
// string — so the checker is permissive. Guarded so a host app's own
// registration wins.
//
// Date fields use dynara's native `date` type (declared as `"date"`), which
// validates and decodes to a JS Date on its own — no format registration here.
if (!FormatRegistry.Has("file")) {
  FormatRegistry.Set("file", () => true)
}

const sanitizeRefId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, "_")

// Walks an unfolded form schema and pulls out inline reference methods
// (`reference: async (query, ctx) => ...`). Each is registered under a
// page-qualified id and replaced in the schema with a serializable
// `{ method: id }` descriptor, so the schema handed to the frontend stays
// plain JSON. Recurses into object properties and array items.
export const extractReferenceMethods = (node: any, idPath: string, into: Map<string, ReferenceMethod<any>>) => {
  if (!node || typeof node !== "object") return
  if (typeof node.reference === "function") {
    const id = sanitizeRefId(idPath)
    into.set(id, node.reference)
    node.reference = { method: id }
  }
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      extractReferenceMethods(child, `${idPath}.${key}`, into)
    }
  }
  if (node.items) extractReferenceMethods(node.items, `${idPath}.items`, into)
}

// Walks an unfolded form schema and registers custom field components
// (`component: "<path to .vue>"`) into the same compile-and-serve pipeline as
// page components and dashboard widgets. The file path is replaced with the
// served key, so the schema handed to the frontend stays plain JSON and never
// leaks a server path. Recurses into object properties and array items.
export const extractFormComponents = (node: any, idPath: string, into: Map<string, string>) => {
  if (!node || typeof node !== "object") return
  if (typeof node.component === "string") {
    const key = sanitizeRefId(idPath)
    into.set(key, node.component)
    node.component = key
  }
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      extractFormComponents(child, `${idPath}.${key}`, into)
    }
  }
  if (node.items) extractFormComponents(node.items, `${idPath}.items`, into)
}

// Returns a validation-safe copy of an unfolded form schema. Display-only
// component fields (`type: "component"`) carry no submitted value, so they are
// removed from `properties`/`required` before the schema reaches dynara —
// whose TypeBox conversion has no factory for that type. Custom-input fields
// (a real type plus a `component` annotation) are kept and validate as their
// type. Returns the input unchanged when there is nothing to strip, so the
// common no-component case shares the serialized UI schema.
export const stripComponentFields = (node: any): any => {
  if (!node || typeof node !== "object") return node
  let changed = false
  const out: any = { ...node }
  if (node.properties) {
    const properties: Record<string, any> = {}
    for (const [key, child] of Object.entries<any>(node.properties)) {
      if (child?.type === "component") { changed = true; continue }
      const stripped = stripComponentFields(child)
      if (stripped !== child) changed = true
      properties[key] = stripped
    }
    out.properties = properties
    if (Array.isArray(node.required)) {
      out.required = node.required.filter((key: string) => key in properties)
    }
  }
  if (node.items) {
    const items = stripComponentFields(node.items)
    if (items !== node.items) { changed = true; out.items = items }
  }
  return changed ? out : node
}

// Parses, validates and decodes the JSON-encoded `filter` query param against a
// page's TypeBox filter schema — the same validation engine dynara uses for
// request bodies, so `date` fields decode to `Date`, unknown keys are dropped,
// and type mismatches are rejected. Returns undefined when there's no filter,
// no schema, or nothing set; throws HTTPError(400) on malformed JSON or a value
// that violates the schema.
export const parseFilter = (raw: string | undefined, check: any): Record<string, any> | undefined => {
  if (!raw || !check) return undefined
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HTTPError("Invalid filter", 400)
  }
  if (parsed == null || typeof parsed !== "object") return undefined
  let decoded: Record<string, any>
  try {
    decoded = Value.Parse(check, parsed) as Record<string, any>
  } catch {
    throw new HTTPError("Invalid filter", 400)
  }
  // Keep only the fields that are actually set, so `filter` carries just those.
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(decoded)) {
    if (value != null && value !== "") out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

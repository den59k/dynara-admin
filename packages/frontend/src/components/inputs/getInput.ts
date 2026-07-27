import { h, type CSSProperties } from 'vue'
import VInputObject from "./VInputObject"
import VInputText from "./VInputText.vue"
import VInputNumber from "./VInputNumber.vue"
import VCheckbox from './VCheckbox.vue'
import VInputTextArea from "./VInputTextArea.vue"
import VSelectInput from "./VSelectInput.vue"
import VSelectListInput from "./VSelectListInput.vue"
import VSelectChipsInput from "./VSelectChipsInput.vue"
import VInputTable from "./VInputTable.vue"
import VFileInput from "./VFileInput.vue"
import VDateInput from "./VDateInput.vue"
import VCustomInput from "./VCustomInput"
import VFormControl from "../VFormControl.vue"

// A static option for a select field. `color` tints the value's chip/badge —
// a palette name or raw CSS color (see BADGE_COLORS in utils/formatCell).
export type SelectOption = { value: any, label: string, color?: string }

// Loads select options for a foreign-key reference. Either from another page's
// list (`page` — `label` is the field shown, `value` defaults to that page's
// primary key), or from an async method declared inline in the form schema and
// resolved server-side (`method` — served from `/select/:method`).
export type SelectReference =
  | { page: string, label: string, value?: string }
  | { method: string }

export type Schema = {
  type: string,
  label?: string,
  properties?: Record<string, Schema>,
  required?: string[],
  multiline?: boolean,
  items?: Schema,
  width?: number,
  format?: string,
  // On a `format: "file" | "image"` field: the `accept` attribute of the file
  // picker (".pdf,.doc", "image/*"). An image field defaults to "image/*".
  accept?: string,
  // `"field??"` in compact-json-schema — the field accepts an explicit null,
  // so inputs show a clear cross that resets the value to null.
  nullable?: boolean,
  enum?: (string | number)[],
  // Display metadata over `enum`, keyed by value (safe against reorder;
  // partial coverage falls back to the raw value / neutral color). Sugar over
  // `options` for schemas where the enum stays the single source of truth.
  enumLabels?: Record<string | number, string>,
  enumColors?: Record<string | number, string>,
  options?: SelectOption[],
  reference?: SelectReference,
  // On an array field — a relation list or an object-rows table: allow manual
  // reordering (drag handles). Off by default — the array then simply keeps
  // insertion order.
  sortable?: boolean,
  // On an array field with a select source: which multi-value input renders it —
  // compact removable chips or one row per value. Defaults: a static source
  // (options/enum — the tags case) gets "chips", a reference gets "list".
  // `sortable: true` always renders the list — chips have no drag affordance.
  view?: "chips" | "list",
  // Key of a server-compiled custom Vue component (served from /custom/:key)
  // rendering this field instead of the built-in input. With `type:
  // "component"` the field is display-only and never submits a value.
  component?: string
}

type JsonInputProps = {
  schema: Schema,
  modelValue?: any,
  label?: string,
  name?: string,
  placeholder?: string,
  nullable?: boolean,
  style?: CSSProperties,
  // The enclosing form object's current values — only passed to
  // custom-component fields, which may need sibling fields for display. (The
  // record's identity is not in here; it arrives via the injected form item.)
  values?: Record<string, any>,
  // This field's validation error. Typed loosely because VFormControl accepts
  // both spellings: a message string and vuesix's `{ code?, message? }`.
  error?: any,
  // The form's errors, keyed like the object's properties — consumed by
  // VInputObject, which hands each field its own. Never reaches a leaf input.
  errors?: Record<string, any>,
  "onUpdate:modelValue"?: (value: any) => void
}

export const JsonInput = (props: JsonInputProps) => {
  const { schema, errors, ...restProps } = props
  // A custom component takes over rendering entirely, whatever the type.
  if (schema.component) {
    return h(VCustomInput, { ...restProps, component: schema.component })
  }
  // Forwarded explicitly so JsonInput works with a bare leaf schema too (not
  // only via VInputObject, which spreads the child schema into the props).
  const otherProps = { nullable: schema.nullable, ...restProps }
  // An upload field. Checked before the object branch: the `file` / `image`
  // types unfold to an object schema (the value structure), and it is `format`
  // — not the type — that says this is one field, not a group of three. A
  // `{ type: "string", format }` field is the same input over a bare url.
  if (schema.format === "file" || schema.format === "image") {
    return h(VFileInput, {
      ...otherProps,
      image: schema.format === "image",
      structured: schema.type === "object",
      accept: schema.accept,
    })
  }
  if (schema.type === "object") {
    return h(VInputObject, { schema, errors, ...restProps })
  }
  // An editable table: an array of object rows. The row schema doubles as the
  // column definition — each property is a column, its label the header, its
  // input the cell editor (recursively through JsonInput, so selects, dates and
  // reference cells all work). Rows submit in visible order; `sortable` adds a
  // drag-handle column.
  if (schema.type === "array" && schema.items?.type === "object" && schema.format !== "richText") {
    return h(VInputTable, { schema, sortable: schema.sortable, ...otherProps })
  }
  // A relation/select list: an array whose values come from options, an enum or
  // a reference. The select source may sit on the array node (flat form) or on
  // `items` (each value is a reference) — both spellings are accepted.
  if (schema.type === "array") {
    const source = (schema.options || schema.reference || schema.enum) ? schema : schema.items
    if (source && (source.options || source.reference || source.enum)) {
      const sourceProps = {
        options: source.options,
        reference: source.reference,
        enum: source.enum,
        enumLabels: source.enumLabels,
        enumColors: source.enumColors,
      }
      // `view` picks the input explicitly; otherwise static sources get compact
      // chips and references the row list. A sortable array is always the list.
      const view = schema.sortable ? "list" : schema.view ?? (source.reference ? "list" : "chips")
      if (view === "chips") {
        return h(VSelectChipsInput, { ...sourceProps, ...otherProps })
      }
      return h(VSelectListInput, { ...sourceProps, sortable: schema.sortable, ...otherProps })
    }
  }
  if (schema.options || schema.reference || schema.enum) {
    return h(VSelectInput, {
      options: schema.options,
      reference: schema.reference,
      enum: schema.enum,
      enumLabels: schema.enumLabels,
      enumColors: schema.enumColors,
      ...otherProps,
    })
  }
  // dynara's native `date` type (serialized as `{ type: "date" }`). A
  // `format: "datetime"` hint selects the datetime-local variant; a plain
  // `format: "date"/"datetime"` on a string is still honored for callers not
  // yet on the native type.
  if (schema.type === "date" || schema.format === "date" || schema.format === "datetime") {
    return h(VDateInput, { datetime: schema.format === "datetime", ...otherProps })
  }
  if (schema.type === "string" && schema.multiline) {
    return h(VInputTextArea, otherProps)
  }
  if (schema.type === "boolean") {
    // VCheckbox is a bare control (it also lives in table headers and rows), so
    // the field frame that renders the error comes from VFormControl here. The
    // label stays on the checkbox — it belongs beside the box, not above it.
    const { error, style, label, ...checkboxProps } = otherProps
    return h(VFormControl, { error, style }, () => h(VCheckbox, { label, ...checkboxProps }))
  }
  if (schema.type === "number" || schema.type === "integer") {
    return h(VInputNumber, { integer: schema.type === "integer", ...otherProps })
  }
  return h(VInputText, otherProps)
}

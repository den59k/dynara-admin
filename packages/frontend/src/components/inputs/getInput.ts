import { h, type CSSProperties } from 'vue'
import VInputObject from "./VInputObject"
import VInputText from "./VInputText.vue"
import VInputNumber from "./VInputNumber.vue"
import VCheckbox from './VCheckbox.vue'
import VInputTextArea from "./VInputTextArea.vue"
import VSelectInput from "./VSelectInput.vue"
import VFileInput from "./VFileInput.vue"
import VDateInput from "./VDateInput.vue"

// A static option for a select field.
export type SelectOption = { value: any, label: string }

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
  // `"field??"` in compact-json-schema — the field accepts an explicit null,
  // so inputs show a clear cross that resets the value to null.
  nullable?: boolean,
  enum?: (string | number)[],
  options?: SelectOption[],
  reference?: SelectReference
}

type JsonInputProps = {
  schema: Schema,
  modelValue?: any,
  label?: string,
  name?: string,
  style?: CSSProperties,
  "onUpdate:modelValue"?: (value: any) => void
}

export const JsonInput = (props: JsonInputProps) => {
  const { schema, ...restProps } = props
  if (schema.type === "object") {
    return h(VInputObject, { schema, ...restProps })
  }
  // Forwarded explicitly so JsonInput works with a bare leaf schema too (not
  // only via VInputObject, which spreads the child schema into the props).
  const otherProps = { nullable: schema.nullable, ...restProps }
  if (schema.format === "file") {
    return h(VFileInput, otherProps)
  }
  if (schema.options || schema.reference || schema.enum) {
    return h(VSelectInput, { options: schema.options, reference: schema.reference, enum: schema.enum, ...otherProps })
  }
  if (schema.type === "string" && (schema.format === "date" || schema.format === "datetime")) {
    return h(VDateInput, { datetime: schema.format === "datetime", ...otherProps })
  }
  if (schema.type === "string" && schema.multiline) {
    return h(VInputTextArea, otherProps)
  }
  if (schema.type === "boolean") {
    return h(VCheckbox, otherProps)
  }
  if (schema.type === "number" || schema.type === "integer") {
    return h(VInputNumber, { integer: schema.type === "integer", ...otherProps })
  }
  return h(VInputText, otherProps)
}

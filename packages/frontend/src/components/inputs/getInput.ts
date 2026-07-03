import { h, type CSSProperties } from 'vue'
import VInputObject from "./VInputObject"
import VInputText from "./VInputText.vue"
import VCheckbox from './VCheckbox.vue'
import VInputTextArea from "./VInputTextArea.vue"
import VSelectInput from "./VSelectInput.vue"
import VFileInput from "./VFileInput.vue"

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
  const { schema, ...otherProps } = props
  if (schema.type === "object") {
    return h(VInputObject, { schema, ...otherProps })
  }
  if (schema.format === "file") {
    return h(VFileInput, otherProps)
  }
  if (schema.options || schema.reference) {
    return h(VSelectInput, { options: schema.options, reference: schema.reference, ...otherProps })
  }
  if (schema.type === "string" && schema.multiline) {
    return h(VInputTextArea, otherProps)
  }
  if (schema.type === "boolean") {
    return h(VCheckbox, otherProps)
  }
  return h(VInputText, otherProps)
}
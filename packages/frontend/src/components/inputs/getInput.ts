import { h, type CSSProperties } from 'vue'
import VInputObject from "./VInputObject"
import VInputText from "./VInputText.vue"
import VInputTextArea from "./VInputTextArea.vue"

export type Schema = {
  type: string,
  label?: string,
  properties?: Record<string, Schema>,
  required?: string[],
  multiline?: boolean,
  items?: Schema,
  width?: number
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
  if (schema.type === "string" && schema.multiline) {
    return h(VInputTextArea, otherProps)
  }
  return h(VInputText, otherProps)
}
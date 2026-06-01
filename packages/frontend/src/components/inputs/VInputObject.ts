import { h, type VNode } from "vue"
import { JsonInput, type Schema } from "./getInput"
import './inputs.css'

type InputObjectProps = {
  schema: Schema,
  modelValue?: Record<string, string>,
  "onUpdate:modelValue"?: (value: any) => void
}

const InputObject = {
  name: "InputObject",
  props: {
    schema: { type: Object, required: true },
    modelValue: { type: Object, required: false },
    onUpdateModelValue: Function
  },
  setup(props: InputObjectProps) {
    const children: any[] = []

    let group: any[] = []
    let groupLength = 0

    for (let [key, schema] of Object.entries(props.schema.properties ?? {})) {
      const { width, ...otherProps } = schema
      const item = { 
        schema, 
        key,
        label: key,
        name: key,
        style: width? { flexGrow: width * 100 }: undefined,
        ...otherProps,
        "onUpdate:modelValue"(value: any) {
          if (!props.modelValue) {
            const modelValue = { [key]: value }
            props["onUpdate:modelValue"]?.(modelValue)
          } else {
            props.modelValue[key] = value
          }
        } 
      }

      if ((!width && group.length > 0) || (width && groupLength+width > 1.01)) {
        // children.push(h('div', { class: "v-input-object__row" }, group))
        children.push(group)
        group = []
        groupLength = 0
      }
      
      if (width) {
        group.push(item)
        groupLength += width
        continue
      }

      children.push(item)
    }

    if (group.length > 0) {
      children.push(group)
    }

    return () => h("div", { class: "v-input-object" }, children.map(i => {
      if (Array.isArray(i)) {
        return h('div', { class: "v-input-object__row" }, i.map(i => JsonInput({ ...i, modelValue: props.modelValue?.[i.key] })))
      }
      return JsonInput({ ...i, modelValue: props.modelValue?.[i.key] })
    }))
  }
}


// (props: InputObjectProps) => {


//   console.log("rerender")

//   return h("div", { class: "v-input-object" }, children)
// }

export default InputObject
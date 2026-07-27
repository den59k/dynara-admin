import { h, type VNode } from "vue"
import { JsonInput, type Schema } from "./getInput"
import './inputs.css'

type InputObjectProps = {
  schema: Schema,
  modelValue?: Record<string, string>,
  errors?: Record<string, any>,
  "onUpdate:modelValue"?: (value: any) => void
}

const InputObject = {
  name: "InputObject",
  props: {
    schema: { type: Object, required: true },
    modelValue: { type: Object, required: false },
    // Validation errors keyed like `schema.properties` — each field gets its
    // own. Declared (rather than left to fall through as an attribute) so the
    // render below tracks it: the errors object keeps its identity when a
    // submit fills it in, only its keys change.
    errors: { type: Object, required: false },
    // A nested object is one field to the form, so it may be handed an error of
    // its own. It has no frame to show it in — swallow it rather than let it
    // land on the wrapper as a stray attribute.
    error: { type: [Object, String], required: false },
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

    // Custom-component fields additionally receive this object's values, so a
    // display-only component can use sibling fields. (The record itself reaches
    // VCustomInput via injection — form values never hold the primary key.)
    const renderItem = (i: any) => JsonInput({
      ...i,
      modelValue: props.modelValue?.[i.key],
      error: props.errors?.[i.key],
      ...(i.schema.component ? { values: props.modelValue } : {}),
    })

    return () => h("div", { class: "v-input-object" }, children.map(i => {
      if (Array.isArray(i)) {
        return h('div', { class: "v-input-object__row" }, i.map(renderItem))
      }
      return renderItem(i)
    }))
  }
}


// (props: InputObjectProps) => {


//   console.log("rerender")

//   return h("div", { class: "v-input-object" }, children)
// }

export default InputObject
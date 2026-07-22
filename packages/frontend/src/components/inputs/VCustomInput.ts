import { defineComponent, h, shallowRef, watch } from 'vue'
import VFormControl from '../VFormControl.vue'
import { loadCustomComponent } from '../../utils/loadCustomComponent'

// Renders a form field declared with a `component` key — a host-app .vue file
// compiled and served by the backend (the same pipeline as page components and
// dashboard widgets). The loaded component receives the field's `modelValue`
// (and may emit `update:modelValue` to act as a custom input) plus `values` —
// the whole form's current values — so a display-only field (e.g. a read-only
// related list) can reach the record's other fields.
const VCustomInput = defineComponent({
  name: "VCustomInput",
  props: ["component", "label", "name", "modelValue", "values"],
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const custom = shallowRef<any>(null)
    watch(() => props.component, async (name) => {
      custom.value = null
      const loaded = await loadCustomComponent(name)
      // A stale load must not clobber a newer one.
      if (props.component === name) custom.value = loaded
    }, { immediate: true })

    return () => h(VFormControl, { label: props.label, class: "v-custom-input" }, () =>
      custom.value
        ? h(custom.value, {
            modelValue: props.modelValue,
            values: props.values,
            name: props.name,
            "onUpdate:modelValue": (value: any) => emit("update:modelValue", value),
          })
        : null
    )
  },
})

export default VCustomInput

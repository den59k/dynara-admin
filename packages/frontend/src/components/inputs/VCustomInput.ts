import { defineComponent, h, inject, shallowRef, watch } from 'vue'
import VFormControl from '../VFormControl.vue'
import { loadCustomComponent } from '../../utils/loadCustomComponent'
import { FORM_ITEM_KEY } from '../../utils/formItem'

// Renders a form field declared with a `component` key — a host-app .vue file
// compiled and served by the backend (the same pipeline as page components and
// dashboard widgets). The loaded component receives the field's `modelValue`
// (and may emit `update:modelValue` to act as a custom input), `values` — the
// enclosing form object's current values — and `item` — the persisted record
// the dialog provides (null when creating), which carries identity (the
// primary key) and any server fields the form doesn't declare.
const VCustomInput = defineComponent({
  name: "VCustomInput",
  props: ["component", "label", "name", "modelValue", "values"],
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const item = inject(FORM_ITEM_KEY, undefined)

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
            item: item ? item.value : null,
            name: props.name,
            "onUpdate:modelValue": (value: any) => emit("update:modelValue", value),
          })
        : null
    )
  },
})

export default VCustomInput

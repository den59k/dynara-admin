<template>
  <VFormControl class="v-select-list-input" :label="label" :error="error">
    <div v-if="items.length > 0" ref="itemsRef" class="v-select-list-input__items">
      <div
        v-for="(value, index) in items"
        :key="String(value)"
        class="v-select-list-input__item"
        :class="{ dragging: dragIndex === index }"
        :style="dragIndex === index ? { transform: `translateY(${dragOffset}px)` } : undefined"
      >
        <!-- The handle starts a pointer-driven drag; the rest of the row stays
             static so text selection and clicks never begin a reorder. -->
        <span v-if="sortable" class="v-select-list-input__handle" @pointerdown="onHandleDown(index, $event)">
          <VIcon icon="menu" />
        </span>
        <span class="v-select-list-input__label">{{ labelFor(value) }}</span>
        <button type="button" class="v-select-list-input__remove" :aria-label="t('input.clear')" @click="removeAt(index)">
          <VIcon icon="close" />
        </button>
      </div>
    </div>
    <!-- The same searchable select used for single relations; picking an option
         appends it to the list. Already-picked values are hidden. -->
    <VSelectInput
      class="v-select-list-input__add"
      :placeholder="placeholder ?? t('selectList.add')"
      :options="options"
      :enum="props.enum"
      :reference="reference"
      :exclude-values="items"
      v-model="addValue"
      @select="add"
    />
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef, watch } from 'vue'
import VFormControl from '../VFormControl.vue'
import VIcon from '../VIcon.vue'
import VSelectInput from './VSelectInput.vue'
import { dataApi } from '../../api/dataApi'
import type { SelectOption, SelectReference } from './getInput'
import { t } from '../../i18n'

const props = defineProps<{
  label?: string
  name?: string
  error?: string
  placeholder?: string
  options?: SelectOption[]
  enum?: (string | number)[]
  reference?: SelectReference
  // Enable manual reordering via drag handles. Off by default — the list keeps
  // insertion order; either way the submitted array carries the visible order.
  sortable?: boolean
}>()

// The model is the plain array of selected values (ids). The whole array is
// submitted on save; its order is the source of truth — no separate sort field.
const model = defineModel<any[] | null>()
const items = computed<any[]>(() => model.value ?? [])

// --- Labels. Options picked in this session arrive with their label via the
// embedded select's `select` event; values supplied from outside (opening an
// edit form) are resolved through the reference — per value, same as the single
// select does — and cached here.
const staticOptions = computed(() =>
  props.options ?? props.enum?.map((v) => ({ value: v, label: String(v) })) ?? []
)
const resolvedLabels = ref(new Map<any, string>())

const labelFor = (value: any): string => {
  const found = staticOptions.value.find(o => o.value === value)
  return found?.label ?? resolvedLabels.value.get(value) ?? String(value)
}

// The referenced page's value field / item access, mirroring VSelectInput.
const valueField = shallowRef<string | undefined>(
  props.reference && 'page' in props.reference ? props.reference.value : undefined
)
const itemAccess = shallowRef(false)
let metaLoaded = false
const loadPageMeta = async (ref: { page: string }) => {
  if (metaLoaded) return
  const meta = await dataApi.getPageData(ref.page)
  if (!valueField.value) valueField.value = meta.primaryKey
  itemAccess.value = !!meta.itemAccess
  metaLoaded = true
}

const resolveLabel = async (value: any): Promise<string | null> => {
  const ref = props.reference
  if (!ref) return null
  if ('method' in ref) {
    try {
      const { items } = await dataApi.getReferenceOptions(ref.method, { value })
      const found = items.find(o => o.value === value) ?? items[0]
      return found ? String(found.label ?? '') : null
    } catch { return null }
  }
  await loadPageMeta(ref)
  if (!itemAccess.value) return null
  try {
    const row = await dataApi.getItemData(ref.page, value)
    return row ? String((row as any)[ref.label] ?? '') : null
  } catch { return null }
}

const resolveLabelInto = (value: any) => {
  resolveLabel(value).then((label) => {
    if (label != null) resolvedLabels.value.set(value, label)
  })
}

// Resolves labels for values whose label isn't cached yet. Method references
// get one batched request (`values`); anything the method didn't return —
// typically a host handler that doesn't handle `values` yet — falls back to
// per-`value` lookups, which every reference handler supports. Page references
// stay per-id: pages have no batch by-id endpoint.
const resolveMissing = async (missing: any[]) => {
  const ref = props.reference!
  if ('method' in ref) {
    let unresolved = missing
    try {
      const { items } = await dataApi.getReferenceOptions(ref.method, { values: missing })
      const byValue = new Map(items.map(o => [o.value, String(o.label ?? '')]))
      unresolved = []
      for (const value of missing) {
        const label = byValue.get(value)
        if (label != null) resolvedLabels.value.set(value, label)
        else unresolved.push(value)
      }
    } catch { /* fall through to per-value lookups */ }
    for (const value of unresolved) resolveLabelInto(value)
    return
  }
  for (const value of missing) resolveLabelInto(value)
}

watch(items, (values) => {
  if (!props.reference) return
  const missing = values.filter((v) => v != null && !resolvedLabels.value.has(v))
  if (missing.length === 0) return
  // Seed placeholders synchronously so a re-triggered watch never refetches.
  for (const value of missing) resolvedLabels.value.set(value, String(value))
  resolveMissing(missing)
}, { immediate: true })

// --- Mutations ---
// The embedded select is a one-shot picker: reset it after every pick so the
// chosen value doesn't linger as its displayed value. Resetting `value` -> null
// is a real prop change, so the select clears (a static `:model-value="null"`
// wouldn't — its local model would hold onto the last selection).
const addValue = ref<any>(null)
const add = (option: SelectOption | null) => {
  addValue.value = null
  if (option == null || option.value == null) return
  if (items.value.includes(option.value)) return
  resolvedLabels.value.set(option.value, option.label)
  model.value = [...items.value, option.value]
}

const removeAt = (index: number) => {
  model.value = items.value.filter((_, i) => i !== index)
}

// --- Manual sorting. Pressing a row's handle starts a pointer-driven drag: the
// picked row follows the pointer along the Y axis (clamped to the list bounds),
// and the model reorders live as the row crosses its neighbours. ---
const itemsRef = ref<HTMLElement>()
const dragIndex = ref<number | null>(null)
// Pixel offset applied to the dragged row so it stays under the pointer.
const dragOffset = ref(0)

// Captured at the start of a drag and constant for its duration.
let startIndex = 0
let startPointerY = 0
let rowStep = 0 // distance between consecutive row tops (height + gap)
let rowCount = 0

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

const onHandleDown = (index: number, e: PointerEvent) => {
  const container = itemsRef.value
  if (!container) return
  const rows = Array.from(container.children) as HTMLElement[]
  // Measure the step from the DOM so it tracks whatever height/gap the CSS uses.
  rowStep = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 0
  if (rowStep === 0) return // a single row has nowhere to go

  e.preventDefault() // suppress native text/image selection while dragging
  startIndex = index
  rowCount = items.value.length
  startPointerY = e.clientY
  dragIndex.value = index
  dragOffset.value = 0

  // Listen on the window rather than the handle: reordering the rows moves the
  // handle's DOM node, which would drop pointer capture (and fire pointercancel)
  // and stall the drag. Window listeners fire wherever the pointer goes.
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

const onPointerMove = (e: PointerEvent) => {
  if (dragIndex.value == null) return
  const maxTop = (rowCount - 1) * rowStep
  // Where the row sits visually — derived from the original slot plus the total
  // pointer travel, so it's independent of the reorders done so far and can't drift.
  const visualTop = clamp(startIndex * rowStep + (e.clientY - startPointerY), 0, maxTop)
  const target = clamp(Math.round(visualTop / rowStep), 0, rowCount - 1)
  if (target !== dragIndex.value) {
    const arr = [...items.value]
    const [moved] = arr.splice(dragIndex.value, 1)
    arr.splice(target, 0, moved)
    dragIndex.value = target
    model.value = arr
  }
  // Offset relative to the row's (possibly new) home slot keeps it under the pointer.
  dragOffset.value = visualTop - dragIndex.value * rowStep
}

const onPointerUp = () => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  dragIndex.value = null
  dragOffset.value = 0
}
</script>

<style lang="sass">
.v-select-list-input
  min-width: 200px

.v-select-list-input__items
  display: flex
  flex-direction: column
  gap: 4px
  margin-bottom: 4px

.v-select-list-input__item
  display: flex
  align-items: center
  gap: 8px
  height: var(--control-height, 36px)
  padding: 0 6px 0 10px
  border: 1px solid var(--input-border-color)
  border-radius: 7px
  font-size: 13px
  color: var(--text-color)
  background: none
  box-sizing: border-box

  // The dragged row floats above the rest and tracks the pointer directly, so
  // its transform must not be animated.
  &.dragging
    position: relative
    z-index: 1
    background-color: var(--popover-color)
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28)
    cursor: grabbing

.v-select-list-input__handle
  display: flex
  align-items: center
  // Grab area spans the full row height and reaches the row's left edge (the
  // negative margin eats the row's 10px left padding; the matching padding keeps
  // the icon in place), so there's a large area to grab.
  align-self: stretch
  margin-left: -10px
  padding-left: 10px
  color: var(--text-secondary-color)
  cursor: grab
  flex-shrink: 0
  // The handle is the drag affordance — don't let the pointerdown select text
  // or scroll the page (touch) when a drag begins.
  user-select: none
  touch-action: none

  svg
    width: 15px
    height: 15px

.v-select-list-input__label
  flex-grow: 1
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.v-select-list-input__remove
  display: flex
  align-items: center
  justify-content: center
  width: 24px
  height: 24px
  border: none
  background: none
  border-radius: 6px
  cursor: pointer
  color: var(--text-secondary-color)
  flex-shrink: 0
  padding: 0

  &:hover
    background-color: var(--hover-color)
    color: var(--text-color)

  svg
    width: 14px
    height: 14px
</style>

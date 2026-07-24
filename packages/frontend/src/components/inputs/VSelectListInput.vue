<template>
  <VFormControl class="v-select-list-input" :label="label" :error="error">
    <div v-if="items.length > 0" class="v-select-list-input__items" @drop.prevent>
      <div
        v-for="(value, index) in items"
        :key="String(value)"
        class="v-select-list-input__item"
        :class="{ dragging: dragIndex === index }"
        :draggable="armed === index || undefined"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @dragend="onDragEnd"
      >
        <!-- The handle arms the row for dragging, so text selection and clicks
             elsewhere on the row never start a drag. -->
        <span v-if="sortable" class="v-select-list-input__handle" @pointerdown="armed = index">
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
      :model-value="null"
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

watch(items, (values) => {
  if (!props.reference) return
  for (const value of values) {
    if (value == null || resolvedLabels.value.has(value)) continue
    resolvedLabels.value.set(value, String(value)) // placeholder — never refetched
    resolveLabel(value).then((label) => {
      if (label != null) resolvedLabels.value.set(value, label)
    })
  }
}, { immediate: true })

// --- Mutations ---
const add = (option: SelectOption | null) => {
  if (option == null || option.value == null) return
  if (items.value.includes(option.value)) return
  resolvedLabels.value.set(option.value, option.label)
  model.value = [...items.value, option.value]
}

const removeAt = (index: number) => {
  model.value = items.value.filter((_, i) => i !== index)
}

// --- Manual sorting (HTML5 drag & drop, live reorder on dragover). A row is
// only draggable while the pointer went down on its handle (`armed`), so the
// rest of the row behaves like static content. ---
const armed = ref<number | null>(null)
const dragIndex = ref<number | null>(null)

const onDragStart = (index: number, e: DragEvent) => {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '') // Firefox requires data to start a drag
  }
}

const onDragOver = (index: number, e: DragEvent) => {
  if (dragIndex.value == null) return
  e.preventDefault()
  if (index === dragIndex.value) return
  const arr = [...items.value]
  const [moved] = arr.splice(dragIndex.value, 1)
  arr.splice(index, 0, moved)
  dragIndex.value = index
  model.value = arr
}

const onDragEnd = () => {
  dragIndex.value = null
  armed.value = null
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

  &.dragging
    opacity: 0.5
    background-color: var(--hover-color)

.v-select-list-input__handle
  display: flex
  align-items: center
  color: var(--text-secondary-color)
  cursor: grab
  flex-shrink: 0
  // The handle is the drag affordance — don't let the pointerdown select text.
  user-select: none

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

<template>
  <VFormControl class="v-input-table" :label="label" :error="error">
    <div class="v-input-table__frame">
      <div class="v-input-table__row v-input-table__head" :style="{ gridTemplateColumns }">
        <span v-if="sortable"></span>
        <span v-for="col in columns" :key="col.key" class="v-input-table__th">
          {{ col.schema.label ?? col.key }}<span v-if="col.required" class="v-input-table__required">*</span>
        </span>
        <span></span>
      </div>
      <div ref="itemsRef" class="v-input-table__body">
        <div
          v-for="(row, index) in items"
          :key="index"
          class="v-input-table__row"
          :class="{ dragging: dragIndex === index }"
          :style="[{ gridTemplateColumns }, dragIndex === index ? { transform: `translateY(${dragOffset}px)` } : {}]"
        >
          <span v-if="sortable" class="v-input-table__handle" @pointerdown="onHandleDown(index, $event)">
            <VIcon icon="menu" />
          </span>
          <!-- Cells recurse through JsonInput, so every input works in a column:
               selects (enum/options/reference), dates, checkboxes, nullable
               clear-crosses… The chrome is stripped by the CSS below — the
               table's frame and hairlines are the only borders. -->
          <div v-for="col in columns" :key="col.key" class="v-input-table__cell">
            <JsonInput
              :schema="col.schema"
              :modelValue="row?.[col.key]"
              :name="col.key"
              @update:modelValue="(v: any) => setCell(index, col.key, v)"
            />
          </div>
          <button type="button" class="v-input-table__remove" :aria-label="t('input.clear')" @click="removeAt(index)">
            <VIcon icon="close" />
          </button>
        </div>
      </div>
      <button type="button" class="v-input-table__add" @click="addRow">
        <VIcon icon="add" />{{ t('table.addRow') }}
      </button>
    </div>
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import VFormControl from '../VFormControl.vue'
import VIcon from '../VIcon.vue'
import { JsonInput, type Schema } from './getInput'
import { useRowDrag } from './useRowDrag'
import { getDefaultValue } from '../../utils/getDefaultValue'
import { t } from '../../i18n'

// An editable table over an array of object rows. The row schema (`items`)
// doubles as the column definition: each property is a column — its `label`
// the header, its `width` the relative column weight, its type the cell
// editor. Same model contract as the other multi-value inputs: the plain array
// of rows, submitted whole in its visible order; `sortable` adds a drag-handle
// column (the shared pointer drag).
const props = defineProps<{
  schema: Schema
  label?: string
  name?: string
  error?: string
  sortable?: boolean
}>()

const model = defineModel<any[] | null>()
const items = computed<any[]>(() => model.value ?? [])

const columns = computed(() => {
  const itemsSchema = props.schema.items
  const required = itemsSchema?.required ?? []
  return Object.entries(itemsSchema?.properties ?? {}).map(([key, schema]) => ({
    key,
    schema,
    required: required.includes(key),
  }))
})

const gridTemplateColumns = computed(() => [
  ...(props.sortable ? ['28px'] : []),
  ...columns.value.map((c) => `minmax(0, ${c.schema.width ?? 1}fr)`),
  '32px',
].join(' '))

const setCell = (index: number, key: string, value: any) => {
  model.value = items.value.map((row, i) => (i === index ? { ...row, [key]: value } : row))
}

// A new row starts at the row schema's defaults (getDefaultValue: "" for
// required strings, null for selects/dates — forcing a pick — and so on).
const addRow = () => {
  model.value = [...items.value, getDefaultValue(props.schema.items)]
}

const removeAt = (index: number) => {
  model.value = items.value.filter((_, i) => i !== index)
}

// Manual sorting: the shared pointer-driven row drag (see useRowDrag).
const { itemsRef, dragIndex, dragOffset, onHandleDown } = useRowDrag(items, (arr) => { model.value = arr })
</script>

<style lang="sass">
.v-input-table
  min-width: 200px

.v-input-table__frame
  border: 1px solid var(--input-border-color)
  border-radius: 8px
  background-color: var(--input-background)
  overflow: hidden

.v-input-table__row
  display: grid
  align-items: stretch

.v-input-table__head
  font-size: 12px
  font-weight: 500
  color: var(--text-secondary-color)
  border-bottom: 1px solid var(--input-border-color)

.v-input-table__th
  padding: 6px 10px
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.v-input-table__required
  color: var(--primary-color)
  margin-left: 0.15em
  user-select: none

// Compact controls inside rows; every input reading --control-height follows.
.v-input-table__body
  --control-height: 32px

  .v-input-table__row
    border-bottom: 1px solid var(--input-border-color)

    // The dragged row floats above the rest and tracks the pointer directly.
    &.dragging
      position: relative
      z-index: 1
      background-color: var(--popover-color)
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28)
      cursor: grabbing

.v-input-table__cell
  min-width: 0

  & + .v-input-table__cell
    border-left: 1px solid var(--input-border-color)

  &:focus-within
    box-shadow: inset 0 0 0 1px var(--primary-color)

// Chrome-less inputs: the frame and the cell hairlines are the table's only
// borders, so the per-input outline (and its hover/focus styling) is stripped.
.v-input-table .v-input-table__cell
  .v-form-control
    height: 100%

  .v-form-control__outline
    height: 100%
    min-height: 32px
    border: none
    background: none
    box-shadow: none
    border-radius: 0

  .v-input-text, .v-select-input, .v-select-chips-input, .v-select-list-input
    min-width: 0

  // A nullable cell's own clear cross would sit right next to the row's remove
  // button — a confusing double cross. The row remove is the clear affordance
  // here (a nullable select still clears from inside its dropdown), so the
  // inline cross is dropped as part of the stripped cell chrome.
  .v-input-clear
    display: none

.v-input-table__handle
  display: flex
  align-items: center
  justify-content: center
  color: var(--text-secondary-color)
  cursor: grab
  user-select: none
  touch-action: none

  svg
    width: 15px
    height: 15px

.v-input-table__remove
  display: flex
  align-items: center
  justify-content: center
  align-self: center
  justify-self: center
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

.v-input-table__add
  display: flex
  align-items: center
  gap: 6px
  width: 100%
  border: none
  background: none
  padding: 8px 10px
  font-size: 13px
  font-family: inherit
  color: var(--text-secondary-color)
  cursor: pointer

  &:hover
    background-color: var(--hover-color)
    color: var(--text-color)

  svg
    width: 14px
    height: 14px
</style>

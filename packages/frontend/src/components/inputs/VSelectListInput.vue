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
        <span
          v-if="colorFor(value)"
          class="v-select-list-input__dot"
          :style="{ backgroundColor: resolveColor(colorFor(value)!) }"
        ></span>
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
      :enum-labels="enumLabels"
      :enum-colors="enumColors"
      :reference="reference"
      :exclude-values="items"
      v-model="addValue"
      @select="add"
    />
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import VFormControl from '../VFormControl.vue'
import VIcon from '../VIcon.vue'
import VSelectInput from './VSelectInput.vue'
import { useSelectListLabels } from './useSelectListLabels'
import { useRowDrag } from './useRowDrag'
import { resolveColor } from '../../utils/formatCell'
import type { SelectOption, SelectReference } from './getInput'
import { t } from '../../i18n'

const props = defineProps<{
  label?: string
  name?: string
  error?: string
  placeholder?: string
  options?: SelectOption[]
  enum?: (string | number)[]
  enumLabels?: Record<string | number, string>
  enumColors?: Record<string | number, string>
  reference?: SelectReference
  // Enable manual reordering via drag handles. Off by default — the list keeps
  // insertion order; either way the submitted array carries the visible order.
  sortable?: boolean
}>()

// The model is the plain array of selected values (ids). The whole array is
// submitted on save; its order is the source of truth — no separate sort field.
const model = defineModel<any[] | null>()
const items = computed<any[]>(() => model.value ?? [])

// Labels: options picked in this session arrive with their label via the
// embedded select's `select` event (cached through `cacheLabel`); values
// supplied from outside (opening an edit form) are resolved through the
// reference — batched for method references — by the shared composable.
const { labelFor, colorFor, cacheLabel } = useSelectListLabels(props, items)

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
  cacheLabel(option.value, option.label, option.color)
  model.value = [...items.value, option.value]
}

const removeAt = (index: number) => {
  model.value = items.value.filter((_, i) => i !== index)
}

// Manual sorting: the shared pointer-driven row drag (see useRowDrag).
const { itemsRef, dragIndex, dragOffset, onHandleDown } = useRowDrag(items, (arr) => { model.value = arr })
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

// A value's declared color, as a small dot next to its label.
.v-select-list-input__dot
  width: 8px
  height: 8px
  border-radius: 50%
  flex-shrink: 0

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

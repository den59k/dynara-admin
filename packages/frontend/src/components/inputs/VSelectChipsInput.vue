<template>
  <VFormControl class="v-select-chips-input" :label="label" :error="error" outline>
    <!-- Clicking the box's empty area opens the picker; chips and the embedded
         select handle their own clicks. -->
    <div class="v-select-chips-input__box" @click.self="openAdd">
      <span v-for="(value, index) in items" :key="String(value)" class="v-select-chips-input__chip" :style="chipStyle(value)">
        <span class="v-select-chips-input__chip-label">{{ labelFor(value) }}</span>
        <button type="button" class="v-select-chips-input__remove" :aria-label="t('input.clear')" @click="removeAt(index)">
          <VIcon icon="close" />
        </button>
      </span>
      <!-- The same searchable select used for single relations, restyled to sit
           borderless inside the box; picking an option appends a chip.
           Already-picked values are hidden. -->
      <VSelectInput
        ref="selectRef"
        class="v-select-chips-input__add"
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
    </div>
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import VFormControl from '../VFormControl.vue'
import VIcon from '../VIcon.vue'
import VSelectInput from './VSelectInput.vue'
import { useSelectListLabels } from './useSelectListLabels'
import { resolveColor } from '../../utils/formatCell'
import type { SelectOption, SelectReference } from './getInput'
import { t } from '../../i18n'

// The compact sibling of VSelectListInput: selected values render as removable
// chips inside one control instead of one row each. Same model contract — the
// plain value array, appended in pick order — but no manual reordering, so an
// array that needs drag-sorting renders as the list, never as chips.
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
}>()

const model = defineModel<any[] | null>()
const items = computed<any[]>(() => model.value ?? [])

// Labels: options picked in this session arrive with their label via the
// embedded select's `select` event (cached through `cacheLabel`); values
// supplied from outside (opening an edit form) are resolved through the
// reference — batched for method references — by the shared composable.
const { labelFor, colorFor, cacheLabel } = useSelectListLabels(props, items)

// A declared color renders the chip badge-style: colored text over a tint of
// the same color. Undeclared values keep the neutral chip look from the CSS.
const chipStyle = (value: any) => {
  const color = colorFor(value)
  if (!color) return undefined
  const c = resolveColor(color)
  return { color: c, backgroundColor: `color-mix(in srgb, ${c} 15%, transparent)` }
}

// The embedded select is a one-shot picker: reset it after every pick so the
// chosen value doesn't linger as its displayed value (see VSelectListInput).
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

const selectRef = ref<{ openDropdown: () => void }>()
const openAdd = () => selectRef.value?.openDropdown()
</script>

<style lang="sass">
.v-select-chips-input
  min-width: 200px

.v-select-chips-input__box
  display: flex
  flex-wrap: wrap
  align-items: center
  flex-grow: 1
  gap: 4px
  padding: 3px 4px 3px 6px
  min-height: var(--control-height, 36px)
  box-sizing: border-box
  cursor: pointer

.v-select-chips-input__chip
  display: inline-flex
  align-items: center
  gap: 2px
  height: 24px
  padding: 0 2px 0 8px
  border-radius: 6px
  background-color: var(--hover-color)
  font-size: 12px
  color: var(--text-color)
  max-width: 100%
  box-sizing: border-box

.v-select-chips-input__chip-label
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.v-select-chips-input__remove
  display: flex
  align-items: center
  justify-content: center
  width: 18px
  height: 18px
  border: none
  background: none
  border-radius: 5px
  cursor: pointer
  // Inherit so the × matches a colored chip's text; faded until hovered.
  color: inherit
  opacity: 0.55
  flex-shrink: 0
  padding: 0

  &:hover
    background-color: color-mix(in srgb, currentColor 14%, transparent)
    opacity: 1

  svg
    width: 12px
    height: 12px

// The embedded select is chrome-less here: the chips box already draws the
// outline (and its focus ring, via :focus-within on the outer control).
.v-select-chips-input__add.v-select-input
  min-width: 120px
  flex: 1 1 120px

  .v-form-control__outline
    height: 28px
    border: none
    background: none
    box-shadow: none

  .v-select-input__control
    padding: 0 4px
</style>

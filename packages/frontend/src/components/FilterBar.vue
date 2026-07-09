<template>
  <!-- Inline filters: each field is a single-height pill with its label inside
       (`Role · [All ▾]`), so filters share one row with the search box instead
       of stacking a labeled block underneath it. -->
  <div v-for="(fieldSchema, key) in fields" :key="key" class="filter-bar__field" @click="focusField">
    <span class="filter-bar__label">{{ fieldSchema.label ?? labelize(key) }}</span>
    <JsonInput
      :schema="fieldSchema"
      :name="key"
      :nullable="true"
      :placeholder="t('filter.all')"
      :model-value="draft[key] ?? null"
      @update:model-value="update(key, $event)"
    />
  </div>
  <button v-if="activeCount > 0" class="filter-bar__clear" @click="clearAll">
    <VIcon icon="close" /> {{ t('filter.clear', { count: activeCount }) }}
  </button>
</template>

<script lang="ts" setup>
import { computed, reactive, watch } from 'vue'
import { JsonInput } from './inputs/getInput'
import VIcon from './VIcon.vue'
import { t } from '../i18n'

const props = defineProps<{
  // An object schema ({ type: "object", properties: {...} }) describing the filters.
  schema: any,
  // The committed filter values (from the URL).
  modelValue: Record<string, any>,
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Record<string, any>] }>()

const fields = computed<Record<string, any>>(() => props.schema?.properties ?? {})

// Local editable copy so discrete inputs apply immediately while text inputs are
// debounced, without rewriting the URL on every keystroke.
const draft = reactive<Record<string, any>>({ ...props.modelValue })

// Keep the draft in sync when the committed filter changes elsewhere
// (navigation, back button, clear).
watch(() => props.modelValue, (value) => {
  for (const key of Object.keys(draft)) delete draft[key]
  Object.assign(draft, value)
})

const activeCount = computed(() =>
  Object.values(draft).filter(v => v != null && v !== '').length
)

let timer: ReturnType<typeof setTimeout> | undefined
const commit = () => {
  const next: Record<string, any> = {}
  for (const [key, value] of Object.entries(draft)) {
    if (value != null && value !== '') next[key] = value
  }
  emit('update:modelValue', next)
}

const update = (key: string, value: any) => {
  if (value == null || value === '') delete draft[key]
  else draft[key] = value
  // Debounce so typing into a text filter doesn't spam the list request / URL.
  clearTimeout(timer)
  timer = setTimeout(commit, 300)
}

const clearAll = () => {
  for (const key of Object.keys(draft)) delete draft[key]
  clearTimeout(timer)
  commit()
}

const labelize = (key: string | number) =>
  String(key).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()

// The label and the pill's padding sit outside the (often narrow) inner input,
// so make the whole pill activate its control: clicking the label focuses a text
// field or opens a select dropdown, just like clicking the input itself.
const focusField = (event: MouseEvent) => {
  const field = event.currentTarget as HTMLElement
  const control = field.querySelector<HTMLElement>('.v-select-input__control, input')
  if (!control || control === event.target || control.contains(event.target as Node)) return
  control.click()
  control.focus()
}
</script>

<style lang="sass">
.filter-bar__field
  display: flex
  align-items: center
  height: 36px
  box-sizing: border-box
  border: 1px solid var(--input-border-color)
  background-color: var(--input-background)
  border-radius: 8px
  cursor: pointer
  transition: border-color 0.12s, box-shadow 0.12s
  // Inner inputs read this instead of their default 36px, so input + pill
  // border add up to the pill's 36px height.
  --control-height: 34px

  &:focus-within
    border-color: var(--primary-color)
    box-shadow: 0 0 0 3px var(--shadow-color)

  .filter-bar__label
    font-size: 13px
    font-weight: 500
    color: var(--text-secondary-color)
    padding-left: 12px
    white-space: nowrap
    user-select: none
    pointer-events: none

  // The inner input keeps all its behavior but sheds its own frame: the pill
  // provides the border, background and focus ring.
  .v-form-control
    flex: 0 1 auto

  .v-form-control__outline
    border: none
    background: none

    &:focus-within
      border: none
      box-shadow: none

  .v-input-text, .v-select-input, .v-input-number
    min-width: 0

  .v-select-input__control
    padding-left: 8px

  input
    width: 90px
    padding-left: 8px

.filter-bar__clear
  display: flex
  align-items: center
  gap: 4px
  height: 36px
  padding: 0 12px
  background: none
  border: none
  border-radius: 8px
  color: var(--text-secondary-color)
  font-size: 13px
  font-weight: 500
  cursor: pointer
  white-space: nowrap

  svg
    width: 14px
    height: 14px

  &:hover
    background-color: var(--hover-color)
    color: var(--text-color)
</style>

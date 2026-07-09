<template>
  <div class="filter-bar">
    <div v-for="(fieldSchema, key) in fields" :key="key" class="filter-bar__field">
      <label class="filter-bar__label">{{ fieldSchema.label ?? labelize(key) }}</label>
      <JsonInput
        :schema="fieldSchema"
        :name="key"
        :nullable="true"
        :model-value="draft[key] ?? null"
        @update:model-value="update(key, $event)"
      />
    </div>
    <button v-if="activeCount > 0" class="filter-bar__clear" @click="clearAll">
      <VIcon icon="close" /> {{ t('filter.clear', { count: activeCount }) }}
    </button>
  </div>
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
</script>

<style lang="sass">
.filter-bar
  display: flex
  flex-wrap: wrap
  align-items: flex-end
  gap: 12px
  margin-top: 12px

.filter-bar__field
  display: flex
  flex-direction: column
  gap: 4px

  .filter-bar__label
    font-size: 12px
    font-weight: 500
    color: var(--text-secondary-color)

  // Filter inputs are compact and don't need the full form min-width.
  .v-input-text, .v-select-input, .v-input-number
    min-width: 160px

.filter-bar__clear
  display: flex
  align-items: center
  gap: 4px
  height: 38px
  padding: 0 12px
  background: none
  border: none
  border-radius: 8px
  color: var(--text-secondary-color)
  font-size: 13px
  cursor: pointer

  svg
    width: 14px
    height: 14px

  &:hover
    background-color: var(--hover-color)
    color: var(--text-color)
</style>

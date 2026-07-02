<template>
  <VFormControl class="v-select-input" :label="label" :error="error" outline>
    <div
      ref="rootRef"
      class="v-select-input__control"
      :class="{ open }"
      tabindex="0"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.esc="open = false"
    >
      <span v-if="displayLabel" class="v-select-input__value">{{ displayLabel }}</span>
      <span v-else class="v-select-input__placeholder">{{ placeholder ?? 'Не выбрано' }}</span>
      <VIcon class="v-select-input__arrow" icon="v-collapse-arrow" />

      <div v-if="open" class="v-select-input__dropdown" @click.stop>
        <input
          v-if="reference"
          ref="searchRef"
          class="v-select-input__search"
          v-model="search"
          placeholder="Поиск..."
        />
        <div class="v-select-input__options">
          <button
            v-if="model != null"
            type="button"
            class="v-select-input__option v-select-input__clear"
            @click="select(null)"
          >Очистить</button>
          <button
            v-for="opt in resolvedOptions"
            :key="String(opt.value)"
            type="button"
            class="v-select-input__option"
            :class="{ active: opt.value === model }"
            @click="select(opt.value)"
          >{{ opt.label }}</button>
          <div v-if="resolvedOptions.length === 0" class="v-select-input__empty">
            {{ pending ? 'Загрузка…' : 'Нет вариантов' }}
          </div>
        </div>
      </div>
    </div>
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import VFormControl from '../VFormControl.vue'
import VIcon from '../VIcon.vue'
import { dataApi } from '../../api/dataApi'
import type { SelectOption, SelectReference } from './getInput'

const props = defineProps<{
  label?: string
  name?: string
  error?: string
  placeholder?: string
  options?: SelectOption[]
  reference?: SelectReference
}>()

const model = defineModel<any>()

const open = ref(false)
const search = ref('')
const rootRef = ref<HTMLElement>()
const searchRef = ref<HTMLInputElement>()

// --- Options source: static list, or rows loaded from the referenced page ---
const staticOptions = computed(() => props.options ?? [])
const loadedOptions = shallowRef<SelectOption[]>([])
const pending = shallowRef(false)

// The referenced page's value field (defaults to its primary key) and whether
// it exposes single-item access (used to resolve a pre-selected value's label).
const valueField = shallowRef<string | undefined>(props.reference?.value)
const itemAccess = shallowRef(false)
let metaLoaded = false

const loadPageMeta = async () => {
  if (!props.reference || metaLoaded) return
  const meta = await dataApi.getPageData(props.reference.page)
  if (!valueField.value) valueField.value = meta.primaryKey
  itemAccess.value = !!meta.itemAccess
  metaLoaded = true
}

const toOption = (row: any): SelectOption => ({
  value: valueField.value ? row[valueField.value] : row,
  label: String(row[props.reference!.label] ?? ''),
})

let reqId = 0
const loadOptions = async () => {
  if (!props.reference) return
  const id = ++reqId
  pending.value = true
  try {
    await loadPageMeta()
    const { items } = await dataApi.getData(props.reference.page, { take: 20, search: search.value || undefined })
    if (id !== reqId) return
    loadedOptions.value = items.map(toOption)
  } finally {
    if (id === reqId) pending.value = false
  }
}

const resolvedOptions = computed(() => props.reference ? loadedOptions.value : staticOptions.value)

// --- Selected-value label (may need resolving in edit mode) ---
const resolvedLabel = shallowRef<string | null>(null)
const displayLabel = computed(() => {
  if (model.value == null) return ''
  const found = resolvedOptions.value.find(o => o.value === model.value)
    ?? staticOptions.value.find(o => o.value === model.value)
  if (found) return found.label
  return resolvedLabel.value ?? String(model.value)
})

const resolveSelectedLabel = async () => {
  if (!props.reference || model.value == null) { resolvedLabel.value = null; return }
  if (resolvedOptions.value.some(o => o.value === model.value)) return
  await loadPageMeta()
  if (!itemAccess.value) { resolvedLabel.value = null; return }
  try {
    const row = await dataApi.getItemData(props.reference.page, model.value)
    resolvedLabel.value = row ? String((row as any)[props.reference.label] ?? '') : null
  } catch { resolvedLabel.value = null }
}

// --- Interactions ---
const toggle = () => {
  open.value = !open.value
  if (open.value && props.reference && loadedOptions.value.length === 0) loadOptions()
  if (open.value && props.reference) nextTick(() => searchRef.value?.focus())
}

const select = (value: any) => {
  model.value = value
  open.value = false
  search.value = ''
}

let debounce: ReturnType<typeof setTimeout>
watch(search, () => {
  if (!props.reference) return
  clearTimeout(debounce)
  debounce = setTimeout(loadOptions, 250)
})

// Resolve the label for a value supplied from outside (opening an edit form).
watch(model, resolveSelectedLabel, { immediate: true })

const onDocMouseDown = (e: MouseEvent) => {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
</script>

<style lang="sass">
.v-select-input
  min-width: 200px

  .v-form-control__outline
    height: 40px

.v-select-input__control
  position: relative
  display: flex
  align-items: center
  flex-grow: 1
  height: 100%
  padding: 0 12px
  gap: 8px
  cursor: pointer
  outline: none
  font-size: 13px
  border-radius: 7px

  &.open .v-select-input__arrow
    transform: rotate(180deg)

.v-select-input__value
  flex-grow: 1
  color: var(--text-color)
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.v-select-input__placeholder
  flex-grow: 1
  color: var(--placeholder-color)

.v-select-input__arrow
  width: 16px
  height: 16px
  color: var(--text-secondary-color)
  transition: transform 0.12s
  flex-shrink: 0

.v-select-input__dropdown
  position: absolute
  z-index: 10
  top: calc(100% + 4px)
  left: 0
  right: 0
  background: var(--paper-color, #fff)
  border: 1px solid var(--border-color)
  border-radius: 8px
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12)
  padding: 4px
  cursor: default

.v-select-input__search
  width: 100%
  box-sizing: border-box
  height: 32px
  padding: 0 8px
  margin-bottom: 4px
  border: 1px solid var(--border-color)
  border-radius: 6px
  background: none
  outline: none
  color: var(--text-color)
  font-size: 13px

.v-select-input__options
  max-height: 220px
  overflow-y: auto
  display: flex
  flex-direction: column

.v-select-input__option
  text-align: left
  background: none
  border: none
  padding: 8px 10px
  border-radius: 6px
  cursor: pointer
  color: var(--text-color)
  font-size: 13px

  &:hover
    background-color: var(--hover-color)

  &.active
    background-color: var(--background-active-color)

.v-select-input__clear
  color: var(--text-secondary-color)

.v-select-input__empty
  padding: 8px 10px
  color: var(--text-secondary-color)
  font-size: 13px
</style>

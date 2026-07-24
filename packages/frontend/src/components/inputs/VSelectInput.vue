<template>
  <VFormControl class="v-select-input" :label="label" :error="error" outline>
    <div
      ref="rootRef"
      class="v-select-input__control"
      :class="{ open }"
      tabindex="0"
      @click="onControlClick"
      @keydown.enter.prevent="onControlClick"
      @keydown.down.prevent="onControlClick"
      @keydown.esc="close"
    >
      <!-- When open the control itself becomes the search box (combobox style). -->
      <input
        v-if="open"
        ref="searchRef"
        class="v-select-input__search"
        v-model="search"
        :placeholder="displayLabel || (placeholder ?? t('select.empty'))"
        @click.stop
      />
      <template v-else>
        <span v-if="displayLabel" class="v-select-input__value">{{ displayLabel }}</span>
        <span v-else class="v-select-input__placeholder">{{ placeholder ?? t('select.empty') }}</span>
      </template>
      <VInputClear v-if="nullable && model != null && !open" @clear="select(null)" />
      <VIcon class="v-select-input__arrow" icon="chevron-down" />
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        class="v-select-input__scrim"
        @pointerdown="close"
        @wheel.prevent="close"
        @contextmenu.prevent="close"
      ></div>
      <div v-if="open" class="v-select-input__dropdown" :style="dropdownStyle">
        <div class="v-select-input__options">
          <button
            v-if="nullable && model != null"
            type="button"
            class="v-select-input__option v-select-input__clear"
            @click="select(null)"
          >{{ t('select.clear') }}</button>
          <button
            v-for="opt in resolvedOptions"
            :key="String(opt.value)"
            type="button"
            class="v-select-input__option"
            :class="{ active: opt.value === model }"
            @click="select(opt.value, opt)"
          >
            <span class="v-select-input__option-label">{{ opt.label }}</span>
            <VIcon v-if="opt.value === model" class="v-select-input__check" icon="check" />
          </button>
          <div v-if="resolvedOptions.length === 0" class="v-select-input__empty">
            {{ pending ? t('select.loading') : t('select.noOptions') }}
          </div>
        </div>
      </div>
    </Teleport>
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, type CSSProperties, nextTick, ref, shallowRef, watch } from 'vue'
import VFormControl from '../VFormControl.vue'
import VIcon from '../VIcon.vue'
import VInputClear from './VInputClear.vue'
import { dataApi } from '../../api/dataApi'
import type { SelectOption, SelectReference } from './getInput'
import { t } from '../../i18n'

const props = defineProps<{
  label?: string
  name?: string
  error?: string
  placeholder?: string
  options?: SelectOption[]
  // Plain enum values from the schema — rendered as options with the value as label.
  enum?: (string | number)[]
  reference?: SelectReference
  nullable?: boolean
  // Values hidden from the dropdown. Used by VSelectListInput, which embeds
  // this control as its "add" box and excludes the already-picked values.
  excludeValues?: any[]
}>()

// `select` carries the full chosen option (or null on clear) alongside the
// plain-value v-model update, so an embedding control can reuse the label
// without resolving it again.
const emit = defineEmits<{ select: [option: SelectOption | null] }>()

const model = defineModel<any>()

const open = ref(false)
const search = ref('')
const rootRef = ref<HTMLElement>()
const searchRef = ref<HTMLInputElement>()

// --- Options source: static list, enum values, rows from a referenced page, or
// a reference method resolved server-side. A `reference` is one of two variants:
//   { page, label, value? } — load & filter another page's list
//   { method }              — call an async method that returns SelectOptions
const staticOptions = computed(() =>
  props.options ?? props.enum?.map((v) => ({ value: v, label: String(v) })) ?? []
)
const loadedOptions = shallowRef<SelectOption[]>([])
const pending = shallowRef(false)

// The referenced page's value field (defaults to its primary key) and whether
// it exposes single-item access (used to resolve a pre-selected value's label).
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

const toOption = (row: any, labelField: string): SelectOption => ({
  value: valueField.value ? row[valueField.value] : row,
  label: String(row[labelField] ?? ''),
})

const normalizeOption = (o: any): SelectOption => ({ value: o.value, label: String(o.label ?? '') })

let reqId = 0
const loadOptions = async () => {
  const ref = props.reference
  if (!ref) return
  const id = ++reqId
  pending.value = true
  try {
    if ('method' in ref) {
      const { items } = await dataApi.getReferenceOptions(ref.method, { search: search.value || undefined })
      if (id !== reqId) return
      loadedOptions.value = items.map(normalizeOption)
    } else {
      await loadPageMeta(ref)
      const { items } = await dataApi.getData(ref.page, { take: 20, search: search.value || undefined })
      if (id !== reqId) return
      loadedOptions.value = items.map((row) => toOption(row, ref.label))
    }
  } finally {
    if (id === reqId) pending.value = false
  }
}

// Static options are filtered client-side; reference options are filtered
// server-side (loadOptions re-fetches with the query).
const filteredStatic = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return staticOptions.value
  return staticOptions.value.filter(o => o.label.toLowerCase().includes(q))
})
const resolvedOptions = computed(() => {
  const base = props.reference ? loadedOptions.value : filteredStatic.value
  const excluded = props.excludeValues
  if (!excluded || excluded.length === 0) return base
  return base.filter(o => !excluded.includes(o.value))
})

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
  const ref = props.reference
  if (!ref || model.value == null) { resolvedLabel.value = null; return }
  if (resolvedOptions.value.some(o => o.value === model.value)) return
  if ('method' in ref) {
    try {
      const { items } = await dataApi.getReferenceOptions(ref.method, { value: model.value })
      const opts = items.map(normalizeOption)
      const found = opts.find(o => o.value === model.value) ?? opts[0]
      resolvedLabel.value = found ? found.label : null
    } catch { resolvedLabel.value = null }
    return
  }
  await loadPageMeta(ref)
  if (!itemAccess.value) { resolvedLabel.value = null; return }
  try {
    const row = await dataApi.getItemData(ref.page, model.value)
    resolvedLabel.value = row ? String((row as any)[ref.label] ?? '') : null
  } catch { resolvedLabel.value = null }
}

// --- Dropdown positioning (teleported to body, so it escapes any clipping
// container). Recomputed on open; scrolling/resizing closes the dropdown, so a
// single measurement is enough. ---
const dropdownStyle = ref<CSSProperties>({})
const positionDropdown = () => {
  const el = rootRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const GAP = 4
  const MAX_H = 264
  const MIN_W = 180
  const spaceBelow = window.innerHeight - r.bottom
  const flipUp = spaceBelow < MAX_H && r.top > spaceBelow
  // At least MIN_W wide so narrow controls (e.g. inline filter pills) still get
  // a readable list; never wider than fits the viewport from the left edge.
  const width = Math.min(Math.max(r.width, MIN_W), window.innerWidth - r.left - 8)
  dropdownStyle.value = {
    position: 'fixed',
    left: `${r.left}px`,
    minWidth: `${width}px`,
    maxWidth: `calc(100vw - ${r.left + 8}px)`,
    ...(flipUp
      ? { bottom: `${window.innerHeight - r.top + GAP}px` }
      : { top: `${r.bottom + GAP}px` }),
  }
}

// --- Interactions ---
const onControlClick = () => {
  if (open.value) return
  open.value = true
  if (props.reference && loadedOptions.value.length === 0) loadOptions()
  nextTick(() => { positionDropdown(); searchRef.value?.focus() })
}

const close = () => {
  open.value = false
  search.value = ''
}

const select = (value: any, option: SelectOption | null = null) => {
  model.value = value
  emit('select', option)
  close()
}

let debounce: ReturnType<typeof setTimeout>
watch(search, () => {
  if (!props.reference) return
  clearTimeout(debounce)
  debounce = setTimeout(loadOptions, 250)
})

// Resolve the label for a value supplied from outside (opening an edit form).
watch(model, resolveSelectedLabel, { immediate: true })
</script>

<style lang="sass">
.v-select-input
  min-width: 200px

  .v-form-control__outline
    height: var(--control-height, 36px)

.v-select-input__control
  position: relative
  display: flex
  align-items: center
  flex-grow: 1
  height: 100%
  padding: 0 10px 0 12px
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

.v-select-input__search
  flex-grow: 1
  min-width: 0
  height: 100%
  border: none
  background: none
  outline: none
  color: var(--text-color)
  font-size: 13px
  font-family: inherit
  padding: 0

  &::placeholder
    color: var(--placeholder-color)

.v-select-input__arrow
  width: 16px
  height: 16px
  color: var(--text-secondary-color)
  transition: transform 0.12s
  flex-shrink: 0

// --- Teleported dropdown + scrim ---
.v-select-input__scrim
  position: fixed
  inset: 0
  z-index: 2100

.v-select-input__dropdown
  z-index: 2101
  background: var(--popover-color)
  border: 1px solid var(--input-border-color)
  border-radius: 10px
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35)
  padding: 4px
  box-sizing: border-box

.v-select-input__options
  max-height: 256px
  overflow-y: auto
  display: flex
  flex-direction: column
  gap: 1px

.v-select-input__option
  display: flex
  align-items: center
  gap: 8px
  text-align: left
  background: none
  border: none
  padding: 8px 10px
  border-radius: 6px
  cursor: pointer
  color: var(--text-color)
  font-size: 13px
  font-weight: 450

  &:hover
    background-color: var(--hover-color)

  &.active
    background-color: var(--selected-color)

.v-select-input__option-label
  flex-grow: 1
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.v-select-input__check
  width: 15px
  height: 15px
  flex-shrink: 0
  color: var(--primary-color)

.v-select-input__clear
  color: var(--text-secondary-color)

.v-select-input__empty
  padding: 8px 10px
  color: var(--text-secondary-color)
  font-size: 13px
</style>

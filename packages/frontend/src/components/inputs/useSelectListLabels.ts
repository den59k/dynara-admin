import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { dataApi } from '../../api/dataApi'
import type { SelectOption, SelectReference } from './getInput'

// The select source every multi-value input accepts (mirrors VSelectInput):
// the options/enum/reference trio plus the keyed display metadata over `enum`.
export type SelectSourceProps = {
  options?: SelectOption[]
  enum?: (string | number)[]
  enumLabels?: Record<string | number, string>
  enumColors?: Record<string | number, string>
  reference?: SelectReference
}

// Builds the static option list of a select source: explicit `options` win;
// otherwise enum values become options, displayed through the keyed
// `enumLabels`/`enumColors` metadata (missing keys fall back to the raw value
// and no color).
export const staticOptionsOf = (props: SelectSourceProps): SelectOption[] =>
  props.options ?? props.enum?.map((v) => ({
    value: v,
    label: props.enumLabels?.[v] ?? String(v),
    color: props.enumColors?.[v],
  })) ?? []

// Label/color resolution shared by the multi-value select inputs
// (VSelectListInput, VSelectChipsInput). Values picked in this session get
// their option cached via `cacheLabel` (the embedded select's `select` event
// carries it); values supplied from outside (opening an edit form) are
// resolved through the reference and cached. Method references get one batched
// request (`values`); anything the method didn't return — typically a host
// handler that doesn't handle `values` yet — falls back to per-`value`
// lookups, which every reference handler supports. Page references stay
// per-id: pages have no batch by-id endpoint.
export const useSelectListLabels = (props: SelectSourceProps, items: Ref<any[]>) => {
  const staticOptions = computed(() => staticOptionsOf(props))
  const resolvedLabels = ref(new Map<any, string>())
  const resolvedColors = ref(new Map<any, string>())

  const labelFor = (value: any): string => {
    const found = staticOptions.value.find(o => o.value === value)
    return found?.label ?? resolvedLabels.value.get(value) ?? String(value)
  }

  // The value's chip/badge color, if any source declared one (enumColors, an
  // options entry, or a reference method returning `color` on its options).
  const colorFor = (value: any): string | undefined => {
    const found = staticOptions.value.find(o => o.value === value)
    return found?.color ?? resolvedColors.value.get(value)
  }

  const cacheLabel = (value: any, label: string, color?: string) => {
    resolvedLabels.value.set(value, label)
    if (color != null) resolvedColors.value.set(value, color)
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

  const resolveOption = async (value: any): Promise<SelectOption | null> => {
    const ref = props.reference
    if (!ref) return null
    if ('method' in ref) {
      try {
        const { items } = await dataApi.getReferenceOptions(ref.method, { value })
        const found = items.find(o => o.value === value) ?? items[0]
        return found ? { value, label: String(found.label ?? ''), color: found.color } : null
      } catch { return null }
    }
    await loadPageMeta(ref)
    if (!itemAccess.value) return null
    try {
      const row = await dataApi.getItemData(ref.page, value)
      return row ? { value, label: String((row as any)[ref.label] ?? '') } : null
    } catch { return null }
  }

  const resolveOptionInto = (value: any) => {
    resolveOption(value).then((opt) => {
      if (opt != null) cacheLabel(value, opt.label, opt.color)
    })
  }

  const resolveMissing = async (missing: any[]) => {
    const ref = props.reference!
    if ('method' in ref) {
      let unresolved = missing
      try {
        const { items } = await dataApi.getReferenceOptions(ref.method, { values: missing })
        const byValue = new Map(items.map(o => [o.value, o]))
        unresolved = []
        for (const value of missing) {
          const opt = byValue.get(value)
          if (opt != null) cacheLabel(value, String(opt.label ?? ''), opt.color)
          else unresolved.push(value)
        }
      } catch { /* fall through to per-value lookups */ }
      for (const value of unresolved) resolveOptionInto(value)
      return
    }
    for (const value of missing) resolveOptionInto(value)
  }

  watch(items, (values) => {
    if (!props.reference) return
    const missing = values.filter((v) => v != null && !resolvedLabels.value.has(v))
    if (missing.length === 0) return
    // Seed placeholders synchronously so a re-triggered watch never refetches.
    for (const value of missing) resolvedLabels.value.set(value, String(value))
    resolveMissing(missing)
  }, { immediate: true })

  return { labelFor, colorFor, cacheLabel }
}

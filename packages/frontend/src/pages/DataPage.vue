<template>
  <header v-if="tableData" class="data-page__header">
    <h1>{{ tableData.title }}</h1>
    <span v-if="total != null" class="data-page__count">{{ total }}</span>
  </header>
  <component v-if="customComponent" :is="customComponent" />

  <!-- Everything table-related lives in one framed card: a toolbar header
       (create + page actions + search + filters), the table itself, and a
       pagination footer — no controls floating on the page background. -->
  <div v-if="tableData && (tableData.table || !tableData.component)" class="data-card">
    <div v-if="hasToolbar || selectedItems.length > 0" class="data-card__toolbar">
      <template v-if="hasToolbar">
        <VButton v-if="tableData.createForm" @click="addItem">
          <VIcon icon="add" /> {{ t('data.add') }}
        </VButton>
        <VButton
          v-for="action in toolbarActions"
          :key="action.name"
          outline
          :class="{ danger: action.danger }"
          @click="invokeAction(action, {})"
        >
          <VIcon v-if="action.icon" :icon="action.icon" /> {{ action.title }}
        </VButton>
        <div v-if="tableData.search" class="data-card__search">
          <VIcon icon="search" class="data-card__search-icon" />
          <input v-model="searchInput" :placeholder="t('data.search')" />
          <VIconButton v-if="searchInput" icon="close" @click="searchInput = ''" />
        </div>
        <FilterBar
          v-if="tableData.filters"
          :schema="tableData.filters.schema"
          :model-value="filter"
          @update:model-value="setFilter"
        />
      </template>
      <!-- Selection mode overlays the toolbar (same box, higher layer), so
           checking rows never shifts the layout and the search/filter state
           underneath survives untouched. -->
      <div v-if="selectedItems.length > 0" class="data-card__selection">
        <VIconButton icon="close" :title="t('data.clearSelection')" @click="selectedItems = []" />
        <span class="data-card__selection-count">{{ t('data.selected', { count: selectedItems.length }) }}</span>
        <VButton
          v-for="action in bulkActions"
          :key="action.name"
          small
          outline
          :class="{ danger: action.danger }"
          @click="invokeAction(action, { itemIds: selectedIds })"
        >
          <VIcon v-if="action.icon" :icon="action.icon" /> {{ action.title }}
        </VButton>
        <VButton v-if="tableData.allowDelete" small class="danger" @click="deleteItems">
          <VIcon icon="delete" /> {{ t('data.delete', { count: selectedItems.length }) }}
        </VButton>
      </div>
    </div>

    <!-- Error / loading / empty / table, in that precedence. -->
    <div v-if="error" class="data-card__state">
      <p>{{ errorMessage }}</p>
      <VButton outline @click="retry">{{ t('data.retry') }}</VButton>
    </div>
    <div v-else-if="pending && !data" class="data-card__state data-card__state--muted">
      {{ t('data.loading') }}
    </div>
    <template v-else-if="data">
      <VTable
        v-if="data.items.length > 0"
        :item-key="tableData.primaryKey"
        :columns="columns"
        :data="data.items"
        :checkable="tableData.allowDelete"
        v-model:checked="selectedItems"
        :row-component="tableData.updateForm? 'button': undefined"
        :sort="sort"
        @update:sort="setSort"
        @itemclick="onRowClick"
      />
      <div v-else class="data-card__state data-card__state--muted">
        <p>{{ hasActiveQuery ? t('data.emptySearch') : t('data.empty') }}</p>
        <VButton v-if="hasActiveQuery" outline @click="clearQuery">{{ t('data.clearSearch') }}</VButton>
        <VButton v-else-if="tableData.createForm" @click="addItem">{{ t('data.add') }}</VButton>
      </div>
      <!-- Numbered pagination when the page has a count; keyset next/prev when
           it doesn't (total unknown). -->
      <div v-if="tableData.hasCount && total != null && total > pageSize" class="data-card__footer">
        <VPagination
          :page="page"
          :page-size="pageSize"
          :total="total"
          @update:page="setPage"
        />
      </div>
      <div v-else-if="!tableData.hasCount && (canPrev || canNext)" class="data-card__footer">
        <VCursorPagination :has-prev="canPrev" :has-next="canNext" @prev="prevPage" @next="nextPage" />
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { mutateRequestFull, useRequestWatch } from 'vuesix';
import { dataApi, type ActionMeta, type ListParams } from '../api/dataApi';
import { UI_BASE, HTTPError } from '../api/request';
import { HOME_VIEW_ID } from '../constants';
import { t } from '../i18n';
import { useRoute, useRouter } from 'vue-router';
import { computed, shallowRef, watch } from 'vue';
import VButton from '../components/VButton.vue';
import VIcon from '../components/VIcon.vue';
import VIconButton from '../components/VIconButton.vue';
import { useDialog } from '../components/VDialogProvider.vue';
import { useToast } from '../components/VToastProvider.vue';
import AddItemDialog from '../components/dialogs/AddItemDialog.vue';
import ActionDialog from '../components/dialogs/ActionDialog.vue';
import FilterBar from '../components/FilterBar.vue';
import VTable, { type SortState, type TableColumn } from '../components/VTable.vue';
import VPagination from '../components/VPagination.vue';
import VCursorPagination from '../components/VCursorPagination.vue';
import ConfirmDialog from '../components/dialogs/ConfirmDialog.vue';

const currentRoute = useRoute()
const router = useRouter()
const viewId = computed(() => currentRoute.params.viewId as string ?? HOME_VIEW_ID)

const pageSize = 20

// The route query is the single source of truth for list state, so deep links,
// refresh, and the browser back/forward buttons all just work.
//   ?page=2   (1-based)   ?sort=name / ?sort=-name   ?q=alice
const page = computed(() => Math.max(0, (Number(currentRoute.query.page) || 1) - 1))
const sort = computed<SortState | undefined>(() => {
  const raw = currentRoute.query.sort as string | undefined
  if (!raw) return undefined
  return raw.startsWith('-') ? { field: raw.slice(1), dir: 'desc' } : { field: raw, dir: 'asc' }
})
const search = computed(() => (currentRoute.query.q as string) ?? '')
const filter = computed<Record<string, any>>(() => {
  const raw = currentRoute.query.filter as string | undefined
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
})

// Merge a patch into the current query, dropping empty values, and replace the
// URL (no history entry per keystroke/sort).
const setQuery = (patch: Record<string, string | undefined>) => {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...currentRoute.query, ...patch })) {
    if (value != null && value !== '') query[key] = String(value)
  }
  router.replace({ query })
}
const setPage = (p: number) => setQuery({ page: p > 0 ? String(p + 1) : undefined })
const setSort = (s: SortState | undefined) =>
  setQuery({ sort: s ? (s.dir === 'desc' ? '-' + s.field : s.field) : undefined, page: undefined })
const setSearch = (q: string) => setQuery({ q: q || undefined, page: undefined })
const setFilter = (next: Record<string, any>) =>
  setQuery({ filter: Object.keys(next).length ? JSON.stringify(next) : undefined, page: undefined })

// True when a search term or any filter is narrowing the list — drives the
// "Nothing found" empty state and its clear action.
const hasActiveQuery = computed(() => !!search.value || Object.keys(filter.value).length > 0)
const clearQuery = () => {
  searchInput.value = ''
  setQuery({ q: undefined, filter: undefined, page: undefined })
}

// Debounce the search box into the query; keep the box in sync when the query
// changes elsewhere (navigation, back button).
const searchInput = shallowRef<string>(search.value)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setSearch(value), 300)
})
watch(search, (value) => { if (value !== searchInput.value) searchInput.value = value })

const { data: tableData } = useRequestWatch(dataApi.getPageData, viewId)

// Pages without a `.count()` paginate by keyset: no total, just next/prev.
// `cursorStack` holds the boundary cursor for each page we've stepped past; its
// last entry is the current page's cursor (empty = first page). The stack resets
// whenever the query (sort/search/filter) changes, sending us back to page one.
const cursorMode = computed(() => !!tableData.value && !tableData.value.hasCount)
const cursorStack = shallowRef<any[]>([])
const currentCursor = computed(() => cursorStack.value[cursorStack.value.length - 1])
watch(
  () => [viewId.value, sort.value, search.value, JSON.stringify(filter.value)],
  () => { cursorStack.value = [] },
)

const listParams = computed<ListParams>(() => ({
  take: pageSize,
  // Numbered mode positions by skip; keyset mode positions by cursor.
  skip: cursorMode.value ? undefined : page.value * pageSize,
  cursor: cursorMode.value ? currentCursor.value : undefined,
  sort: sort.value,
  search: search.value || undefined,
  filter: Object.keys(filter.value).length ? filter.value : undefined,
}))

const { data, pending, error } = useRequestWatch(dataApi.getData, viewId, listParams)

// Keyset next/prev availability. A full page implies there may be more; any
// stack depth means there's a page to go back to.
const canNext = computed(() => (data.value?.items.length ?? 0) >= pageSize)
const canPrev = computed(() => cursorStack.value.length > 0)
const nextPage = () => {
  const items = data.value?.items ?? []
  if (items.length < pageSize) return
  const lastId = items[items.length - 1][tableData.value!.primaryKey]
  cursorStack.value = [...cursorStack.value, lastId]
}
const prevPage = () => { cursorStack.value = cursorStack.value.slice(0, -1) }

// The unpaginated total, fetched separately for pages that declared `.count()`.
// It only depends on search/filter — never on the page — so flipping pages does
// not recompute the (potentially expensive) count.
const total = shallowRef<number | null>(null)
const loadCount = async () => {
  if (!tableData.value?.hasCount) { total.value = null; return }
  try {
    const res = await dataApi.getCount(viewId.value, {
      search: search.value || undefined,
      filter: Object.keys(filter.value).length ? filter.value : undefined,
    })
    total.value = res.total
  } catch {
    total.value = null
  }
}
watch(
  () => [viewId.value, tableData.value?.hasCount, search.value, JSON.stringify(filter.value)],
  loadCount,
  { immediate: true },
)

const errorMessage = computed(() => {
  const e = error.value
  if (e instanceof HTTPError && typeof e.body === 'string' && e.body) return e.body
  return t('data.error')
})
// Revalidate the list and, since a mutation can change the row count, the total.
const retry = () => { mutateRequestFull(dataApi.getData); loadCount() }

const dialog = useDialog()
const toast = useToast()

const refresh = () => { mutateRequestFull(dataApi.getData); loadCount() }

// Actions split by kind. Row actions become trailing table columns; toolbar and
// bulk actions render as buttons in the toolbar.
const rowActions = computed(() => (tableData.value?.actions ?? []).filter(a => a.kind === 'row'))
const toolbarActions = computed(() => (tableData.value?.actions ?? []).filter(a => a.kind === 'toolbar'))
const bulkActions = computed(() => (tableData.value?.actions ?? []).filter(a => a.kind === 'bulk'))

// Whether the card has a header row at all (create / page actions / search / filters).
const hasToolbar = computed(() => {
  const meta = tableData.value
  if (!meta) return false
  return !!meta.createForm || !!meta.search || !!meta.filters || toolbarActions.value.length > 0
})

// The table's own columns plus a single trailing "⋯" menu cell holding every
// row action — long action titles live in the dropdown, not in the row.
const columns = computed<TableColumn<any>[]>(() => {
  const base = tableData.value?.table ?? []
  if (rowActions.value.length === 0) return base
  const menuColumn: TableColumn<any> = {
    title: '',
    width: 56,
    menu: rowActions.value.map((action) => ({
      title: action.title || action.name,
      icon: action.icon,
      danger: action.danger,
      onClick: (id: any) => invokeAction(action, { itemId: id }),
    })),
  }
  return [...base, menuColumn]
})

// Runs an action: opens a form dialog when it has a form, a confirm dialog when
// it declares `confirm`, or fires immediately. Shows the returned message as a toast.
const invokeAction = (action: ActionMeta, target: { itemId?: any, itemIds?: any[] }) => {
  if (action.form) {
    dialog.open(ActionDialog, { viewId: viewId.value, action: action as any, ...target, onDone: refresh })
    return
  }
  const run = async () => {
    try {
      const res = await dataApi.runAction(viewId.value, action.name, target)
      if (res?.message) toast.success(res.message)
      refresh()
    } catch (e: any) {
      toast.error(typeof e?.body === 'string' ? e.body : t('common.error'))
      throw e
    }
  }
  if (action.confirm) {
    dialog.open(ConfirmDialog, {
      title: action.title,
      text: action.confirm,
      confirmTitle: action.title,
      danger: action.danger,
      onConfirm: run,
    })
  } else {
    run()
  }
}

const addItem = () => {
  dialog.open(AddItemDialog, {
    viewId: viewId.value,
    schema: tableData.value!.createForm.schema,
    primaryKey: tableData.value!.primaryKey,
    itemAccess: tableData.value!.itemAccess,
    onDone: refresh,
  })
}

const onRowClick = (item: any) => {
  if (!tableData.value?.updateForm) return
  dialog.open(AddItemDialog, {
    viewId: viewId.value,
    schema: tableData.value!.updateForm.schema,
    primaryKey: tableData.value!.primaryKey,
    itemAccess: tableData.value!.itemAccess,
    item,
    onDone: refresh,
  })
}

const selectedItems = shallowRef<any[]>([])
const selectedIds = computed(() => selectedItems.value.map((item: any) => item[tableData.value!.primaryKey]))
watch(data, () => {
  selectedItems.value = []
})

const customComponent = shallowRef<any>(null)
watch(tableData, async (tableData) => {
  if (tableData && tableData.component) {
    const jwt = window.localStorage.getItem("dynara-admin__token")
    const suffix = jwt ? `?token=${encodeURIComponent(jwt)}` : ''
    const { default: component } = await import(/* @vite-ignore */ `${UI_BASE}/custom/${tableData.component}${suffix}`)
    customComponent.value = component
  } else {
    customComponent.value = null
  }
}, { immediate: true })

const deleteItems = async () => {
  const ids = selectedIds.value
  dialog.open(ConfirmDialog, {
    title: t('confirm.deleteTitle', { count: ids.length }),
    text: t('confirm.irreversible'),
    confirmTitle: t('confirm.delete'),
    danger: true,
    async onConfirm() {
      await dataApi.deleteItems(viewId.value, ids)
      await mutateRequestFull(dataApi.getData)
      loadCount()
    }
  })
}

</script>

<style lang="sass">
.data-page__header
  display: flex
  align-items: center
  gap: 10px
  margin-bottom: 16px
  min-height: 32px

  h1
    margin: 0

.data-page__count
  font-size: 12px
  font-weight: 600
  color: var(--text-secondary-color)
  background-color: var(--background-active-color)
  border-radius: 999px
  padding: 2px 9px
  line-height: 1.4

// --- The data card: toolbar header / table / pagination footer in one frame ---
.data-card
  border: 1px solid var(--border-color)
  border-radius: 12px
  background-color: var(--paper-color)
  overflow: hidden

.data-card__toolbar
  position: relative
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 8px
  padding: 10px 12px
  // Keeps the row 56px tall even when it only hosts the selection overlay
  // (pages with delete but no search/create).
  min-height: 36px
  border-bottom: 1px solid var(--border-color)

.data-card__search
  display: flex
  align-items: center
  height: 36px
  box-sizing: border-box
  padding: 0 6px 0 12px
  border: 1px solid var(--input-border-color)
  background-color: var(--input-background)
  border-radius: 8px
  gap: 8px
  // Grows into the free toolbar space, within reason.
  flex: 1 1 220px
  min-width: 180px
  max-width: 340px
  transition: border-color 0.12s, box-shadow 0.12s

  &:focus-within
    border-color: var(--primary-color)
    box-shadow: 0 0 0 3px var(--shadow-color)

  .data-card__search-icon
    width: 16px
    height: 16px
    color: var(--text-secondary-color)
    flex-shrink: 0

  input
    flex: 1 1 auto
    background: none
    border: none
    outline: none
    color: var(--text-color)
    font-size: 13px
    min-width: 0

    &::placeholder
      color: var(--placeholder-color)

  .v-icon-button
    width: 24px
    height: 24px

    svg
      width: 14px
      height: 14px

// Selection mode covers the toolbar in place: same box, so the layout never
// shifts, and the search/filter inputs stay mounted underneath.
.data-card__selection
  position: absolute
  inset: 0
  z-index: 3
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 8px
  padding: 0 12px
  background-color: color-mix(in srgb, var(--primary-color) 7%, var(--paper-color))

  .v-icon-button
    color: var(--text-secondary-color)

    &:hover
      color: var(--text-color)

.data-card__selection-count
  font-size: 13px
  font-weight: 550
  margin-right: 8px

.data-card__state
  padding: 56px 24px
  display: flex
  flex-direction: column
  align-items: center
  gap: 14px
  text-align: center

  &.data-card__state--muted
    color: var(--text-secondary-color)

  p
    margin: 0

.data-card__footer
  display: flex
  align-items: center
  padding: 8px 10px
  border-top: 1px solid var(--border-color)

@media (max-width: 800px)
  // The search box takes whatever row space the wrapping toolbar gives it.
  .data-card__search
    max-width: none

  .data-card__footer
    flex-wrap: wrap

</style>

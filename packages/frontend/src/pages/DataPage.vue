<template>
  <h1>{{ tableData?.title }}<br/></h1>
  <component v-if="customComponent" :is="customComponent" />

  <div class="data-page__toolbar">
    <div v-if="tableData?.search" class="data-page__search">
      <VIcon icon="list" class="data-page__search-icon" />
      <input v-model="searchInput" :placeholder="t('data.search')" />
      <VIconButton v-if="searchInput" icon="close" @click="searchInput = ''" />
    </div>
    <div class="data-page__toolbar-spacer" />
    <!-- Bulk actions + delete appear once rows are checked; otherwise the
         create button and any page-level (toolbar) actions. -->
    <template v-if="selectedItems.length > 0">
      <VButton
        v-for="action in bulkActions"
        :key="action.name"
        outline
        :class="{ danger: action.danger }"
        @click="invokeAction(action, { itemIds: selectedIds })"
      >
        <VIcon v-if="action.icon" :icon="action.icon" /> {{ action.title }}
      </VButton>
      <VButton v-if="tableData?.allowDelete" class="danger" @click="deleteItems">
        <VIcon icon="delete" /> {{ t('data.delete', { count: selectedItems.length }) }}
      </VButton>
    </template>
    <template v-else>
      <VButton
        v-for="action in toolbarActions"
        :key="action.name"
        outline
        :class="{ danger: action.danger }"
        @click="invokeAction(action, {})"
      >
        <VIcon v-if="action.icon" :icon="action.icon" /> {{ action.title }}
      </VButton>
      <VButton v-if="tableData?.createForm" @click="addItem">{{ t('data.add') }}</VButton>
    </template>
  </div>

  <VTable
    v-if="tableData && data"
    :item-key="tableData.primaryKey"
    class="data-page__table"
    :columns="columns"
    :data="data.items"
    :checkable="tableData.allowDelete"
    v-model:checked="selectedItems"
    :row-component="tableData.updateForm? 'button': undefined"
    v-model:sort="sort"
    @itemclick="onRowClick"
  />
  <div v-if="data && data.total > pageSize" class="data-page__pagination">
    <VButton flat :disabled="page === 0" @click="page--">{{ t('pager.prev') }}</VButton>
    <span>{{ t('pager.range', { from: page * pageSize + 1, to: Math.min((page + 1) * pageSize, data.total), total: data.total }) }}</span>
    <VButton flat :disabled="(page + 1) * pageSize >= data.total" @click="page++">{{ t('pager.next') }}</VButton>
  </div>
</template>

<script lang="ts" setup>
import { mutateRequestFull, useRequestWatch } from 'vuesix';
import { dataApi, type ActionMeta, type ListParams } from '../api/dataApi';
import { UI_BASE } from '../api/request';
import { HOME_VIEW_ID } from '../constants';
import { t } from '../i18n';
import { useRoute } from 'vue-router';
import { computed, shallowRef, watch } from 'vue';
import VButton from '../components/VButton.vue';
import VIcon from '../components/VIcon.vue';
import VIconButton from '../components/VIconButton.vue';
import { useDialog } from '../components/VDialogProvider.vue';
import { useToast } from '../components/VToastProvider.vue';
import AddItemDialog from '../components/dialogs/AddItemDialog.vue';
import ActionDialog from '../components/dialogs/ActionDialog.vue';
import VTable, { type SortState, type TableColumn } from '../components/VTable.vue';
import ConfirmDialog from '../components/dialogs/ConfirmDialog.vue';

const currentRoute = useRoute()
const viewId = computed(() => currentRoute.params.viewId as string ?? HOME_VIEW_ID)

const pageSize = 20
const page = shallowRef(0)
const sort = shallowRef<SortState | undefined>(undefined)

// The committed search term (debounced from `searchInput`).
const search = shallowRef<string>('')
const searchInput = shallowRef<string>('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { search.value = value; page.value = 0 }, 300)
})

// Reset paging/sorting/search whenever the active view changes.
watch(viewId, () => { page.value = 0; sort.value = undefined; searchInput.value = ''; search.value = '' })
// Any sort change returns to the first page.
watch(sort, () => { page.value = 0 })

const listParams = computed<ListParams>(() => ({
  take: pageSize,
  skip: page.value * pageSize,
  sort: sort.value,
  search: search.value || undefined,
}))

const { data: tableData } = useRequestWatch(dataApi.getPageData, viewId)
const { data } = useRequestWatch(dataApi.getData, viewId, listParams)

const dialog = useDialog()
const toast = useToast()

const refresh = () => mutateRequestFull(dataApi.getData)

// Actions split by kind. Row actions become trailing table columns; toolbar and
// bulk actions render as buttons in the toolbar.
const rowActions = computed(() => (tableData.value?.actions ?? []).filter(a => a.kind === 'row'))
const toolbarActions = computed(() => (tableData.value?.actions ?? []).filter(a => a.kind === 'toolbar'))
const bulkActions = computed(() => (tableData.value?.actions ?? []).filter(a => a.kind === 'bulk'))

// The table's own columns plus one trailing action column per row action.
const columns = computed<TableColumn<any>[]>(() => {
  const base = tableData.value?.table ?? []
  const actionCols = rowActions.value.map((action): TableColumn<any> => ({
    title: '',
    width: action.icon && !action.title ? 48 : 120,
    icon: action.icon,
    text: action.icon ? undefined : action.title,
    onClick: (id: any) => invokeAction(action, { itemId: id }),
  }))
  return [...base, ...actionCols]
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
    async onConfirm() {
      await dataApi.deleteItems(viewId.value, ids)
      await mutateRequestFull(dataApi.getData)
    }
  })
}

</script>

<style lang="sass">
.data-page__toolbar
  display: flex
  align-items: center
  gap: 8px
  margin-top: 12px

  .data-page__toolbar-spacer
    flex: 1 1 auto

  .v-button.danger
    background-color: var(--error-color)
    color: white
    border-color: transparent

    &:hover
      background-color: color-mix(in srgb, var(--error-color) 88%, white)

    &.outline
      background: none
      color: var(--error-color)
      border: 1px solid color-mix(in srgb, var(--error-color) 40%, transparent)

      &:hover
        background-color: color-mix(in srgb, var(--error-color) 12%, transparent)

.data-page__search
  display: flex
  align-items: center
  height: 38px
  padding: 0 6px 0 12px
  border: 1px solid var(--input-border-color)
  border-radius: 8px
  gap: 6px
  min-width: 240px

  .data-page__search-icon
    width: 15px
    height: 15px
    color: var(--text-secondary-color)
    flex-shrink: 0

  input
    flex: 1 1 auto
    background: none
    border: none
    outline: none
    color: var(--text-color)
    font-size: 13px

    &::placeholder
      color: var(--placeholder-color)

.data-page__table
  margin-top: 12px
  border-radius: 12px
  flex: 1 1 auto
  border: 1px solid var(--border-color)

  .v-table__header
    border-radius: 12px 12px 0 0

.data-page__pagination
  display: flex
  align-items: center
  gap: 12px
  margin-top: 12px
  font-size: 14px
  color: var(--text-secondary-color)

</style>

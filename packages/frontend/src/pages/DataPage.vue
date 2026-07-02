<template>
  <h1>{{ tableData?.title }}<br/></h1>
  <component v-if="customComponent" :is="customComponent" />
  <VButton v-if="selectedItems.length > 0 && tableData?.allowDelete" @click="deleteItems">
    <VIcon icon="delete" /> Удалить {{ selectedItems.length > 1? "элементы": "элемент" }}
  </VButton>
  <VButton v-else-if="tableData?.createForm" @click="addItem">Добавить элемент</VButton>
  <VTable
    v-if="tableData && data"
    :item-key="tableData.primaryKey"
    class="data-page__table"
    :columns="tableData.table"
    :data="data.items"
    :checkable="tableData.allowDelete"
    v-model:checked="selectedItems"
    :row-component="tableData.updateForm? 'button': undefined"
    v-model:sort="sort"
    @itemclick="onRowClick"
  />
  <div v-if="data && data.total > pageSize" class="data-page__pagination">
    <VButton flat :disabled="page === 0" @click="page--">Назад</VButton>
    <span>{{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, data.total) }} из {{ data.total }}</span>
    <VButton flat :disabled="(page + 1) * pageSize >= data.total" @click="page++">Вперёд</VButton>
  </div>
</template>

<script lang="ts" setup>
import { mutateRequestFull, useRequestWatch } from 'vuesix';
import { dataApi, type ListParams } from '../api/dataApi';
import { UI_BASE } from '../api/request';
import { HOME_VIEW_ID } from '../constants';
import { useRoute } from 'vue-router';
import { computed, shallowRef, watch } from 'vue';
import VButton from '../components/VButton.vue';
import { useDialog } from '../components/VDialogProvider.vue';
import AddItemDialog from '../components/dialogs/AddItemDialog.vue';
import VTable, { type SortState } from '../components/VTable.vue';
import VIcon from '../components/VIcon.vue';
import ConfirmDialog from '../components/dialogs/ConfirmDialog.vue';

const currentRoute = useRoute()
const viewId = computed(() => currentRoute.params.viewId as string ?? HOME_VIEW_ID)

const pageSize = 20
const page = shallowRef(0)
const sort = shallowRef<SortState | undefined>(undefined)

// Reset paging/sorting whenever the active view changes.
watch(viewId, () => { page.value = 0; sort.value = undefined })
// Any sort change returns to the first page.
watch(sort, () => { page.value = 0 })

const listParams = computed<ListParams>(() => ({
  take: pageSize,
  skip: page.value * pageSize,
  sort: sort.value,
}))

const { data: tableData } = useRequestWatch(dataApi.getPageData, viewId)
const { data } = useRequestWatch(dataApi.getData, viewId, listParams)

const dialog = useDialog()

const addItem = () => {
  dialog.open(AddItemDialog, {
    viewId: viewId.value,
    schema: tableData.value!.createForm.schema,
    primaryKey: tableData.value!.primaryKey,
    itemAccess: tableData.value!.itemAccess,
  })
}

const onRowClick = (item: any) => {
  dialog.open(AddItemDialog, {
    viewId: viewId.value,
    schema: tableData.value!.updateForm.schema,
    primaryKey: tableData.value!.primaryKey,
    itemAccess: tableData.value!.itemAccess,
    item,
  })
}

const selectedItems = shallowRef<any[]>([])
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
  const ids = selectedItems.value.map((item: any) => item[tableData.value!.primaryKey])
  dialog.open(ConfirmDialog, {
    title: `Удалить ${ ids.length > 1? "элементы": "элемент" }?`,
    text: "Отменить действие будет невозможно",
    confirmTitle: "Удалить",
    async onConfirm() {
      await dataApi.deleteItems(viewId.value, ids)
      await mutateRequestFull(dataApi.getData)
    }
  })
}

</script>

<style lang="sass">
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

<template>
  <h1>{{ tableData?.title }}<br/></h1>
  <component v-if="customComponent" :is="customComponent" />
  <VButton v-if="selectedItems.length > 0 && tableData?.allowDelete" @click="deleteItems">
    <VIcon icon="delete" /> Удалить {{ selectedItems.length > 1? "элементы": "элемент" }}
  </VButton>
  <VButton v-else-if="data" @click="addItem">Добавить элемент</VButton>
  <VTable 
    v-if="tableData && data" 
    :item-key="tableData.primaryKey"
    class="data-page__table" 
    :columns="tableData.table" 
    :data="data"
    :checkable="tableData.allowDelete"
    v-model:checked="selectedItems"
    :row-component="tableData.updateForm? 'button': undefined"
    @itemclick="onRowClick"
  />
</template>

<script lang="ts" setup>
import { mutateRequest, useRequestWatch } from 'vuesix';
import { dataApi } from '../api/dataApi';
import { useRoute } from 'vue-router';
import { computed, shallowRef, watch } from 'vue';
import VButton from '../components/VButton.vue';
import { useDialog } from '../components/VDialogProvider.vue';
import AddItemDialog from '../components/dialogs/AddItemDialog.vue';
import VTable from '../components/VTable.vue';
import VIcon from '../components/VIcon.vue';
import ConfirmDialog from '../components/dialogs/ConfirmDialog.vue';

const currentRoute = useRoute()
const viewId = computed(() => currentRoute.params.viewId as string ?? '__home__')

const { data: tableData } = useRequestWatch(dataApi.getPageData, viewId)
const { data } = useRequestWatch(dataApi.getData, viewId)

const dialog = useDialog()

const addItem = () => {
  dialog.open(AddItemDialog, { viewId: viewId.value, schema: tableData.value!.createForm.schema })
}

const onRowClick = (item: any) => { 
  dialog.open(AddItemDialog, { 
    viewId: viewId.value, 
    schema: tableData.value!.createForm.schema, 
    item
  })
}

const selectedItems = shallowRef<any[]>([])
watch(data, () => {
  selectedItems.value = []
})

const customComponent = shallowRef<any>(null)
watch(tableData, async (tableData) => {
  if (tableData && tableData.component) {
    const { default: component } = await import(`/admin/custom/${tableData.component}`)
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
      await mutateRequest(dataApi.getData, viewId.value)
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

</style>
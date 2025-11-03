<template>
  <h1>{{ tableData?.title }}<br/></h1>
  <VButton @click="addItem">Добавить элемент</VButton>
  <VTable class="data-page__table" v-if="tableData && data" :columns="tableData.table" :data="data"/>
</template>

<script lang="ts" setup>
import { useRequestWatch } from 'vuesix';
import { dataApi } from '../api/dataApi';
import { useRoute } from 'vue-router';
import { computed } from 'vue';
import VButton from '../components/VButton.vue';
import { useDialog } from '../components/VDialogProvider.vue';
import AddItemDialog from '../components/dialogs/AddItemDialog.vue';
import VTable from '../components/VTable.vue';

const currentRoute = useRoute()
const viewId = computed(() => currentRoute.params.viewId as string)

const { data: tableData } = useRequestWatch(dataApi.getPageData, viewId)
const { data } = useRequestWatch(dataApi.getData, viewId)

const dialog = useDialog()

const addItem = () => {
  dialog.open(AddItemDialog, { viewId: viewId.value, schema: tableData.value.createForm.schema })
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
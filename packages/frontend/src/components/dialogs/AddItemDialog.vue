<template>
  <VDialog style="width: 600px">
    <template #header>{{ props.item? "Редактировать ": "Добавить "}} элемент</template>
    <JsonInput v-model="values" :schema="props.schema" />
    <template #actions>
      <VButton flat @click="dialog.close">Отмена</VButton>
      <VButton :disabled="pending" @click="apply">Добавить</VButton>
    </template>
  </VDialog>
</template>

<script lang="ts" setup>
import { getCurrentInstance, onMounted, reactive } from 'vue';
import { JsonInput } from '../inputs/getInput';
import VButton from '../VButton.vue';
import VDialog from '../VDialog.vue';
import { useDialog } from '../VDialogProvider.vue';
import { mutateRequest, useForm, useRequest } from 'vuesix';
import { dataApi } from '../../api/dataApi';
import { getDefaultValue } from '../../utils/getDefaultValue';

const props = defineProps<{ viewId: string, schema?: any, item?: any, itemId?: string }>()

const dialog = useDialog()

const { data: tableData } = useRequest(dataApi.getPageData, props.viewId)

const { values, handleSubmit, pending, updateDefaultValues } = useForm(props.schema? getDefaultValue(props.schema): {})
if (props.item) {
  updateDefaultValues(props.item)
  if (tableData.value!.itemAccess) {
    dataApi.getItemData(props.viewId, props.item[tableData.value!.primaryKey]).then((resp) => {
      updateDefaultValues(resp)
    })
  }
}

const el = getCurrentInstance()
onMounted(() => {
  el?.vnode.el?.querySelector("input,textarea")?.focus()
})

const apply = handleSubmit(async (values) => {
  if (props.item) {
    await dataApi.updateItem(props.viewId, props.item[tableData.value!.primaryKey], values)
  } else {
    await dataApi.createItem(props.viewId, values)
  }
  mutateRequest(dataApi.getData, props.viewId)
  dialog.close()
})

</script>

<style lang="sass">

</style>
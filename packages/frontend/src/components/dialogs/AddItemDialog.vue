<template>
  <VDialog style="width: 600px">
    <template #header>{{ isEdit? t('dialog.editTitle'): t('dialog.addTitle') }}</template>
    <JsonInput v-model="values" :schema="props.schema" />
    <template #actions>
      <VButton flat @click="dialog.close">{{ t('dialog.cancel') }}</VButton>
      <VButton :disabled="pending" @click="apply">
        {{ isEdit? t('dialog.save'): t('dialog.add') }}
      </VButton>
    </template>
  </VDialog>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted } from 'vue';
import { JsonInput } from '../inputs/getInput';
import VButton from '../VButton.vue';
import VDialog from '../VDialog.vue';
import { useDialog } from '../VDialogProvider.vue';
import { mutateRequestFull, useForm } from 'vuesix';
import { dataApi } from '../../api/dataApi';
import { getDefaultValue } from '../../utils/getDefaultValue';
import { t } from '../../i18n';

const props = defineProps<{
  viewId: string,
  schema?: any,
  item?: any,
  primaryKey?: string,
  itemAccess?: boolean,
}>()

const dialog = useDialog()

const isEdit = computed(() => !!props.item)
const itemId = computed(() => props.item && props.primaryKey ? props.item[props.primaryKey] : undefined)

const { values, handleSubmit, pending, updateDefaultValues } = useForm(props.schema? getDefaultValue(props.schema): {})
if (props.item) {
  updateDefaultValues(props.item)
  // Fetch the full record only when the page exposes single-item access —
  // the row in the table may be a projection of the editable fields.
  if (props.itemAccess && itemId.value != null) {
    dataApi.getItemData(props.viewId, itemId.value).then((resp) => {
      updateDefaultValues(resp)
    })
  }
}

const el = getCurrentInstance()
onMounted(() => {
  el?.vnode.el?.querySelector("input,textarea")?.focus()
})

const apply = handleSubmit(async (values) => {
  if (isEdit.value) {
    await dataApi.updateItem(props.viewId, itemId.value, values)
  } else {
    await dataApi.createItem(props.viewId, values)
  }
  mutateRequestFull(dataApi.getData)
  dialog.close()
})

</script>

<style lang="sass">

</style>

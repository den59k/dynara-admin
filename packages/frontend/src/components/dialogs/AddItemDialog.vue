<template>
  <VDialog style="width: 600px">
    <template #header>Добавить элемент</template>
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
import { useForm } from 'vuesix';
import { dataApi } from '../../api/dataApi';
import { getDefaultValue } from '../../utils/getDefaultValue';

const props = defineProps<{ viewId: string, schema?: any }>()

const dialog = useDialog()

const { values, handleSubmit, pending } = useForm(props.schema? getDefaultValue(props.schema): {})

const el = getCurrentInstance()
onMounted(() => {
  el?.vnode.el?.querySelector("input,textarea")?.focus()
})

const apply = handleSubmit(async (values) => {
  await dataApi.saveItem(props.viewId, values)
  dialog.close()
})

</script>

<style lang="sass">

</style>
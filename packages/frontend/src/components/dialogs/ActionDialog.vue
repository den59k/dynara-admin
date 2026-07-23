<template>
  <VDialog style="width: 520px">
    <template #header>{{ action.title }}</template>
    <JsonInput v-model="values" :schema="action.form.schema" />
    <template #actions>
      <VButton outline @click="dialog.back()">{{ t('dialog.cancel') }}</VButton>
      <VButton :class="{ danger: action.danger }" :disabled="pending" @click="apply">
        {{ action.title }}
      </VButton>
    </template>
  </VDialog>
</template>

<script lang="ts" setup>
import { getCurrentInstance, onMounted, provide, ref } from 'vue'
import { JsonInput } from '../inputs/getInput'
import VButton from '../VButton.vue'
import VDialog from '../VDialog.vue'
import { useDialog, useDialogGuard } from '../VDialogProvider.vue'
import { useToast } from '../VToastProvider.vue'
import { useForm } from 'vuesix'
import { dataApi, type ActionMeta } from '../../api/dataApi'
import { getDefaultValue } from '../../utils/getDefaultValue'
import { FORM_ITEM_KEY } from '../../utils/formItem'
import { t } from '../../i18n'

const props = defineProps<{
  viewId: string,
  action: ActionMeta & { form: { schema: any } },
  // Row action → itemId + item (the targeted row); bulk action → itemIds;
  // toolbar action → neither.
  itemId?: any,
  itemIds?: any[],
  item?: any,
  // Called after a successful run so the caller can refresh the list.
  onDone?: () => void,
}>()

const dialog = useDialog()
const toast = useToast()

// The targeted row, for custom form-field components. Not part of the form
// values and never sent to the action endpoint — the handler gets `itemId`.
provide(FORM_ITEM_KEY, ref(props.item ?? null))

const { values, handleSubmit, pending, hasChange } = useForm(getDefaultValue(props.action.form.schema))
// Ask before discarding a partially filled action form on overlay/Esc/✕/Cancel.
useDialogGuard(() => hasChange.value)

const el = getCurrentInstance()
onMounted(() => {
  el?.vnode.el?.querySelector("input,textarea")?.focus()
})

const apply = handleSubmit(async (values) => {
  const res = await dataApi.runAction(props.viewId, props.action.name, {
    itemId: props.itemId,
    itemIds: props.itemIds,
    data: values,
  })
  if (res?.message) toast.success(res.message)
  props.onDone?.()
  dialog.close()
})
</script>


<template>
  <VDialog style="width: 600px">
    <template #header>{{ isEdit? t('dialog.editTitle'): t('dialog.addTitle') }}</template>
    <JsonInput v-model="values" :schema="props.schema" />
    <template #actions>
      <VButton flat @click="dialog.back()">{{ t('dialog.cancel') }}</VButton>
      <VButton :disabled="pending" @click="apply">
        {{ isEdit? t('dialog.save'): t('dialog.add') }}
      </VButton>
    </template>
  </VDialog>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, provide, ref } from 'vue';
import { JsonInput } from '../inputs/getInput';
import VButton from '../VButton.vue';
import VDialog from '../VDialog.vue';
import { useDialog, useDialogGuard } from '../VDialogProvider.vue';
import { mutateRequestFull, useForm } from 'vuesix';
import { dataApi } from '../../api/dataApi';
import { getDefaultValue } from '../../utils/getDefaultValue';
import { FORM_ITEM_KEY } from '../../utils/formItem';
import { t } from '../../i18n';

const props = defineProps<{
  viewId: string,
  schema?: any,
  item?: any,
  primaryKey?: string,
  itemAccess?: boolean,
  // Called after a successful create/update, so the opener can revalidate
  // anything beyond the list itself (e.g. the separately-fetched total).
  onDone?: () => void,
}>()

const dialog = useDialog()

const isEdit = computed(() => !!props.item)
const itemId = computed(() => props.item && props.primaryKey ? props.item[props.primaryKey] : undefined)

// The persisted record, for custom form-field components (null when creating).
// The form values only ever hold schema-declared fields, so identity (the
// primary key) and other server-only fields travel on this channel instead.
const item = ref(props.item ?? null)
provide(FORM_ITEM_KEY, item)

const { values, handleSubmit, pending, updateDefaultValues, hasChange } = useForm(props.schema? getDefaultValue(props.schema): {})
// Dismissing the dialog (overlay, Esc, ✕, Cancel) with edited values asks for
// confirmation instead of silently dropping them.
useDialogGuard(() => hasChange.value)
if (props.item) {
  updateDefaultValues(props.item)
  // Fetch the full record only when the page exposes single-item access —
  // the row in the table may be a projection of the editable fields.
  if (props.itemAccess && itemId.value != null) {
    dataApi.getItemData(props.viewId, itemId.value).then((resp) => {
      updateDefaultValues(resp)
      // The full record supersedes the row projection, which may still hold
      // list-only columns the item endpoint doesn't return — merge, not replace.
      item.value = { ...props.item, ...resp }
    })
  }
}

const el = getCurrentInstance()
onMounted(() => {
  el?.vnode.el?.querySelector("input,textarea")?.focus()
})

// Display-only component fields never submit a value: the edit dialog merges
// the item's schema-declared keys into the form values, so such a key may hold
// server-provided context (e.g. a related list) that the create/update
// endpoints must not receive.
const componentKeys = Object.entries<any>(props.schema?.properties ?? {})
  .filter(([, s]) => s.type === "component")
  .map(([key]) => key)

const apply = handleSubmit(async (values) => {
  const payload = { ...values }
  for (const key of componentKeys) delete payload[key]
  if (isEdit.value) {
    await dataApi.updateItem(props.viewId, itemId.value, payload)
  } else {
    await dataApi.createItem(props.viewId, payload)
  }
  mutateRequestFull(dataApi.getData)
  props.onDone?.()
  dialog.close()
})

</script>

<style lang="sass">

</style>

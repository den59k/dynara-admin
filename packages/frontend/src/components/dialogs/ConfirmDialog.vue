<template>
  <VDialog>
    <template #header>
      {{ props.title ?? 'Подтвердите действие' }}
    </template>
    <div class="confirm-dialog__text">{{ props.text }}</div>
    <template #actions>
      <VButton outline @click="dialog.back">Отмена</VButton>
      <VButton :disabled="pending" @click="apply">{{ props.confirmTitle ?? 'Применить' }}</VButton>
    </template>
  </VDialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import VButton from '../VButton.vue';
import VDialog from '../VDialog.vue';

const props = defineProps<{
  title?: string,
  text?: string,
  confirmTitle?: string,
  onConfirm?: ConfirmCallback
}>()

const dialog = useDialog()

const pending = ref(false)
const apply = async () => {
  if (!props.onConfirm) {
    return
  }
  try {
    pending.value = true
    await props.onConfirm()
    dialog.back()
  } catch(e){ 
    pending.value = false
  }
}

</script>

<script lang="ts">
import ConfirmDialog from './ConfirmDialog.vue'
import { useDialog } from '../VDialogProvider.vue';

type ConfirmCallback = () => void | Promise<void>

export const deleteProps = {
  title: "Вы действительно хотите удалить элемент?",
  text: "Отменить действие будет невозможно",
  confirmTitle: "Удалить"
}

export const openConfirmDialog = (dialogStore: ReturnType<typeof useDialog>, onConfirm: ConfirmCallback) => {
  dialogStore.open(ConfirmDialog, {
    ...deleteProps,
    onConfirm
  })
}

</script>

<style lang="sass">
.confirm-dialog__text
  white-space: pre-wrap
  min-width: 350px
</style>
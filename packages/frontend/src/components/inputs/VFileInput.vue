<template>
  <VFormControl class="v-file-input" :label="label" :error="displayError" outline>
    <div class="v-file-input__control">
      <span v-if="uploading" class="v-file-input__status">{{ t('file.uploading', { percent }) }}</span>
      <template v-else-if="model">
        <a class="v-file-input__link" :href="model" target="_blank" rel="noopener">{{ fileName }}</a>
        <div class="v-file-input__actions">
          <VButton flat type="button" @click="pick">{{ t('file.replace') }}</VButton>
          <VButton flat type="button" @click="clear">{{ t('file.remove') }}</VButton>
        </div>
      </template>
      <VButton v-else flat type="button" @click="pick">{{ t('file.choose') }}</VButton>
      <input ref="inputRef" type="file" class="v-file-input__native" @change="onChange" />
    </div>
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import VFormControl from '../VFormControl.vue'
import VButton from '../VButton.vue'
import { apiUrl, sendXHR } from '../../api/request'
import { HOME_VIEW_ID } from '../../constants'
import { t } from '../../i18n'

const props = defineProps<{ label?: string, name?: string, error?: string }>()
const model = defineModel<string | null>()

const route = useRoute()
const view = computed(() => (route.params.viewId as string) ?? HOME_VIEW_ID)

const inputRef = ref<HTMLInputElement>()
const uploading = shallowRef(false)
const percent = shallowRef(0)
const localError = shallowRef<string | null>(null)

const displayError = computed(() => localError.value ?? props.error)

const fileName = computed(() => {
  const v = model.value
  if (!v) return ''
  try { return decodeURIComponent(v.split('/').pop() || v) } catch { return v }
})

const pick = () => inputRef.value?.click()
const clear = () => { model.value = null }

const onChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  localError.value = null
  uploading.value = true
  percent.value = 0
  try {
    const fd = new FormData()
    fd.append('file', file)
    if (props.name) fd.append('field', props.name)
    const resp = await sendXHR(apiUrl(`/data/${view.value}/upload`), fd, {
      onProgress: (p) => { percent.value = p },
    })
    model.value = resp?.url ?? null
  } catch {
    localError.value = t('file.error')
  } finally {
    uploading.value = false
    if (inputRef.value) inputRef.value.value = ''
  }
}
</script>

<style lang="sass">
.v-file-input
  min-width: 200px

.v-file-input__control
  display: flex
  align-items: center
  justify-content: space-between
  gap: 8px
  flex-grow: 1
  min-height: 40px
  padding: 0 8px 0 12px
  font-size: 13px

  .v-button
    height: 30px

.v-file-input__link
  color: var(--primary-color)
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.v-file-input__status
  color: var(--text-secondary-color)

.v-file-input__actions
  display: flex
  align-items: center
  gap: 4px
  flex-shrink: 0

.v-file-input__native
  display: none
</style>

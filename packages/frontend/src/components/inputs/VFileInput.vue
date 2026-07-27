<template>
  <VFormControl
    class="v-file-input"
    :class="{ 'v-file-input--image': image, 'v-file-input--empty': !file && !uploading }"
    :label="label"
    :error="displayError"
    :outline="!image"
  >
    <div
      class="v-file-input__control"
      :class="{ dragover }"
      @dragover.prevent="dragover = true"
      @dragenter.prevent="dragover = true"
      @dragleave="dragover = false"
      @drop.prevent="onDrop"
    >
      <!-- Uploading: the picked image previews locally right away, so a slow
           upload shows the picture rather than a bare percentage. -->
      <template v-if="uploading">
        <div v-if="image" class="v-file-input__thumb">
          <img v-if="localPreview" :src="localPreview" alt="" />
        </div>
        <div class="v-file-input__meta">
          <span class="v-file-input__status">{{ t('file.uploading', { percent }) }}</span>
          <div class="v-file-input__progress"><div :style="{ width: percent + '%' }"></div></div>
        </div>
      </template>

      <template v-else-if="file">
        <a
          v-if="preview"
          class="v-file-input__thumb"
          :href="file.src"
          target="_blank"
          rel="noopener"
          :title="name"
        >
          <img :src="preview" alt="" />
        </a>
        <div class="v-file-input__meta">
          <a class="v-file-input__link" :href="file.src" target="_blank" rel="noopener">{{ name }}</a>
          <span v-if="size" class="v-file-input__size">{{ size }}</span>
        </div>
        <div class="v-file-input__actions">
          <VButton flat small type="button" @click="pick">{{ t('file.replace') }}</VButton>
          <VButton flat small type="button" @click="clear">{{ t('file.remove') }}</VButton>
        </div>
      </template>

      <!-- Empty. The image variant is a drop target you can click anywhere in;
           the file variant keeps the compact one-button row. -->
      <template v-else>
        <button v-if="image" type="button" class="v-file-input__dropzone" @click="pick">
          <VIcon icon="add" />
          <span>{{ dragover ? t('file.drop') : t('file.chooseImage') }}</span>
        </button>
        <VButton v-else flat small type="button" @click="pick">
          {{ dragover ? t('file.drop') : t('file.choose') }}
        </VButton>
      </template>

      <input ref="inputRef" type="file" class="v-file-input__native" :accept="acceptAttr" @change="onChange" />
    </div>
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import VFormControl, { type VFormControlProps } from '../VFormControl.vue'
import VButton from '../VButton.vue'
import VIcon from '../VIcon.vue'
import { apiUrl, sendXHR } from '../../api/request'
import { HOME_VIEW_ID } from '../../constants'
import { fileNameOf, formatFileSize, matchesAccept, normalizeFileValue, previewSrcOf } from '../../utils/fileValue'
import { t } from '../../i18n'

const props = defineProps<{
  label?: string,
  name?: string,
  error?: VFormControlProps['error'],
  // The picture-first variant (`format: "image"`): thumbnail preview and a
  // click/drop zone instead of the compact file row.
  image?: boolean,
  // The field stores the whole `{ src, previewSrc?, size? }` structure (it was
  // declared `"file"` / `"image"`) rather than a bare url string.
  structured?: boolean,
  // `accept` for the picker, straight from the schema. The image variant
  // defaults to `image/*` when the schema doesn't narrow it further.
  accept?: string,
}>()
// Either shape, whichever the schema declared — see utils/fileValue.
const model = defineModel<any>()

const route = useRoute()
const view = computed(() => (route.params.viewId as string) ?? HOME_VIEW_ID)

const inputRef = ref<HTMLInputElement>()
const uploading = shallowRef(false)
const percent = shallowRef(0)
const localError = shallowRef<string | null>(null)
const dragover = shallowRef(false)
// Object URL for the file being uploaded, so the preview appears immediately.
const localPreview = shallowRef<string | null>(null)

const file = computed(() => normalizeFileValue(model.value))
const preview = computed(() => previewSrcOf(model.value))
const name = computed(() => fileNameOf(model.value))
const size = computed(() => formatFileSize(file.value?.size))
const displayError = computed(() => localError.value ?? props.error)
const acceptAttr = computed(() => props.accept ?? (props.image ? 'image/*' : undefined))

const pick = () => inputRef.value?.click()
const clear = () => { model.value = null }

const releasePreview = () => {
  if (!localPreview.value) return
  URL.revokeObjectURL(localPreview.value)
  localPreview.value = null
}
onBeforeUnmount(releasePreview)

// What the field keeps. The upload handler answers with whatever it stored —
// the structure or a bare url — and the schema decides which of the two the
// value must be, so each is bridged to the other rather than trusted blindly.
const toFieldValue = (result: any) => {
  if (result == null || result === '') return null
  if (props.structured) return typeof result === 'string' ? { src: result } : result
  return typeof result === 'string' ? result : (normalizeFileValue(result)?.src ?? null)
}

const onChange = (e: Event) => {
  const picked = (e.target as HTMLInputElement).files?.[0]
  if (picked) upload(picked)
  if (inputRef.value) inputRef.value.value = ''
}

const onDrop = (e: DragEvent) => {
  dragover.value = false
  const dropped = e.dataTransfer?.files?.[0]
  if (!dropped) return
  // A drop bypasses the picker's own filter, so `accept` is checked here too.
  if (!matchesAccept(dropped, acceptAttr.value)) {
    localError.value = t('file.wrongType')
    return
  }
  upload(dropped)
}

const upload = async (picked: File) => {
  localError.value = null
  uploading.value = true
  percent.value = 0
  releasePreview()
  if (picked.type.startsWith('image/')) localPreview.value = URL.createObjectURL(picked)
  try {
    const fd = new FormData()
    fd.append('file', picked)
    if (props.name) fd.append('field', props.name)
    const resp = await sendXHR(apiUrl(`/data/${view.value}/upload`), fd, {
      onProgress: (p) => { percent.value = p },
    })
    // `value` is the field value the handler produced; `url` is the older
    // string-only answer, still honored so an existing backend keeps working.
    model.value = toFieldValue(resp?.value ?? resp?.url ?? null)
  } catch {
    localError.value = t('file.error')
  } finally {
    uploading.value = false
    releasePreview()
  }
}
</script>

<style lang="sass">
.v-file-input
  min-width: 200px

.v-file-input__control
  display: flex
  align-items: center
  gap: 8px
  flex-grow: 1
  min-height: var(--control-height, 36px)
  padding: 0 4px 0 12px
  font-size: 13px
  box-sizing: border-box

  .v-button
    height: 28px
    padding: 0 10px

.v-file-input__meta
  display: flex
  flex-direction: column
  justify-content: center
  gap: 2px
  min-width: 0
  flex-grow: 1

.v-file-input__link
  color: var(--text-active-color)
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.v-file-input__size, .v-file-input__status
  color: var(--text-secondary-color)
  font-size: 12px

// Upload progress: a hairline under the status text, so the row doesn't resize
// when an upload starts.
.v-file-input__progress
  height: 3px
  border-radius: 2px
  background-color: var(--input-border-color)
  overflow: hidden

  &>div
    height: 100%
    background-color: var(--primary-color)
    transition: width 0.15s linear

.v-file-input__actions
  display: flex
  align-items: center
  gap: 4px
  flex-shrink: 0
  margin-left: auto

.v-file-input__thumb
  display: flex
  align-items: center
  justify-content: center
  flex-shrink: 0
  width: 36px
  height: 36px
  border-radius: 6px
  overflow: hidden
  background-color: var(--input-background)
  border: 1px solid var(--border-color)

  img
    width: 100%
    height: 100%
    object-fit: cover

.v-file-input__native
  display: none

// The image variant: a framed picture with its actions beside it, and a dashed
// drop zone while empty. No outline — the frame below is the field's border.
.v-file-input--image
  .v-file-input__control
    padding: 8px
    gap: 12px
    border: 1px solid var(--input-border-color)
    border-radius: 8px
    background-color: var(--input-background)
    transition: border-color 0.12s, background-color 0.12s

    &.dragover
      border-color: var(--primary-color)
      border-style: dashed

  .v-file-input__thumb
    width: 72px
    height: 72px
    border-radius: 6px

  &.v-file-input--empty .v-file-input__control
    padding: 0
    border: none
    background: none

.v-file-input__dropzone
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 6px
  flex-grow: 1
  min-height: 96px
  padding: 12px
  border: 1px dashed var(--input-border-color)
  border-radius: 8px
  background-color: var(--input-background)
  color: var(--text-secondary-color)
  font-size: 13px
  cursor: pointer
  transition: border-color 0.12s, color 0.12s

  &:hover
    border-color: var(--primary-color)
    color: var(--text-color)

  svg
    width: 18px
    height: 18px

.v-file-input__control.dragover .v-file-input__dropzone
  border-color: var(--primary-color)
  color: var(--text-color)

.v-form-control.error .v-file-input__control,
.v-form-control.error .v-file-input__dropzone
  border-color: var(--error-color)
</style>

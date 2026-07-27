<template>
  <VDialog class="image-crop-dialog" style="width: 560px">
    <template #header>{{ t('file.cropTitle') }}</template>
    <!-- The whole picture stays visible: what falls outside the selection is
         dimmed rather than hidden, so you can see what you're cutting away. -->
    <div ref="stageRef" class="image-crop-dialog__stage" @pointerdown="onPointerDown">
      <img ref="imageRef" class="image-crop-dialog__image" :src="src" draggable="false" alt="" @load="onLoad" />
      <div v-if="loaded" class="image-crop-dialog__selection" :style="selectionStyle">
        <span class="image-crop-dialog__handle nw" data-corner="nw"></span>
        <span class="image-crop-dialog__handle ne" data-corner="ne"></span>
        <span class="image-crop-dialog__handle sw" data-corner="sw"></span>
        <span class="image-crop-dialog__handle se" data-corner="se"></span>
      </div>
    </div>
    <template #actions>
      <span class="image-crop-dialog__hint">
        {{ props.size[0] }}×{{ props.size[1] }}
        <template v-if="loaded"> · {{ Math.round(crop.width) }}×{{ Math.round(crop.height) }} {{ t('file.cropSource') }}</template>
      </span>
      <VButton flat @click="reset">{{ t('file.cropReset') }}</VButton>
      <VButton outline @click="dialog.back()">{{ t('dialog.cancel') }}</VButton>
      <VButton :disabled="!loaded" @click="apply">{{ t('confirm.apply') }}</VButton>
    </template>
  </VDialog>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue'
import VButton from '../VButton.vue'
import VDialog from '../VDialog.vue'
import { useDialog } from '../VDialogProvider.vue'
import { centeredCrop, cropToFile, moveCrop, resizeCrop, type Corner, type Rect } from '../../utils/cropImage'
import { t } from '../../i18n'

const props = defineProps<{
  // The picture the user picked, the size the field declared for it, and the
  // selection to open on (the crop currently in effect, so re-opening the
  // dialog continues from it instead of starting over).
  file: File,
  size: [number, number],
  rect?: Rect,
  // Called once with the crop, or with null on any dismissal (Cancel, ✕,
  // Escape, the overlay) — the caller is awaiting one of the two.
  onDone?: (result: { file: File, rect: Rect } | null) => void,
}>()

const dialog = useDialog()

const src = shallowRef(URL.createObjectURL(props.file))
const stageRef = ref<HTMLElement>()
const imageRef = ref<HTMLImageElement>()
const loaded = shallowRef(false)

const output = { width: props.size[0], height: props.size[1] }
// The picture's own pixels; the selection is expressed in them, so nothing
// depends on how big the dialog happens to be.
const natural = reactive({ width: 0, height: 0 })
const crop = reactive<Rect>({ x: 0, y: 0, width: 0, height: 0 })
// Image pixels per displayed pixel — the only conversion in play.
const scale = shallowRef(1)

const setCrop = (rect: Rect) => Object.assign(crop, rect)

const measure = () => {
  const image = imageRef.value
  if (!image) return
  scale.value = image.clientWidth / (image.naturalWidth || 1)
}

const onLoad = () => {
  const image = imageRef.value
  if (!image) return
  natural.width = image.naturalWidth
  natural.height = image.naturalHeight
  measure()
  setCrop(props.rect ?? centeredCrop(natural, output))
  loaded.value = true
}

const reset = () => setCrop(centeredCrop(natural, output))

const selectionStyle = computed(() => ({
  left: `${crop.x * scale.value}px`,
  top: `${crop.y * scale.value}px`,
  width: `${crop.width * scale.value}px`,
  height: `${crop.height * scale.value}px`,
}))

// Pointer position in image pixels.
const atImage = (e: PointerEvent) => {
  const box = imageRef.value!.getBoundingClientRect()
  return { x: (e.clientX - box.left) / scale.value, y: (e.clientY - box.top) / scale.value }
}

// `grab` is where inside the selection it was picked up, so the selection
// follows the pointer exactly — and re-attaches to it after being clamped at an
// edge, which tracking movement deltas would not.
let drag: { pointerId: number, corner: Corner | null, grab: { x: number, y: number } } | null = null

const onPointerDown = (e: PointerEvent) => {
  if (!loaded.value) return
  measure()
  const corner = (e.target as HTMLElement).dataset?.corner as Corner | undefined
  const at = atImage(e)
  // Clicking the picture outside the selection recentres it there, which beats
  // dragging all the way across the image.
  if (!corner && e.target === imageRef.value) {
    setCrop(moveCrop(crop, natural, at.x - (crop.x + crop.width / 2), at.y - (crop.y + crop.height / 2)))
  }
  drag = { pointerId: e.pointerId, corner: corner ?? null, grab: { x: at.x - crop.x, y: at.y - crop.y } }
  stageRef.value?.setPointerCapture(e.pointerId)
  e.preventDefault()
}

const onPointerMove = (e: PointerEvent) => {
  if (!drag || drag.pointerId !== e.pointerId) return
  const at = atImage(e)
  if (drag.corner) {
    setCrop(resizeCrop(crop, natural, output, drag.corner, at.x, at.y))
  } else {
    // moveCrop with no delta is just the clamp, which is all this needs.
    setCrop(moveCrop({ ...crop, x: at.x - drag.grab.x, y: at.y - drag.grab.y }, natural, 0, 0))
  }
}

const onPointerUp = (e: PointerEvent) => {
  if (!drag || drag.pointerId !== e.pointerId) return
  stageRef.value?.releasePointerCapture(e.pointerId)
  drag = null
}

// On the window, so a drag that leaves the dialog still tracks and still ends.
window.addEventListener("pointermove", onPointerMove)
window.addEventListener("pointerup", onPointerUp)
window.addEventListener("pointercancel", onPointerUp)
window.addEventListener("resize", measure)

// Answer exactly once: whichever of Apply / dismissal happens first wins, and
// the unmount hook covers every way a dialog can be dismissed.
let done = false
const finish = (result: { file: File, rect: Rect } | null) => {
  if (done) return
  done = true
  props.onDone?.(result)
}

const apply = async () => {
  if (!imageRef.value || !loaded.value) return
  const file = await cropToFile(imageRef.value, props.file, { ...crop }, output)
  finish({ file, rect: { ...crop } })
  dialog.back(true)
}

onBeforeUnmount(() => {
  finish(null)
  window.removeEventListener("pointermove", onPointerMove)
  window.removeEventListener("pointerup", onPointerUp)
  window.removeEventListener("pointercancel", onPointerUp)
  window.removeEventListener("resize", measure)
  URL.revokeObjectURL(src.value)
})
</script>

<script lang="ts">
import ImageCropDialog from './ImageCropDialog.vue'
import type { DialogStore } from '../VDialogProvider.vue'

// Opens the cropper over `file`, starting from `rect` when there is one.
// Resolves with the new crop, or with null if the dialog was dismissed — which
// means "leave what's there alone".
export const openImageCropDialog = (
  dialogStore: DialogStore,
  file: File,
  size: [number, number],
  rect?: Rect,
) =>
  new Promise<{ file: File, rect: Rect } | null>((resolve) => {
    dialogStore.open(ImageCropDialog as any, { file, size, rect, onDone: resolve })
  })
</script>

<style lang="sass">
.image-crop-dialog__stage
  position: relative
  display: block
  width: fit-content
  margin: 0 auto
  line-height: 0
  touch-action: none
  user-select: none
  border-radius: 8px
  overflow: hidden
  background-color: var(--input-background)

.image-crop-dialog__image
  display: block
  max-width: 100%
  max-height: 52vh
  cursor: crosshair

// Everything outside the selection is dimmed by the selection's own shadow, so
// the picture stays readable while the crop is obvious.
.image-crop-dialog__selection
  position: absolute
  box-sizing: border-box
  border: 1px solid rgba(255, 255, 255, 0.9)
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5)
  cursor: move
  // Rule-of-thirds guides.
  background-image: linear-gradient(to right, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.3) calc(33.33% - 0.5px) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgba(255, 255, 255, 0.3) calc(66.66% - 0.5px) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px)), linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.3) calc(33.33% - 0.5px) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgba(255, 255, 255, 0.3) calc(66.66% - 0.5px) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px))

.image-crop-dialog__handle
  position: absolute
  width: 14px
  height: 14px
  border: 2px solid #fff
  background-color: rgba(0, 0, 0, 0.35)
  box-sizing: border-box

  &.nw
    top: -1px
    left: -1px
    border-right: none
    border-bottom: none
    cursor: nwse-resize
  &.ne
    top: -1px
    right: -1px
    border-left: none
    border-bottom: none
    cursor: nesw-resize
  &.sw
    bottom: -1px
    left: -1px
    border-right: none
    border-top: none
    cursor: nesw-resize
  &.se
    bottom: -1px
    right: -1px
    border-left: none
    border-top: none
    cursor: nwse-resize

.image-crop-dialog__hint
  margin-right: auto
  font-size: 12px
  color: var(--text-secondary-color)
</style>

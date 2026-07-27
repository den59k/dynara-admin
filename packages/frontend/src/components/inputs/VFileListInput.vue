<template>
  <VFormControl
    class="v-file-list-input"
    :class="{ 'v-file-list-input--empty': tiles.length === 0 }"
    :label="label"
    :error="displayError"
  >
    <div
      ref="gridRef"
      class="v-file-list-input__grid"
      :class="{ dragover }"
      :style="{ '--tile-aspect': tileAspect }"
      @dragover.prevent="dragover = true"
      @dragenter.prevent="dragover = true"
      @dragleave="dragover = false"
      @drop.prevent="onDrop"
    >
      <div
        v-for="(item, index) in items"
        :key="srcOf(item) || index"
        class="v-file-list-input__tile"
        :class="{ dragging: dragIndex === index, sortable }"
        data-tile
        @pointerdown="onTileDown(index, $event)"
      >
        <img v-if="previewSrcOf(item)" :src="previewSrcOf(item)!" alt="" draggable="false" />
        <span v-else class="v-file-list-input__name">{{ fileNameOf(item) }}</span>

        <!-- Only the first tile carries a label: with a sortable list, "first"
             is what cover means, so the order is the setting. -->
        <span v-if="index === 0 && items.length > 1" class="v-file-list-input__cover">{{ t('file.cover') }}</span>

        <div v-if="busySrc === srcOf(item)" class="v-file-list-input__progress">
          <div :style="{ width: busyPercent + '%' }"></div>
        </div>
        <!-- Quiet at rest, revealed on hover — and always shown where there is
             no hover to reveal them with (see the media query below). -->
        <div v-else class="v-file-list-input__overlay" @pointerdown.stop>
          <a :href="srcOf(item)" target="_blank" rel="noopener" :title="t('file.view')">
            <VIcon icon="search" />
          </a>
          <button v-if="canCrop(item)" type="button" :title="t('file.crop')" @click="recrop(index)">
            <VIcon icon="note-edit" />
          </button>
          <button type="button" :title="t('file.remove')" @click="removeAt(index)">
            <VIcon icon="close" />
          </button>
        </div>
      </div>

      <!-- One ghost per file being uploaded, in the order they were picked. -->
      <div v-for="(slot, index) in pending" :key="`pending-${index}`" class="v-file-list-input__tile pending">
        <img v-if="slot.preview" :src="slot.preview" alt="" />
        <span v-else class="v-file-list-input__name">{{ slot.name }}</span>
        <div class="v-file-list-input__progress"><div :style="{ width: slot.percent + '%' }"></div></div>
      </div>

      <button type="button" class="v-file-list-input__add" @click="pick">
        <VIcon icon="add" />
        <span>{{ dragover ? t('file.drop') : t('file.add') }}</span>
      </button>
      <input ref="inputRef" type="file" multiple class="v-file-list-input__native" :accept="acceptAttr" @change="onChange" />
    </div>
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import VFormControl, { type VFormControlProps } from '../VFormControl.vue'
import VIcon from '../VIcon.vue'
import { useDialog } from '../VDialogProvider.vue'
import { openImageCropDialog } from '../dialogs/ImageCropDialog.vue'
import { HOME_VIEW_ID } from '../../constants'
import type { Rect } from '../../utils/cropImage'
import { fileNameOf, matchesAccept, normalizeFileValue, previewSrcOf } from '../../utils/fileValue'
import { uploadPicked } from '../../utils/uploadFile'
import { t } from '../../i18n'

const props = defineProps<{
  label?: string,
  name?: string,
  error?: VFormControlProps['error'],
  // The pictures variant (`items` are images) rather than a list of documents.
  image?: boolean,
  // Each entry stores the whole `{ src, previewSrc?, size? }` structure rather
  // than a bare url string.
  structured?: boolean,
  accept?: string,
  // Set → every picture is cropped to this on the way in, and each tile offers
  // to correct that crop while the original it came from is still at hand.
  imageSize?: [number, number],
  // Let the list be reordered by dragging. The order is what gets submitted —
  // and with pictures, the first one is the cover.
  sortable?: boolean,
}>()
const model = defineModel<any[] | null>()

const route = useRoute()
const dialog = useDialog()
const view = computed(() => (route.params.viewId as string) ?? HOME_VIEW_ID)

const inputRef = ref<HTMLInputElement>()
const gridRef = ref<HTMLElement>()
const localError = shallowRef<string | null>(null)
const dragover = shallowRef(false)
// One entry per file currently uploading, rendered as a ghost tile. Entries are
// addressed by `id`, never by object identity: this array is reactive, so
// reading an entry back gives a *proxy* of what was pushed — which no longer
// compares equal to the object in hand, and which is also the only way to write
// to it and have the tile re-render.
const pending = ref<{ id: number, name: string, preview: string | null, percent: number }[]>([])
let nextPendingId = 0
// The pictures as they were picked, keyed by the src they were stored under, so
// a crop can be corrected without re-picking the file. Only covers this
// session: reopen the form later and the stored picture is already cropped.
// Reactive so a tile grows its Crop action the moment its original is recorded.
const sources = reactive(new Map<string, { file: File, rect: Rect }>())
// The tile a re-crop is currently uploading over, and how far along it is.
const busySrc = shallowRef<string | null>(null)
const busyPercent = shallowRef(0)

const items = computed<any[]>(() => model.value ?? [])
const tiles = computed(() => [...items.value, ...pending.value])
const displayError = computed(() => localError.value ?? props.error)
const acceptAttr = computed(() => props.accept ?? (props.image ? 'image/*' : undefined))
// Tiles are shaped like the pictures they hold, so the grid shows what is stored.
const tileAspect = computed(() => (props.imageSize ? `${props.imageSize[0]} / ${props.imageSize[1]}` : '1 / 1'))

const srcOf = (item: any) => normalizeFileValue(item)?.src ?? ''
const canCrop = (item: any) => !!props.imageSize && sources.has(srcOf(item))

const pick = () => inputRef.value?.click()

const setItems = (next: any[]) => { model.value = next }

const removeAt = (index: number) => {
  const [removed] = items.value.slice(index, index + 1)
  sources.delete(srcOf(removed))
  setItems(items.value.filter((_, i) => i !== index))
}

// — Uploading ————————————————————————————————————————————————

const onChange = (e: Event) => {
  addFiles(Array.from((e.target as HTMLInputElement).files ?? []))
  if (inputRef.value) inputRef.value.value = ''
}

const onDrop = (e: DragEvent) => {
  dragover.value = false
  addFiles(Array.from(e.dataTransfer?.files ?? []))
}

// Everything picked goes up at once, each with its own progress, and lands in
// the list in the order it was picked however the requests interleave.
const addFiles = async (files: File[]) => {
  const accepted = files.filter((file) => matchesAccept(file, acceptAttr.value))
  localError.value = accepted.length < files.length ? t('file.wrongType') : null
  if (accepted.length === 0) return

  const ids = accepted.map(() => ++nextPendingId)
  const previews = accepted.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null))
  pending.value.push(...accepted.map((file, index) => ({
    id: ids[index]!,
    name: file.name,
    preview: previews[index]!,
    percent: 0,
  })))

  const uploaded = await Promise.all(accepted.map(async (file, index) => {
    try {
      return await uploadPicked(file, {
        view: view.value,
        field: props.name,
        structured: props.structured,
        imageSize: props.imageSize,
        onProgress: (percent) => {
          const slot = pending.value.find((one) => one.id === ids[index])
          if (slot) slot.percent = percent
        },
      })
    } catch {
      localError.value = t('file.error')
      return null
    }
  }))

  const added = uploaded.filter((one) => one?.value != null)
  for (const one of added) {
    if (one!.source) sources.set(srcOf(one!.value), one!.source)
  }
  if (added.length > 0) setItems([...items.value, ...added.map((one) => one!.value)])

  for (const preview of previews) if (preview) URL.revokeObjectURL(preview)
  pending.value = pending.value.filter((slot) => !ids.includes(slot.id))
}

// Correct one picture's crop, starting from the crop it currently shows, and
// swap the result in where it was.
const recrop = async (index: number) => {
  const item = items.value[index]
  const key = srcOf(item)
  const source = sources.get(key)
  if (!source || !props.imageSize) return

  const result = await openImageCropDialog(dialog, source.file, props.imageSize, source.rect)
  if (!result) return

  localError.value = null
  busySrc.value = key
  busyPercent.value = 0
  try {
    const uploaded = await uploadPicked(result.file, {
      view: view.value,
      field: props.name,
      structured: props.structured,
      onProgress: (percent) => { busyPercent.value = percent },
    })
    if (uploaded.value == null) return
    // The list may have been reordered while the dialog was open, so the entry
    // is found again by what it was rather than by where it was.
    const at = items.value.findIndex((one) => srcOf(one) === key)
    if (at === -1) return
    setItems(items.value.map((one, i) => (i === at ? uploaded.value : one)))
    sources.delete(key)
    sources.set(srcOf(uploaded.value), { file: source.file, rect: result.rect })
  } catch {
    localError.value = t('file.error')
  } finally {
    busySrc.value = null
  }
}

// — Reordering ———————————————————————————————————————————————

// A press only becomes a drag past this much movement, so clicking a tile (or
// its actions) is never mistaken for the start of a reorder.
const DRAG_THRESHOLD = 4

const dragIndex = shallowRef<number | null>(null)
let drag: { pointerId: number, index: number, x: number, y: number, active: boolean } | null = null

const onTileDown = (index: number, e: PointerEvent) => {
  if (!props.sortable || items.value.length < 2) return
  drag = { pointerId: e.pointerId, index, x: e.clientX, y: e.clientY, active: false }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

// Which tile is under the pointer, by its box on screen.
const tileIndexAt = (x: number, y: number): number | null => {
  const tiles = Array.from(gridRef.value?.querySelectorAll('[data-tile]') ?? [])
  for (const [index, tile] of tiles.entries()) {
    const box = tile.getBoundingClientRect()
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return index
  }
  return null
}

const onPointerMove = (e: PointerEvent) => {
  if (!drag || drag.pointerId !== e.pointerId) return
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return
    drag.active = true
    dragIndex.value = drag.index
  }
  const target = tileIndexAt(e.clientX, e.clientY)
  if (target == null || target === drag.index) return
  // The list reorders live, so the tiles part around the one being carried.
  const next = [...items.value]
  const [moved] = next.splice(drag.index, 1)
  next.splice(target, 0, moved)
  drag.index = target
  dragIndex.value = target
  setItems(next)
}

const onPointerUp = () => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  drag = null
  dragIndex.value = null
}

onBeforeUnmount(() => {
  onPointerUp()
  for (const slot of pending.value) if (slot.preview) URL.revokeObjectURL(slot.preview)
})
</script>

<style lang="sass">
.v-file-list-input__grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr))
  gap: 10px
  padding: 10px
  border: 1px solid var(--input-border-color)
  border-radius: 8px
  background-color: var(--input-background)
  transition: border-color 0.12s

  &.dragover
    border-color: var(--primary-color)
    border-style: dashed

.v-file-list-input__tile
  position: relative
  aspect-ratio: var(--tile-aspect, 1 / 1)
  border-radius: 6px
  overflow: hidden
  background-color: var(--blocks-color)
  border: 1px solid var(--border-color)
  box-sizing: border-box

  &.sortable
    cursor: grab
    touch-action: none
    user-select: none

  &.dragging
    opacity: 0.35
    outline: 2px solid var(--primary-color)
    outline-offset: -2px
    cursor: grabbing

  &.pending
    opacity: 0.7

  img
    width: 100%
    height: 100%
    object-fit: cover
    display: block

.v-file-list-input__name
  display: flex
  align-items: center
  justify-content: center
  height: 100%
  padding: 8px
  box-sizing: border-box
  font-size: 12px
  text-align: center
  color: var(--text-secondary-color)
  overflow: hidden
  word-break: break-all

.v-file-list-input__cover
  position: absolute
  left: 6px
  bottom: 6px
  padding: 2px 6px
  border-radius: 4px
  font-size: 11px
  color: white
  background-color: rgba(0, 0, 0, 0.55)
  pointer-events: none

// The actions sit on a scrim over the picture and only appear on hover, so a
// gallery at rest is just its pictures.
.v-file-list-input__overlay
  position: absolute
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  gap: 6px
  background-color: rgba(0, 0, 0, 0.45)
  opacity: 0
  transition: opacity 0.12s
  // The scrim covers the whole tile, so it must not be the hit target: a press
  // between the actions has to reach the picture underneath and start a drag.
  // Only the actions themselves take the pointer (and stop it going further).
  pointer-events: none

  a, button
    pointer-events: auto
    display: flex
    align-items: center
    justify-content: center
    width: 28px
    height: 28px
    border: none
    border-radius: 6px
    cursor: pointer
    color: white
    background-color: rgba(255, 255, 255, 0.18)

    &:hover
      background-color: rgba(255, 255, 255, 0.32)

  svg
    width: 15px
    height: 15px

.v-file-list-input__tile:hover .v-file-list-input__overlay,
.v-file-list-input__tile:focus-within .v-file-list-input__overlay
  opacity: 1

// Nothing to hover with: keep the actions on screen instead.
@media (hover: none)
  .v-file-list-input__overlay
    opacity: 1
    inset: auto 0 0 0
    background-color: rgba(0, 0, 0, 0.35)
    padding: 4px 0

.v-file-list-input__progress
  position: absolute
  left: 8px
  right: 8px
  bottom: 8px
  height: 3px
  border-radius: 2px
  background-color: rgba(255, 255, 255, 0.35)
  overflow: hidden

  &>div
    height: 100%
    background-color: var(--primary-color)
    transition: width 0.15s linear

.v-file-list-input__add
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 6px
  aspect-ratio: var(--tile-aspect, 1 / 1)
  padding: 8px
  border: 1px dashed var(--input-border-color)
  border-radius: 6px
  background: none
  color: var(--text-secondary-color)
  font-size: 12px
  cursor: pointer
  transition: border-color 0.12s, color 0.12s

  &:hover
    border-color: var(--primary-color)
    color: var(--text-color)

  svg
    width: 18px
    height: 18px

// An empty gallery is one wide drop zone rather than a lone small tile.
.v-file-list-input--empty .v-file-list-input__add
  grid-column: 1 / -1
  aspect-ratio: auto
  min-height: 96px

.v-file-list-input__native
  display: none
</style>

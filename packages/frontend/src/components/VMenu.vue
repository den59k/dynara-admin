<template>
  <button
    ref="triggerRef"
    type="button"
    class="v-icon-button v-menu__trigger"
    :class="{ open }"
    :aria-expanded="open"
    @click.stop="toggle"
    @pointerdown.stop
  >
    <VIcon :icon="icon ?? 'more'" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="v-menu__scrim"
      @pointerdown.stop="close"
      @wheel.prevent="close"
      @contextmenu.prevent="close"
    ></div>
    <div v-if="open" class="v-menu" :style="menuStyle">
      <button
        v-for="(item, i) in items"
        :key="i"
        type="button"
        class="v-menu__item"
        :class="{ danger: item.danger }"
        @click.stop="onSelect(item)"
      >
        <VIcon v-if="item.icon" :icon="item.icon" />
        <span>{{ item.title }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import { type CSSProperties, nextTick, ref } from 'vue'
import VIcon from './VIcon.vue'

export type MenuItem = {
  title: string
  icon?: string
  danger?: boolean
  onClick: () => void
}

const props = defineProps<{
  items: MenuItem[]
  // Trigger icon; defaults to a vertical-dots kebab.
  icon?: string
}>()

const open = ref(false)
const triggerRef = ref<HTMLElement>()
const menuStyle = ref<CSSProperties>({})

// Teleported to body and fixed-positioned, so it escapes any clipping container.
// Right-aligned to the trigger; flips above it when the viewport bottom is close.
const position = () => {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const GAP = 4
  const estimatedHeight = props.items.length * 34 + 10
  const flipUp = window.innerHeight - r.bottom < estimatedHeight && r.top > estimatedHeight
  menuStyle.value = {
    position: 'fixed',
    right: `${Math.max(8, window.innerWidth - r.right)}px`,
    ...(flipUp
      ? { bottom: `${window.innerHeight - r.top + GAP}px` }
      : { top: `${r.bottom + GAP}px` }),
  }
}

const toggle = () => {
  if (open.value) { close(); return }
  open.value = true
  nextTick(position)
}

const close = () => {
  open.value = false
}

const onSelect = (item: MenuItem) => {
  close()
  item.onClick()
}
</script>

<style lang="sass">
.v-menu__trigger
  color: var(--text-secondary-color)

  &:hover, &.open
    color: var(--text-color)
    background-color: var(--hover-color)

.v-menu__scrim
  position: fixed
  inset: 0
  z-index: 2100

.v-menu
  z-index: 2101
  min-width: 180px
  background: var(--popover-color)
  border: 1px solid var(--input-border-color)
  border-radius: 10px
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35)
  padding: 4px
  box-sizing: border-box
  display: flex
  flex-direction: column

.v-menu__item
  display: flex
  align-items: center
  gap: 8px
  text-align: left
  background: none
  border: none
  padding: 8px 10px
  border-radius: 6px
  cursor: pointer
  color: var(--text-color)
  font-size: 13px
  font-weight: 500
  white-space: nowrap

  svg
    width: 15px
    height: 15px
    color: var(--text-secondary-color)
    flex-shrink: 0

  &:hover
    background-color: var(--hover-color)

  &.danger
    color: var(--error-color)

    svg
      color: var(--error-color)

    &:hover
      background-color: color-mix(in srgb, var(--error-color) 10%, transparent)
</style>

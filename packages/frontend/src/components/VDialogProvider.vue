<template>
  <Teleport to="body">
    <Transition>
      <div v-if="dialogStore.isOpen.value" class="v-dialog-backdrop editor-component" @mousedown="onMouseDown" @mouseup="onMouseUp">
        <component 
          v-for="(dialog, index) in dialogStore.dialogHistory" 
          v-show="index === dialogStore.dialogHistory.length-1" 
          class="bd-scale scroll"
          role="dialog"
          :is="dialog.dialog" 
          v-bind="dialog.props"
        >

        </component>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
import { useKeyDownLayer } from 'vuesix/src/hooks/useKeyDownLayer';
import { inject, type Plugin, type Ref, watch } from 'vue';

const dialogStore = inject("dialogStore") as DialogStore & { isOpen: Ref<boolean>, dialogHistory: any[] }

let mouseDown = false
const onMouseDown = (e: MouseEvent) => {
  mouseDown = e.target === e.currentTarget
}
const onMouseUp = (e: MouseEvent) => {
  if (!mouseDown || e.target !== e.currentTarget) {
    mouseDown = false
    return
  }
  dialogStore.back()
}

useKeyDownLayer("Escape", dialogStore.isOpen, () => {
  dialogStore.back()
})

watch(dialogStore.isOpen, (isOpen) => {
  if (isOpen) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflowY = "hidden"
    document.body.style.paddingRight = scrollbarWidth+"px"
    document.getElementById("app")?.setAttribute("inert", "")
  } else {
    document.body.style.paddingRight = ""
    document.body.style.overflowY = "auto"
    document.getElementById("app")?.removeAttribute("inert")
  }
})

</script>

<script lang="ts">
import { computed, type DefineComponent, type ExtractPropTypes, shallowReactive } from "vue";

type OpenDialog = <T>(_dialog: DefineComponent<T, {}, any>, props?: ExtractPropTypes<T>) => void

export type DialogStore = { open: OpenDialog, close: () => void, back: () => void }

export const createDialogSystem = (): Plugin => {
  return { 
    install: (app) => {
      const dialogHistory = shallowReactive<{ dialog: DefineComponent<any, {}, any>, props: any }[]>([])

      const open: OpenDialog = (dialog, props) => {
        dialogHistory.push({ dialog: dialog as any, props })
      }

      const close = () => {
        dialogHistory.length = 0
      }

      const back = () => {
        if (dialogHistory.length === 0) return
        dialogHistory.pop()
      }

      const dialog = computed(() => {
        if (dialogHistory.length === 0) return { dialog: null, props: {} }
        return dialogHistory[dialogHistory.length-1]
      })

      const isOpen = computed(() => dialogHistory.length > 0)

      app.provide("dialogStore", { open, close, back, dialogHistory, dialog, isOpen })
    }
  }
}

export const useDialog = () => inject("dialogStore") as DialogStore

</script>

<style lang="sass">
.v-dialog-backdrop
  position: fixed
  top: 0
  bottom: 0
  width: 100vw
  background-color: rgba(0, 0, 0, 0.75)
  display: flex
  align-items: center
  flex-direction: column
  justify-content: center
  z-index: 2000
  box-sizing: border-box

  &.v-enter-active, &.v-leave-active 
    transition: opacity 0.14s ease
    .v-dialog
      transition: transform 0.1s cubic-bezier(0, 0, 0.2, 1)

  &.v-enter-from, &.v-leave-to 
    opacity: 0

    .v-dialog
      transform: scale(0.8)

</style>
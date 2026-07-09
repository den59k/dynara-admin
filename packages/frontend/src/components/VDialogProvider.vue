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
import ConfirmDialog from './dialogs/ConfirmDialog.vue';
import { t } from '../i18n';

type OpenDialog = <T>(_dialog: DefineComponent<T, {}, any>, props?: ExtractPropTypes<T>) => void

export type DialogStore = {
  open: OpenDialog,
  close: () => void,
  // Dismiss the top dialog. Runs its guard first unless `force` is set — a
  // truthy guard result opens a "discard changes?" confirmation instead.
  back: (force?: boolean) => void,
  // Attach a guard to the top dialog (called by the dialog's own setup).
  setGuard: (guard?: () => boolean) => void,
}

type DialogEntry = { dialog: DefineComponent<any, {}, any>, props: any, guard?: () => boolean }

export const createDialogSystem = (): Plugin => {
  return {
    install: (app) => {
      const dialogHistory = shallowReactive<DialogEntry[]>([])

      const open: OpenDialog = (dialog, props) => {
        dialogHistory.push({ dialog: dialog as any, props })
      }

      const close = () => {
        dialogHistory.length = 0
      }

      const back = (force = false) => {
        if (dialogHistory.length === 0) return
        const top = dialogHistory[dialogHistory.length-1]
        if (!force && top.guard && top.guard()) {
          // The form has unsaved edits: stack a confirmation on top. Confirming
          // removes the guarded dialog; the confirmation pops itself afterwards.
          open(ConfirmDialog as any, {
            title: t('confirm.discardTitle'),
            text: t('confirm.discardText'),
            confirmTitle: t('confirm.discard'),
            danger: true,
            onConfirm: () => {
              const index = dialogHistory.indexOf(top)
              if (index !== -1) dialogHistory.splice(index, 1)
            },
          })
          return
        }
        dialogHistory.pop()
      }

      const setGuard = (guard?: () => boolean) => {
        if (dialogHistory.length === 0) return
        dialogHistory[dialogHistory.length-1].guard = guard
      }

      const dialog = computed(() => {
        if (dialogHistory.length === 0) return { dialog: null, props: {} }
        return dialogHistory[dialogHistory.length-1]
      })

      const isOpen = computed(() => dialogHistory.length > 0)

      app.provide("dialogStore", { open, close, back, setGuard, dialogHistory, dialog, isOpen })
    }
  }
}

export const useDialog = () => inject("dialogStore") as DialogStore

// Register a dirty-check for the dialog being set up: while `isDirty` returns
// true, overlay clicks, Escape, the ✕ button and Cancel all ask for
// confirmation before discarding. The guard dies with its dialog entry.
export const useDialogGuard = (isDirty: () => boolean) => {
  const store = inject("dialogStore") as DialogStore | undefined
  store?.setGuard(isDirty)
}

</script>

<style lang="sass">
.v-dialog-backdrop
  position: fixed
  inset: 0
  background-color: rgba(0, 0, 0, 0.65)
  // Scroll the overlay, not the dialog: the whole backdrop is the scroll
  // container, and the dialog is centered with `margin: auto` so it stays
  // reachable (top included) once it grows taller than the viewport.
  display: flex
  overflow-y: auto
  overflow-x: hidden
  padding: 24px
  z-index: 2000
  box-sizing: border-box

  .v-dialog
    margin: auto

  &.v-enter-active, &.v-leave-active
    transition: opacity 0.14s ease
    .v-dialog
      transition: transform 0.1s cubic-bezier(0, 0, 0.2, 1)

  &.v-enter-from, &.v-leave-to
    opacity: 0

    .v-dialog
      transform: scale(0.8)

  @media(max-width: 800px)
    padding: 0

</style>
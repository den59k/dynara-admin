<template>
  <Teleport to="body">
    <div class="v-toast-stack">
      <TransitionGroup name="v-toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="v-toast"
          :class="`v-toast--${toast.type}`"
          role="status"
          @click="toastStore.dismiss(toast.id)"
        >
          <VIcon class="v-toast__icon" :icon="toast.type === 'error' ? 'close' : 'check'" />
          <span class="v-toast__text">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import { inject } from 'vue'
import VIcon from './VIcon.vue'

const toastStore = inject("toastStore") as ToastStore
</script>

<script lang="ts">
import { type Plugin, reactive } from "vue"

export type ToastType = "success" | "error"
type Toast = { id: number, message: string, type: ToastType }

export type ToastStore = {
  toasts: Toast[]
  push: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
  dismiss: (id: number) => void
}

// Toasts auto-dismiss after this long; clicking one dismisses it early.
const TOAST_TTL = 4000

export const createToastSystem = (): Plugin => ({
  install: (app) => {
    const toasts = reactive<Toast[]>([])
    // Monotonic id counter — keys the TransitionGroup and targets dismissals.
    let nextId = 1

    const dismiss = (id: number) => {
      const index = toasts.findIndex(t => t.id === id)
      if (index !== -1) toasts.splice(index, 1)
    }

    const push = (message: string, type: ToastType = "success") => {
      const id = nextId++
      toasts.push({ id, message, type })
      setTimeout(() => dismiss(id), TOAST_TTL)
    }

    const store: ToastStore = {
      toasts,
      push,
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
      dismiss,
    }
    app.provide("toastStore", store)
  }
})

// Access the toast store from any component under the provider.
import { inject as injectToast } from "vue"
export const useToast = () => injectToast("toastStore") as ToastStore
</script>

<style lang="sass">
.v-toast-stack
  position: fixed
  bottom: 20px
  right: 20px
  z-index: 3000
  display: flex
  flex-direction: column
  gap: 10px
  align-items: flex-end
  pointer-events: none

.v-toast
  pointer-events: auto
  display: flex
  align-items: center
  gap: 10px
  max-width: 380px
  padding: 12px 16px
  border-radius: 10px
  background-color: var(--paper-color)
  border: 1px solid var(--border-color)
  color: var(--text-color)
  font-size: 14px
  font-weight: 500
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)
  cursor: pointer

  .v-toast__icon
    width: 18px
    height: 18px
    flex-shrink: 0

  &.v-toast--success .v-toast__icon
    color: var(--success-color)

  &.v-toast--error .v-toast__icon
    color: var(--error-color)

.v-toast__text
  line-height: 1.35

.v-toast-enter-active, .v-toast-leave-active
  transition: opacity 0.2s ease, transform 0.2s ease

.v-toast-enter-from, .v-toast-leave-to
  opacity: 0
  transform: translateX(16px)
</style>

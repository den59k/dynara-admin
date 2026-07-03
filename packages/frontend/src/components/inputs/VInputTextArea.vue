<template>
  <VFormControl class="v-input-text v-input-textarea" :label-id="labelId" :label="props.label" :error="error" outline>
    <textarea ref="inputRef" v-model="model" :name="name" :placeholder="placeholder" :id="labelId"></textarea>
    <VInputClear v-if="nullable && model" class="v-input-textarea__clear" @clear="model = null" />
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, useId, type Ref } from 'vue';
import VFormControl from '../VFormControl.vue';
import VInputClear from './VInputClear.vue';
import { useTextareaAutosize } from '@vueuse/core';

const props = defineProps<{
  id?: string,
  label?: string,
  error?: string,
  autofocus?: boolean,
  name?: string,
  placeholder?: string,
  nullable?: boolean
}>()

const model = defineModel<string | null>({ default: "" })

const labelId = props.id ?? useId()

const inputRef = ref<HTMLTextAreaElement>()
onMounted(() => {
  if (props.autofocus || props.error) {
    inputRef.value?.focus()
  }
})

// The autosize watcher wants a string source; the model itself may be null.
useTextareaAutosize({ element: inputRef as Ref<HTMLTextAreaElement>, input: computed(() => model.value ?? "") })

</script>

<style lang="sass">
.v-input-textarea__clear
  align-self: flex-start
  margin-top: 9px
</style>
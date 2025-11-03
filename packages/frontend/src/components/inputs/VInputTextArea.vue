<template>
  <VFormControl class="v-input-text v-input-textarea" :label-id="labelId" :label="props.label" :error="error" outline>
    <textarea ref="inputRef" v-model="model" :name="name" :placeholder="placeholder" :id="labelId"></textarea>
  </VFormControl>
</template>

<script lang="ts" setup>
import { onMounted, ref, useId, type Ref } from 'vue';
import VFormControl from '../VFormControl.vue';
import { useTextareaAutosize } from '@vueuse/core';

const props = defineProps<{ 
  id?: string, 
  label?: string, 
  error?: string, 
  autofocus?: boolean, 
  name?: string, 
  placeholder?: string 
}>()

const model = defineModel<string>({ default: "" })

const labelId = props.id ?? useId()

const inputRef = ref<HTMLTextAreaElement>()
onMounted(() => {
  if (props.autofocus || props.error) {
    inputRef.value?.focus()
  }
})

useTextareaAutosize({ element: inputRef as Ref<HTMLTextAreaElement>, input: model })

</script>

<style lang="sass">

</style>
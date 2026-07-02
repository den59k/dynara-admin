<template>
  <div v-if="data" class="auth-page">
    <form class="auth-page__form" @submit.prevent="onSubmit">
      <h1>{{ data?.title ?? t('auth.title') }}</h1>
      <JsonInput :model-value="values" :schema="data.fields" />
      <VButton>{{ t('auth.submit') }}</VButton>
      <div v-if="error" class="auth-page__error">{{ error }}</div>
    </form>
  </div>
</template>

<script lang="ts" setup>
import { resetRequestCache, useRequest } from 'vuesix';
import { accountApi } from '../api/accountApi';
import { JsonInput } from '../components/inputs/getInput';
import VButton from '../components/VButton.vue';
import { reactive } from 'vue';
import { shallowRef } from 'vue';
import { HTTPError } from '../api/request';
import { useRouter } from 'vue-router';
import { t } from '../i18n';

const { data } = useRequest(accountApi.getAuthData)
const values = reactive({})

const router = useRouter()

const pending = shallowRef(false)
const error = shallowRef<string | null>(null)

const onSubmit = async () => {
  pending.value = true
  try {
    const { token } = await accountApi.login(values)
    window.localStorage.setItem("dynara-admin__token", token)
    resetRequestCache()
    router.replace('/')
  } catch(e) {
    if (e instanceof HTTPError) {
      if (typeof e.body === 'string') {
        error.value = e.body
      } else {
        error.value = e.body?.error ?? t('common.error')
      }
    } else {
      error.value = t('common.error')
    }
    pending.value = false
  }
}

</script>

<style lang="sass">
.auth-page
  height: 100%
  display: flex
  flex-direction: column
  justify-content: center
  align-items: center

.auth-page__form
  width: 400px
  border: 1px solid var(--border-color)
  border-radius: 20px
  padding: 40px
  box-shadow: 0 4px 8px 8px rgba(0, 0, 0, 0.12)
  max-width: 96vw
  box-sizing: border-box

  @media(max-width: 400px)
    padding: 20px
    padding-top: 32px

  &>.v-button
    margin-top: 20px
    width: 100%

.auth-page__error
  color: var(--error-color)
  text-align: center
  padding-top: 8px
  font-size: 13px
  white-space: pre-wrap

</style>
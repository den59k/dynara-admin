import { query, useRequest, useRequestWatch } from "vuesix"
import { useRoute } from 'vue-router'
import { request, apiUrl } from "./request"
import { computed, unref, type MaybeRef } from "vue"
import { HOME_VIEW_ID } from "../constants"

export const getData = ({ view, name, args }: { view: string, name: string, args: any }) => {
  return request(apiUrl(`/data/${view}/component-data/${name}${args? query(args): ''}`))
}

export const useData = (dataName: string, args: MaybeRef<any>) => {

  const route = useRoute()
  const query = computed(() => {
    return {
      view: route.params.viewId as string ?? HOME_VIEW_ID,
      name: dataName,
      args: unref(args)
    }
  })

  return useRequestWatch(getData, query)
}

// POST counterpart of getData — invokes a page's `componentAction` mutation.
export const sendAction = (view: string, name: string, body?: any) => {
  return request(apiUrl(`/data/${view}/component-action/${name}`), body, { method: "POST" })
}

// Returns a sender bound to the current page's view — call it to run the action.
export const useAction = (name: string) => {
  const route = useRoute()
  return (body?: any) => sendAction(route.params.viewId as string ?? HOME_VIEW_ID, name, body)
}
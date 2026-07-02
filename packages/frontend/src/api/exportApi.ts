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
import { query, useRequest, useRequestWatch } from "vuesix"
import { useRoute } from 'vue-router'
import { request } from "./request"
import { computed, unref, type MaybeRef } from "vue"

export const getData = ({ view, name, args }: { view: string, name: string, args: any }) => { 
  return request(`/api/admin/data/${view}/component-data/${name}${args? query(args): ''}`)
}

export const useData = (dataName: string, args: MaybeRef<any>) => { 

  const route = useRoute()
  const query = computed(() => {
    return {
      view: route.params.viewId as string ?? "__home__",
      name: dataName,
      args: unref(args)
    }
  })
  
  return useRequestWatch(getData, query)
}
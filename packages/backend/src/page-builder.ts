// The createPage builder: validates the page path, registers the PageEntry in
// the panel state, and returns the chainable configuration object.

import { unfoldSchema, unfoldTypeBoxSchema, type SchemaItem } from "compact-json-schema"
import { normalizeAccess } from "./access.ts"
import { extractFormComponents, extractReferenceMethods, stripComponentFields } from "./form-schema.ts"
import { toRouteSegment } from "./paths.ts"
import type { CreatePageOptions, PageEntry, PageWithPrimaryKey, PanelState } from "./types.ts"

export const createPage = <T extends object, User>(state: PanelState, options: CreatePageOptions<User>): PageWithPrimaryKey<T, string, T, User> => {

  // Reject characters that would break the route template, and duplicate paths
  // (two pages on the same path would silently collide on their routes).
  const segment = toRouteSegment(options.path)
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error(`Invalid page path "${options.path ?? ''}": only letters, digits, "-" and "_" are allowed`)
  }
  if (state.pages.some(p => toRouteSegment(p.path) === segment)) {
    throw new Error(`Duplicate page path "${options.path ?? ''}"`)
  }

  const currentPage: PageEntry = {
    path: options.path,
    title: options.title,
    group: options.group,
    icon: options.icon,
    search: options.search,
    access: normalizeAccess(options.access),
    actions: [],
    componentData: [],
    componentActions: [],
  }
  state.pages.push(currentPage)

  const data: PageWithPrimaryKey<T, string, T, User> = {
    table(table) {
      currentPage.table = table as any
      return this
    },
    primaryKey(key, type?: SchemaItem){
      currentPage.primaryKey = key
      currentPage.primaryKeyType = type ?? "string"
      return this as any
    },
    data(query) {
      currentPage.data = query as any
      return this as any
    },
    count(query) {
      currentPage.count = query as any
      return this as any
    },
    item(query) {
      currentPage.itemData = query as any
      return this as any
    },
    createForm(schema, onInsert) {
      const unfolded = unfoldSchema(schema)
      extractReferenceMethods(unfolded, `${segment}.create`, state.referenceMethods)
      extractFormComponents(unfolded, `${segment}.create`, state.componentFiles)
      currentPage.createForm = { schema: unfolded }
      currentPage.createBodySchema = stripComponentFields(unfolded)
      currentPage.onInsert = onInsert as any
      return this
    },
    updateForm(schema, onUpdate) {
      const unfolded = unfoldSchema(schema)
      extractReferenceMethods(unfolded, `${segment}.update`, state.referenceMethods)
      extractFormComponents(unfolded, `${segment}.update`, state.componentFiles)
      currentPage.updateForm = { schema: unfolded }
      currentPage.updateBodySchema = stripComponentFields(unfolded)
      currentPage.onUpdate = onUpdate as any
      return this as any
    },
    onDelete(onDelete) {
      currentPage.onDelete = onDelete as any
      return this as any
    },
    filters(filterSchema: SchemaItem) {
      // Unfolded JSON schema for rendering the filter bar. Strip any `required`
      // so every filter is apply-if-set (the UI submits only touched fields).
      const unfolded = unfoldSchema(filterSchema)
      if (unfolded && typeof unfolded === "object" && "required" in unfolded) delete (unfolded as any).required
      extractReferenceMethods(unfolded, `${segment}.filter`, state.referenceMethods)
      currentPage.filters = unfolded
      // TypeBox validator for incoming values (also decodes dates); likewise
      // made all-optional so a partial filter validates.
      const tb = unfoldTypeBoxSchema(filterSchema)
      if (tb && Array.isArray(tb.required)) tb.required = []
      currentPage.filtersCheck = tb
      return this
    },
    action(name: string, config: any, handler: any) {
      let schema: SchemaItem | undefined
      let bodySchema: SchemaItem | undefined
      if (config.form) {
        schema = unfoldSchema(config.form)
        // Action forms can carry inline `reference` selects and custom field
        // components too — extract both so the schema handed to the frontend
        // stays plain JSON.
        extractReferenceMethods(schema, `${segment}.action.${name}`, state.referenceMethods)
        extractFormComponents(schema, `${segment}.action.${name}`, state.componentFiles)
        bodySchema = stripComponentFields(schema)
      }
      currentPage.actions.push({
        name,
        title: config.title,
        icon: config.icon,
        confirm: config.confirm,
        danger: config.danger,
        kind: config.bulk ? "bulk" : (config.placement === "toolbar" ? "toolbar" : "row"),
        schema,
        bodySchema,
        handler,
      })
      return this as any
    },
    component(path: string) {
      const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
      const name = path.slice(index+1)
      // Key by page segment + file name so identically-named component files on
      // different pages don't overwrite each other.
      const key = `${segment}__${name}`
      currentPage.component = key
      state.componentFiles.set(key, path)
      return this
    },
    componentData(...args: any) {
      if (args.length === 2) {
        currentPage.componentData.push({ name: args[0], method: args[1] })
      } else {
        currentPage.componentData.push({ name: args[0], schema: args[1], method: args[2] })
      }
      return this
    },
    componentAction(...args: any) {
      if (args.length === 2) {
        currentPage.componentActions.push({ name: args[0], method: args[1] })
      } else {
        currentPage.componentActions.push({ name: args[0], schema: args[1], method: args[2] })
      }
      return this
    },
    upload(handler: any) {
      currentPage.upload = handler
      return this
    }
  }
  return data
}

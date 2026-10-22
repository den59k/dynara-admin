// The createPage builder: validates the page path, registers the PageEntry in
// the panel state, and returns the chainable configuration object.

import { unfoldSchema, unfoldTypeBoxSchema, type SchemaItem } from "compact-json-schema"
import { normalizeAccess } from "./access.ts"
import { extractFormComponents, extractReferenceMethods, stripComponentFields } from "./form-schema.ts"
import { toRouteSegment } from "./paths.ts"
import type { CreatePageOptions, FormOptions, FormWidth, PageEntry, PageWithPrimaryKey, PanelState } from "./types.ts"

// A form's `options` argument is optional and sits before the handler, so the
// handler is always the last argument: `(schema, handler)` or `(schema, options, handler)`.
const splitFormArgs = (args: any[]): [FormOptions, any] =>
  args.length > 1 ? [args[0] ?? {}, args[1]] : [{}, args[0]]

// Plain-JS callers get no type check, and an unknown width would silently fall
// back to the default — fail at configuration time instead.
const checkFormWidth = (width: FormWidth | undefined, where: string) => {
  if (width === undefined) return undefined
  const valid = typeof width === "number"
    ? Number.isFinite(width) && width > 0
    : ["sm", "md", "lg", "xl"].includes(width)
  if (!valid) throw new Error(`Invalid form width ${JSON.stringify(width)} in ${where}: use "sm", "md", "lg", "xl" or a number of pixels`)
  return width
}

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
    createForm(schema: SchemaItem, ...args: any[]) {
      const [options, onInsert] = splitFormArgs(args)
      const unfolded = unfoldSchema(schema)
      extractReferenceMethods(unfolded, `${segment}.create`, state.referenceMethods)
      extractFormComponents(unfolded, `${segment}.create`, state.componentFiles)
      currentPage.createForm = { schema: unfolded, width: checkFormWidth(options.width, `${segment} createForm`) }
      currentPage.createBodySchema = stripComponentFields(unfolded)
      currentPage.onInsert = onInsert
      return this
    },
    updateForm(schema: SchemaItem, ...args: any[]) {
      const [options, onUpdate] = splitFormArgs(args)
      const unfolded = unfoldSchema(schema)
      extractReferenceMethods(unfolded, `${segment}.update`, state.referenceMethods)
      extractFormComponents(unfolded, `${segment}.update`, state.componentFiles)
      currentPage.updateForm = { schema: unfolded, width: checkFormWidth(options.width, `${segment} updateForm`) }
      currentPage.updateBodySchema = stripComponentFields(unfolded)
      currentPage.onUpdate = onUpdate
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
        formWidth: checkFormWidth(config.formWidth, `${segment} action "${name}"`),
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

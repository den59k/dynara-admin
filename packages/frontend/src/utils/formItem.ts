import type { InjectionKey, Ref } from 'vue'

// The persisted record behind a form, provided by the form dialogs for custom
// form-field components (VCustomInput injects it and hands it to the loaded
// component as its `item` prop). Kept out of the form values on purpose:
// seeding e.g. the primary key into `values` would leak it into submit payloads
// (dynara passes unknown body keys through), pollute the dirty-check, and
// reserve the key from user schemas. `null` when there is no record (create
// mode, toolbar/bulk actions).
export const FORM_ITEM_KEY: InjectionKey<Ref<any>> = Symbol("dynara-admin-form-item")

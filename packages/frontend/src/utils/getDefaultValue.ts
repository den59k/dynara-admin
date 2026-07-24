export const getDefaultValue = (schema: any): any => {
  // Display-only custom-component fields hold no form value of their own; on an
  // edit form the dialog merges whatever the item provides under the key.
  if (schema.type === "component") return undefined
  if (schema.default) return schema.default
  if (schema.nullable) return null
  // Arrays start empty — including relation-list fields, which carry
  // `reference`/`options` on the array node and must not fall into the
  // select-null branch below (a required array of ids submits as []).
  if (schema.type === "array") {
    return schema.format === "richText" ? [{ text: "" }] : []
  }
  // Select / enum / reference / file / date fields start empty rather than at a
  // bogus 0 / "" value.
  if (schema.options || schema.enum || schema.reference || schema.format === "file") return null
  if (schema.type === "date" || schema.format === "date" || schema.format === "datetime") return null
  // if (schema.type === 'object' && schema.format === 'image') {
  //   return { src: defaultImageSrc, previewSrc: defaultImageSrc }
  // }
  if (schema.type === 'number' || schema.type === 'integer') return 0
  if (schema.type === 'object') {
    if (!schema.properties) return {}
    return Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => {
      if (!schema.required?.includes(key)) {
        return [ key, undefined ]
      }
      return [ key, getDefaultValue(value)]
    }))
  }
  if (schema.type === 'boolean') return false
  return ""
}
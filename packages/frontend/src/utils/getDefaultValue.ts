export const getDefaultValue = (schema: any): any => {
  if (schema.default) return schema.default
  if (schema.nullable) return null
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
  if (schema.type === "array" && schema.format === "richText") {
    return [{ text: "" }]
  }
  if (schema.type === 'array') return []
  if (schema.type === 'boolean') return false
  return ""
}
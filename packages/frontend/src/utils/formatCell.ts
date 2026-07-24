// Pure cell-formatting helpers shared by the table renderer. Kept out of the
// .vue SFC so they can be unit-tested directly.

export type ColumnType = "text" | "boolean" | "date" | "badge" | "image" | "money"

export type FormatColumn = {
  type?: ColumnType
  format?: "date" | "datetime"
  currency?: string
  colors?: Record<string, string>
}

// Named badge colors → hex; an unknown name is used verbatim as a CSS color, so
// callers can also pass `#rrggbb` directly.
export const BADGE_COLORS: Record<string, string> = {
  red: '#DE3D5D', green: '#2ecc71', blue: '#3B82F6', yellow: '#F59E0B',
  orange: '#FB923C', purple: '#8B5CF6', gray: '#6B7280', grey: '#6B7280',
}

// A palette name resolved to its hex — or the input verbatim, so any raw CSS
// color passes through. Shared by badges and the select inputs' chips/dots.
export const resolveColor = (name: string): string => BADGE_COLORS[name] ?? name

// The color a badge value resolves to (or the neutral default).
export const badgeColor = (value: any, col: FormatColumn): string => {
  const name = col.colors?.[String(value)]
  if (!name) return 'var(--text-secondary-color)'
  return resolveColor(name)
}

// True when a value should render as the muted "—" placeholder.
export const isEmptyValue = (value: any): boolean => value == null || value === ''

// Formats text / date / money cells to a display string. boolean / badge / image
// are handled by the template (they need markup), not here.
export const formatValue = (value: any, col: FormatColumn): string => {
  if (col.type === 'date') {
    const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : String(value))
    if (isNaN(date.getTime())) return String(value)
    return col.format === 'datetime' ? date.toLocaleString() : date.toLocaleDateString()
  }
  if (col.type === 'money') {
    const num = Number(value)
    if (isNaN(num)) return String(value)
    return col.currency
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: col.currency }).format(num)
      : num.toLocaleString()
  }
  return String(value)
}

// Minimal UI localization. The active locale comes from the `locale` option
// passed to `createAdminPanel` (injected as `window.__DYNARA_LOCALE__` by the
// backend); it defaults to English. Add a locale by adding a table below.

export type Locale = "en" | "ru"

type MessageValue = string | ((p: any) => string)
type Messages = Record<string, MessageValue>

const en: Messages = {
  "common.error": "An error occurred",
  "auth.title": "Sign in",
  "auth.submit": "Sign in",
  "sidebar.logout": "Log out",
  "home.welcome": "Welcome",
  "data.add": "Add item",
  "data.search": "Search…",
  "data.delete": ({ count }: { count: number }) => (count > 1 ? "Delete items" : "Delete item"),
  "pager.prev": "Back",
  "pager.next": "Next",
  "pager.range": ({ from, to, total }: { from: number; to: number; total: number }) => `${from}–${to} of ${total}`,
  "dialog.cancel": "Cancel",
  "dialog.editTitle": "Edit item",
  "dialog.addTitle": "Add item",
  "dialog.save": "Save",
  "dialog.add": "Add",
  "confirm.title": "Confirm action",
  "confirm.apply": "Apply",
  "confirm.deleteTitle": ({ count }: { count: number }) => (count > 1 ? "Delete items?" : "Delete item?"),
  "confirm.deleteDefaultTitle": "Delete this item?",
  "confirm.irreversible": "This action cannot be undone",
  "confirm.delete": "Delete",
  "input.clear": "Clear",
  "select.empty": "Not selected",
  "select.search": "Search…",
  "select.clear": "Clear",
  "select.loading": "Loading…",
  "select.noOptions": "No options",
  "file.choose": "Choose file",
  "file.replace": "Replace",
  "file.remove": "Remove",
  "file.uploading": ({ percent }: { percent: number }) => `Uploading… ${percent}%`,
  "file.error": "Upload failed",
}

const ru: Messages = {
  "common.error": "Произошла ошибка",
  "auth.title": "Вход в аккаунт",
  "auth.submit": "Вход",
  "sidebar.logout": "Выйти из аккаунта",
  "home.welcome": "Добро пожаловать",
  "data.add": "Добавить элемент",
  "data.search": "Поиск…",
  "data.delete": ({ count }: { count: number }) => (count > 1 ? "Удалить элементы" : "Удалить элемент"),
  "pager.prev": "Назад",
  "pager.next": "Вперёд",
  "pager.range": ({ from, to, total }: { from: number; to: number; total: number }) => `${from}–${to} из ${total}`,
  "dialog.cancel": "Отмена",
  "dialog.editTitle": "Редактировать элемент",
  "dialog.addTitle": "Добавить элемент",
  "dialog.save": "Сохранить",
  "dialog.add": "Добавить",
  "confirm.title": "Подтвердите действие",
  "confirm.apply": "Применить",
  "confirm.deleteTitle": ({ count }: { count: number }) => (count > 1 ? "Удалить элементы?" : "Удалить элемент?"),
  "confirm.deleteDefaultTitle": "Вы действительно хотите удалить элемент?",
  "confirm.irreversible": "Отменить действие будет невозможно",
  "confirm.delete": "Удалить",
  "input.clear": "Очистить",
  "select.empty": "Не выбрано",
  "select.search": "Поиск…",
  "select.clear": "Очистить",
  "select.loading": "Загрузка…",
  "select.noOptions": "Нет вариантов",
  "file.choose": "Выберите файл",
  "file.replace": "Заменить",
  "file.remove": "Удалить",
  "file.uploading": ({ percent }: { percent: number }) => `Загрузка… ${percent}%`,
  "file.error": "Не удалось загрузить файл",
}

const tables: Record<Locale, Messages> = { en, ru }

export const locale: Locale = ((window as any).__DYNARA_LOCALE__ as Locale) in tables
  ? ((window as any).__DYNARA_LOCALE__ as Locale)
  : "en"

const table = tables[locale]

// Translate a key, optionally with interpolation params. Falls back to the
// English table, then to the key itself, so a missing entry never blanks the UI.
export const t = (key: string, params?: any): string => {
  const value = table[key] ?? en[key] ?? key
  return typeof value === "function" ? value(params) : value
}

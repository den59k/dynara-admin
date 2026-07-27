import { setUseFormErrorHandler } from "vuesix"
import { t } from "../i18n"

// Base paths injected by the backend into index.html (see createAdminPanel's
// basePath option). Fall back to the build-time defaults when unset.
const dyn = (typeof window !== "undefined" ? window : {}) as any
export const API_BASE: string = dyn.__DYNARA_API_BASE__ || "/api/admin"
export const UI_BASE: string = dyn.__DYNARA_BASE__ || "/admin"

// Prefixes an API path (starting with "/") with the configured API base.
export const apiUrl = (path: string) => `${API_BASE}${path}`

export class HTTPError extends Error {
  body: any
  statusCode: number

  constructor(body: any, statusCode: number = 401) {
    super()
    this.body = body
    this.statusCode = statusCode
  }
}

// Turns a failed request into the form's per-field errors. dynara answers a
// schema violation with `{ cause, where, fields: { <path>: { message } } }`,
// where `<path>` is the JSON-pointer tail of the offending value — "title" for
// a top-level field, "rows/0/title" when it sits inside one. Everything else
// (HTTPError with a plain-text message, a thrown Error) becomes `_global`.
export const applyFormError = (e: any, errors: Record<string, any>) => {
  if (!(e instanceof HTTPError)) {
    errors["_global"] = t("common.error")
    return
  }
  if (e.body?.fields && typeof e.body.fields === "object") {
    for (let [path, error] of Object.entries<any>(e.body.fields)) {
      // The form only knows its top-level fields, so a nested path highlights
      // the field that owns the value (the table, the object) instead of
      // being dropped as an unknown key.
      const key = path.split("/")[0]
      if (!key) continue
      errors[key] = typeof error === "string" ? { message: error } : error
    }
    return
  }
  if (typeof e.body?.error === "object") {
    for (let [key, error] of Object.entries(e.body.error)) {
      if (typeof error === "string") {
        errors[key] = error as string
      } else if (typeof error === "object" && error) {
        errors[key] = error
      }
    }
  } else if (typeof e.body === "string") {
    errors["_global"] = e.body
  } else {
    errors["_global"] = e.body?.cause ?? t("common.error")
  }
}

setUseFormErrorHandler(applyFormError)

type Options = Partial<{
  method: "GET" | "POST" | "DELETE" | "PUT",
  responseContentType: "json" | "blob"
}>

export const request = async <T = any>(url: string, body?: any, options: Options = {}) => {

  const headers: { [key: string]: string} = {}
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  const jwt = window.localStorage.getItem("dynara-admin__token")
  if (jwt) {
    headers["Authorization"] = "Bearer "+jwt
  }

  const resp = await fetch(url, {
    method: options.method || (body? "POST": "GET"),
    body: body? (body instanceof FormData? body: JSON.stringify(body)): null,
    headers
  })

  let response = null as T
  if (resp.headers.get("content-type")?.startsWith("application/json")) {
    response = await resp.json() as T
  }
  if (resp.headers.get("content-type")?.startsWith("text/plain")) {
    response = await resp.text() as T
  }

  if (resp.status >= 400) {
    throw new HTTPError(response, resp.status)
  }

  if (options.responseContentType === "blob"){
    response = await resp.blob() as T
  }

  return response as T
}

export type XhrOptions = { 
  method?: string,
  headers?: Record<string, string>
  onProgress?: (percent: number) => void,
  responseType?: XMLHttpRequestResponseType,
  fileSize?: number,
  cancelationToken?: CancelationToken
}

export const sendXHR = (url: string, body: FormData | File, { method, onProgress, cancelationToken, headers }: XhrOptions = {}) => {
  const xhr = new XMLHttpRequest()
  xhr.open(method || "POST", url)

  const jwt = window.localStorage.getItem("dynara-admin__token")
  if (jwt) {
    xhr.setRequestHeader("Authorization", "Bearer "+jwt)
  }
  if (headers) {
    for (let [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value)
    }
  }

  xhr.responseType = "json"
  if (onProgress) {
    xhr.upload.onprogress = (ev) => {
      onProgress(Math.trunc(ev.loaded/ev.total*100))
    }
  }

  if (cancelationToken) {
    cancelationToken.cancel = () => xhr.abort()
  }

  xhr.send(body)

  return new Promise<any>((res, rej) => {
    xhr.onload = () => {
      if (onProgress) {
        onProgress(100)
      }
      if (xhr.status >= 400) {
        rej(new HTTPError(xhr.response, xhr.status))
        return
      }
      res(xhr.response)
    }
    xhr.onerror = () => {
      rej(new Error("HTTP Error occurred"))
    } 
  })

}

export class CancelationToken {
  cancel: () => void = () => {}
}

export const downloadXHR = async (
  url: string,
  {method, onProgress, cancelationToken, responseType, fileSize }: XhrOptions = {}
): Promise<any> => {
  const xhr = new XMLHttpRequest();
  xhr.open(method ?? "GET", url);
  if (onProgress) {
    xhr.onprogress = ev => {
      const size = ev.total === 0 ? fileSize ?? 0 : ev.total;
      if (size === 0) return;
      onProgress(Math.trunc((ev.loaded / size) * 100));
    };
  }
  if (cancelationToken) {
    cancelationToken.cancel = () => {
      xhr.abort();
    };
  }

  const jwt = window.localStorage.getItem("dynara-admin__token")
  if (jwt) {
    xhr.setRequestHeader("Authorization", "Bearer "+jwt)
  }
  xhr.send();
  xhr.responseType = responseType ?? "blob";

  return new Promise<any>((res, rej) => {
    xhr.onload = () => {
      if (onProgress) {
        onProgress(100)
      }
      if (xhr.status >= 400) {
        rej(new HTTPError(xhr.response, xhr.status))
        return
      }
      res(xhr.response)
    }
    xhr.onerror = () => {
      rej()
    } 
  })
};
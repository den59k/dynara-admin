// Uploading one picked file to the page's upload endpoint, shared by the single
// file field and the file list. Everything specific to a field — whether it
// stores the structure or a bare url, and whether it crops first — is decided
// from the schema by the caller and passed in here.

import { apiUrl, sendXHR } from '../api/request'
import { autoCrop, type Rect } from './cropImage'
import { normalizeFileValue } from './fileValue'

export type UploadOptions = {
  // The page the upload endpoint belongs to, and the field being uploaded to
  // (the server resolves the field's declared `imageSize` from it).
  view: string,
  field?: string,
  // The field stores the whole `{ src, previewSrc?, size? }` structure rather
  // than a bare url string.
  structured?: boolean,
  // Set on an image field: the picture is cropped to this before it is sent.
  imageSize?: [number, number],
  onProgress?: (percent: number) => void,
}

// What the field should store, plus — when the picture was cropped — the
// original and the rectangle taken out of it, so the crop can be corrected
// later without re-picking the file.
export type Uploaded = { value: any, source?: { file: File, rect: Rect } }

// What the field keeps. The upload handler answers with whatever it stored —
// the structure or a bare url — and the schema decides which of the two the
// value must be, so each is bridged to the other rather than trusted blindly.
export const toFieldValue = (result: any, structured?: boolean) => {
  if (result == null || result === '') return null
  if (structured) return typeof result === 'string' ? { src: result } : result
  return typeof result === 'string' ? result : (normalizeFileValue(result)?.src ?? null)
}

// Sends one file and returns the value the field should hold. Rejects when the
// request does — callers turn that into the field's error.
export const uploadPicked = async (picked: File, options: UploadOptions): Promise<Uploaded> => {
  let file = picked
  let source: Uploaded['source']
  // A field that declares a size crops the picture centred, without asking.
  if (options.imageSize && picked.type.startsWith('image/')) {
    const cropped = await autoCrop(picked, { width: options.imageSize[0], height: options.imageSize[1] })
    if (cropped) {
      file = cropped.file
      source = { file: picked, rect: cropped.rect }
    }
  }

  const body = new FormData()
  body.append('file', file)
  if (options.field) body.append('field', options.field)
  const resp = await sendXHR(apiUrl(`/data/${options.view}/upload`), body, {
    onProgress: options.onProgress,
  })

  // `value` is the field value the handler produced; `url` is the older
  // string-only answer, still honored so an existing backend keeps working.
  return { value: toFieldValue(resp?.value ?? resp?.url ?? null, options.structured), source }
}

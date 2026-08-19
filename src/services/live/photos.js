import { supabase } from '../../lib/supabase'

/**
 * Photos live in a private bucket. Nothing renders a bucket path directly —
 * everything goes through a signed URL with a short life, so a leaked link
 * stops working instead of becoming a permanent public photo of a student.
 */

const BUCKET = 'profile-photos'
const TTL_SECONDS = 60 * 60

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export function validateImage(file) {
  if (!file) return 'No file selected.'
  if (!ALLOWED.includes(file.type)) return 'Photos need to be a JPEG, PNG, WebP, or HEIC.'
  if (file.size > MAX_BYTES) return 'That photo is over 8MB — try a smaller one.'
  return null
}

/**
 * Storage policy keys off the first path segment, so everything a user owns
 * sits under their own id and nobody can write into anyone else's folder.
 */
export async function uploadPhoto(userId, file, position) {
  const problem = validateImage(file)
  if (problem) throw new Error(problem)

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${position}-${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

export async function removePhoto(path) {
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}

/** One round trip for a whole profile's worth of photos. */
export async function signUrls(paths) {
  const real = paths.filter(Boolean)
  if (real.length === 0) return {}

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(real, TTL_SECONDS)
  if (error) {
    console.warn('[looseleaf] could not sign photo urls:', error.message)
    return {}
  }

  return Object.fromEntries(
    (data ?? []).filter((row) => row.signedUrl).map((row) => [row.path, row.signedUrl])
  )
}

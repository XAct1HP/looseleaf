import { supabase } from '../../lib/supabase'

/**
 * Photos for a business.
 *
 * Unlike student photos — private bucket, signed URLs, because those are
 * people — a shopfront is meant to be seen, so `partner-media` is public and
 * these return plain URLs. Ownership is a path check: files live under
 * <partner-id>/, and the storage policy calls is_partner_admin() on that first
 * folder segment.
 */

const BUCKET = 'partner-media'
const MAX_BYTES = 6 * 1024 * 1024

/**
 * Safe to call from anywhere, including the demo campus where there is no
 * Supabase client at all — a missing photo is a card without an image, not a
 * crash halfway down a page.
 */
export function publicUrl(path) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  if (!supabase) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * @param kind 'logo' | 'cover' | 'gallery'
 * @returns the storage path, which is what gets written to the row
 */
export async function upload(partnerId, file, kind = 'gallery') {
  if (!file) throw new Error('No file chosen.')
  if (!/^image\//.test(file.type)) throw new Error('That needs to be an image.')
  if (file.size > MAX_BYTES) throw new Error('Images need to be under 6 MB.')

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${partnerId}/${kind}-${Date.now().toString(36)}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw new Error(error.message)
  return path
}

export async function remove(path) {
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}

import { useEffect, useState } from 'react'
import Portrait from '../brand/Portrait'
import LikeButton from './LikeButton'

/**
 * One photo slot. Falls back to an illustrated stand-in when there's no
 * uploaded image (which, in the demo, is always).
 *
 * `size="sm"` asks for the thumbnail written at upload — which is what a list,
 * a match card or a deck should use, and is roughly a tenth of the bytes. A
 * photo uploaded before thumbnails existed doesn't have one, so a failure
 * falls back to the full file rather than leaving a hole. `priority` is for the
 * one photo somebody is actually looking at: it loads eagerly and jumps the
 * queue, while everything else stays lazy.
 */
export default function ProfilePhoto({
  person,
  index = 0,
  src,
  onLike,
  liked = false,
  aspect = 'aspect-[4/5]',
  caption,
  size = 'full',
  priority = false,
  className = '',
}) {
  const photo = person.photos?.[index]
  const scene = photo?.scene ?? 'portrait'

  // A real uploaded photo wins; the illustration is the fallback for slots
  // that don't have one. A local preview (mid-upload) always wins outright.
  const full = src ?? photo?.url ?? photo?.previewUrl ?? null
  const small = size === 'sm' ? (photo?.thumbUrl ?? null) : null

  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [small, full])

  const image = (!failed && small) || full

  return (
    <figure className={`group relative overflow-hidden rounded-card bg-cream shadow-paper ${aspect} ${className}`}>
      {image ? (
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
        />
      ) : (
        <Portrait id={`${person.id}-${index}`} scene={scene} rounded="rounded-card" />
      )}

      {caption && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/55 to-transparent px-4 pb-3 pt-10 text-[13px] font-medium text-white">
          {caption}
        </figcaption>
      )}

      {onLike && (
        <div className="absolute bottom-3.5 right-3.5 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <LikeButton
            active={liked}
            size="lg"
            onClick={onLike}
            label={`Like ${person.firstName}'s photo`}
          />
        </div>
      )}
    </figure>
  )
}

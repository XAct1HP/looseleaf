import { useEffect, useRef, useState } from 'react'
import Portrait from '../brand/Portrait'
import { IconPlus, IconX } from '../ui/Icons'
import { validateImage } from '../../services/live/photos'
import { isDemo } from '../../services/backend'

/**
 * One photo slot, in both modes.
 *
 * demo — tapping opens the illustration picker (handled by the parent).
 * live — tapping opens the file picker and the chosen file is previewed
 *        locally until onboarding saves and uploads it.
 *
 * A slot's value is one of:
 *   { scene }               an illustration
 *   { file, previewUrl }    a newly chosen photo, not uploaded yet
 *   { path, url }           a photo already in storage
 */
export default function PhotoSlot({ index, photo, hint, onPick, onChoose, onRemove }) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const objectUrl = useRef(null)

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    },
    []
  )

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const problem = validateImage(file)
    if (problem) {
      setError(problem)
      return
    }

    setError('')
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = URL.createObjectURL(file)
    onChoose(index, { file, previewUrl: objectUrl.current })
  }

  const preview = photo?.previewUrl ?? photo?.url ?? null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (isDemo ? onPick(index) : inputRef.current?.click())}
        className={`focus-ring relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-card border-2 border-dashed transition-colors ${
          photo ? 'border-transparent' : 'border-navy/12 bg-cream/60 hover:border-coral/40 hover:bg-coral-wash/40'
        }`}
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : photo?.scene ? (
          <Portrait id={`me-${index}`} scene={photo.scene} rounded="rounded-card" />
        ) : (
          <span className="flex flex-col items-center gap-2 px-3 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-graphite shadow-paper">
              <IconPlus size={18} />
            </span>
            <span className="text-[11.5px] leading-tight text-mist">{hint}</span>
          </span>
        )}

        {index === 0 && photo && (
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10.5px] font-semibold text-navy shadow-paper">
            Main
          </span>
        )}
      </button>

      {!isDemo && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="sr-only"
          onChange={handleFile}
          aria-label={`Photo ${index + 1}`}
        />
      )}

      {photo && (
        <button
          type="button"
          aria-label="Remove photo"
          onClick={() => onRemove(index)}
          className="press absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-white text-graphite shadow-paper"
        >
          <IconX size={14} />
        </button>
      )}

      {error && <p className="mt-1.5 text-[11.5px] leading-snug text-coral-deep">{error}</p>}
    </div>
  )
}

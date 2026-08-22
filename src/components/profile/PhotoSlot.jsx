import { useRef, useState } from 'react'
import Portrait from '../brand/Portrait'
import { IconPlus, IconX } from '../ui/Icons'
import { validateImage } from '../../services/live/photos'
import { derive } from '../../lib/imagePipeline'
import { isDemo } from '../../services/backend'

/**
 * One photo slot, in both modes.
 *
 * demo — tapping opens the illustration picker (handled by the parent).
 * live — tapping opens the file picker and the chosen file is previewed
 *        locally until onboarding saves and uploads it.
 *
 * A slot's value is one of:
 *   { scene }                          an illustration
 *   { file, previewUrl, prepared }     a newly chosen photo, not uploaded yet
 *   { path, url }                      a photo already in storage
 *
 * ── Why the file is processed here and not at upload ────────────────────────
 *
 * The preview used to be `URL.createObjectURL(rawFile)`, which is fine for a
 * JPEG and useless for a HEIC: Chrome and Firefox cannot decode one at all, so
 * an iPhone photo picked from Files showed a broken-image icon here and again
 * on the "here's how you look" card, even though it uploaded and displayed
 * perfectly afterwards — because the *upload* converted it and the preview
 * didn't.
 *
 * So the conversion happens the moment somebody picks the file, and the
 * preview is the converted image. It also gets EXIF rotation right, which an
 * object URL does not, and the work isn't wasted: the derived blobs travel
 * with the draft and `uploadPhoto` uses them instead of decoding a second
 * time. The cost is a visible wait the first time, because a HEIC pulls down a
 * WebAssembly decoder — hence the "Getting it ready" state, rather than an
 * empty box that looks broken.
 */
export default function PhotoSlot({ index, photo, hint, onPick, onChoose, onRemove }) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const problem = validateImage(file)
    if (problem) {
      setError(problem)
      return
    }

    setError('')
    setBusy(true)
    try {
      const prepared = await derive(file, 'photo')
      // The small one is the preview: it's the file a card would show anyway,
      // and it decodes faster than the full-size one.
      const previewUrl = URL.createObjectURL(prepared.sm ?? prepared.full)

      // Whatever was in this slot is being replaced, and nothing else refers
      // to its blob, so let it go now rather than at some later unmount.
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)

      onChoose(index, { file, previewUrl, prepared })
    } catch (e) {
      setError(e.message || 'That photo couldn’t be read.')
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
    onRemove(index)
  }

  const preview = photo?.previewUrl ?? photo?.url ?? null

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => (isDemo ? onPick(index) : inputRef.current?.click())}
        className={`focus-ring relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-card border-2 border-dashed transition-colors ${
          photo ? 'border-transparent' : 'border-navy/12 bg-cream/60 hover:border-coral/40 hover:bg-coral-wash/40'
        }`}
      >
        {busy ? (
          <span className="flex flex-col items-center gap-2 px-3 text-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-rule border-t-coral" />
            <span className="text-[11.5px] leading-tight text-mist">Getting it ready…</span>
          </span>
        ) : preview ? (
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

        {index === 0 && photo && !busy && (
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10.5px] font-semibold text-navy shadow-paper">
            Main
          </span>
        )}
      </button>

      {!isDemo && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif,image/heic,image/heif"
          className="sr-only"
          onChange={handleFile}
          aria-label={`Photo ${index + 1}`}
        />
      )}

      {photo && !busy && (
        <button
          type="button"
          aria-label="Remove photo"
          onClick={remove}
          className="press absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-white text-graphite shadow-paper"
        >
          <IconX size={14} />
        </button>
      )}

      {error && <p className="mt-1.5 text-[11.5px] leading-snug text-coral-deep">{error}</p>}
    </div>
  )
}

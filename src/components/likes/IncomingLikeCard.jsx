import { Link } from 'react-router-dom'
import Portrait from '../brand/Portrait'
import Button from '../ui/Button'
import UniversityBadge from '../common/UniversityBadge'
import { HandHeart } from '../brand/Doodles'
import { IconX, IconNote } from '../ui/Icons'
import { summarizeOverlap } from '../../lib/overlap'

const ago = (ts) => {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

/**
 * Every incoming like, in full. What they liked, what they said, who they are.
 * There is no blurred version of this card anywhere in the product.
 */
export default function IncomingLikeCard({ like, me, onPass, onLikeBack }) {
  const person = like.person
  if (!person) return null

  const myPhoto = like.target?.type === 'photo' ? me.photos?.[like.target.index] : null
  const myPrompt = like.target?.type === 'prompt' ? me.prompts?.[like.target.index] : null
  const overlapLine = summarizeOverlap(person, me)

  return (
    <article className="lift-corner flex h-full flex-col overflow-hidden rounded-card border border-rule bg-white shadow-paper">
      <div className="relative">
        <Link to={`/app/person/${person.id}`} className="block aspect-[4/5]">
          <Portrait id={`${person.id}-0`} scene={person.photos?.[0]?.scene ?? 'portrait'} rounded="rounded-none" />
        </Link>

        {/* what they responded to — a torn corner of your own page */}
        <div className="absolute bottom-3 left-3 flex max-w-[75%] items-center gap-2 rounded-2xl border border-rule bg-white/95 p-1.5 pr-3 shadow-paper backdrop-blur">
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-cream">
            {myPhoto ? (
              <Portrait id={`me-${like.target.index}`} scene={myPhoto.scene} rounded="rounded-xl" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-graphite">
                <IconNote size={19} />
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[11.5px] font-semibold text-coral-deep">
              <HandHeart size={11} />
              {like.note ? 'Left you a note' : `Liked your ${like.target?.type ?? 'profile'}`}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-mist">
              {myPrompt ? myPrompt.q : 'Your photo'}
            </span>
          </span>
        </div>

        <span className="absolute right-3 top-3 rounded-full bg-navy/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          {ago(like.at)}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 py-4">
        <div className="flex items-baseline gap-2">
          <Link
            to={`/app/person/${person.id}`}
            className="font-display text-[20px] font-semibold leading-tight hover:underline"
          >
            {person.firstName}, {person.age}
          </Link>
        </div>
        <p className="mt-1 text-[13.5px] text-graphite">
          {person.major} ’{person.gradYear}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <UniversityBadge size="sm" />
          {overlapLine && <span className="text-[12.5px] text-mist">{overlapLine}</span>}
        </div>

        {like.note && (
          <blockquote className="relative mt-4 rounded-2xl border border-coral/20 bg-coral-wash px-4 py-3">
            <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[3px] rounded-full bg-coral/45" />
            <p className="pl-2 font-hand text-[17px] leading-snug text-navy">“{like.note}”</p>
          </blockquote>
        )}

        <div className="mt-auto flex gap-2 pt-5">
          <Button variant="outline" size="md" onClick={onPass} className="flex-1">
            <IconX size={17} />
            Pass
          </Button>
          <Button variant="coral" size="md" onClick={onLikeBack} className="flex-[1.4]">
            <HandHeart size={16} className="text-white" />
            Like back
          </Button>
        </div>
      </div>
    </article>
  )
}

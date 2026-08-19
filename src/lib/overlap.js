import { interestLabel, intentionById } from '../data/catalog'
import { connectionById } from '../data/people'

/**
 * "Your overlap" — the social context shown on a profile.
 * Only ever derived from things both people chose to share.
 */
export function overlapWith(person, me) {
  const sharedInterests = (person.interests || []).filter((i) => me.interests?.includes(i))

  // An intersection, not their list. "You two both know" has to mean people
  // you have actually connected with — otherwise it's telling you who someone
  // else knows, which is theirs to share, not ours.
  const mine = new Set(me.mutuals || [])
  const mutuals = (person.mutuals || [])
    .filter((id) => mine.has(id))
    .map(connectionById)
    .filter(Boolean)

  const lines = []

  if (mutuals.length) {
    lines.push({
      key: 'mutuals',
      icon: 'people',
      text: `${mutuals.length} mutual connection${mutuals.length > 1 ? 's' : ''}`,
      mutuals,
    })
  }

  if (sharedInterests.length) {
    lines.push({
      key: 'interests',
      icon: 'spark',
      text: `${sharedInterests.length} shared interest${sharedInterests.length > 1 ? 's' : ''}`,
      detail: sharedInterests.slice(0, 3).map(interestLabel).join(' · '),
    })
  }

  if (person.gradYear === me.gradYear) {
    lines.push({ key: 'year', icon: 'cap', text: `Both graduating in '${person.gradYear}` })
  }

  if (person.area === me.area) {
    lines.push({ key: 'area', icon: 'pin', text: `Both around ${person.area}` })
  }

  if (person.intention === me.intention) {
    lines.push({
      key: 'intention',
      icon: 'heart',
      text: `Both here for ${intentionById(person.intention)?.label.toLowerCase()}`,
    })
  }

  if (sharedInterests.includes('coffee')) {
    lines.push({ key: 'coffee', icon: 'coffee', text: 'Both prefer coffee dates' })
  }

  const overlapOrgs = (person.orgs || []).filter((o) => me.orgs?.includes(o))
  if (overlapOrgs.length) {
    lines.push({ key: 'orgs', icon: 'flag', text: `Both in ${overlapOrgs[0]}` })
  }

  return { lines: lines.slice(0, 4), sharedInterests, mutuals }
}

export function summarizeOverlap(person, me) {
  const { sharedInterests, mutuals } = overlapWith(person, me)
  const bits = []
  if (mutuals.length) bits.push(`${mutuals.length} mutual${mutuals.length > 1 ? 's' : ''}`)
  if (sharedInterests.length) bits.push(`${sharedInterests.length} shared interests`)
  return bits.join(' · ')
}

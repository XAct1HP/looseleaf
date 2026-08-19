import { useNavigate, useParams } from 'react-router-dom'
import ProfileCard from '../components/profile/ProfileCard'
import EmptyState from '../components/common/EmptyState'
import Button from '../components/ui/Button'
import { IconBack } from '../components/ui/Icons'
import { personById } from '../data/people'
import { useStore } from '../state/store'

export default function PersonPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, actions } = useStore()
  const person = personById(id)

  if (!person) {
    return <EmptyState title="This profile isn’t here." body="They may have paused their account." />
  }

  const alreadyConnected = state.matches.some((m) => m.personId === person.id)

  return (
    <>
      <button
        onClick={() => navigate(-1)}
        className="press focus-ring mb-5 -ml-2 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
      >
        <IconBack size={18} />
        Back
      </button>

      <ProfileCard
        person={person}
        showPass={false}
        onLike={
          alreadyConnected
            ? undefined
            : (payload) => {
                actions.like(payload)
                navigate('/app/discover')
              }
        }
      />

      {alreadyConnected && (
        <div className="mt-5">
          <Button
            variant="coral"
            size="lg"
            full
            to={`/app/chat/${state.matches.find((m) => m.personId === person.id)?.conversationId}`}
          >
            Message {person.firstName}
          </Button>
        </div>
      )}
    </>
  )
}

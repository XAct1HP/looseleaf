import { IconDiscover, IconHeart, IconChat, IconCampus, IconPerson } from '../ui/Icons'

export const NAV = [
  { to: '/app/discover', label: 'Discover', mobileLabel: 'Discover', Icon: IconDiscover },
  { to: '/app/likes', label: 'Likes', mobileLabel: 'Likes', Icon: IconHeart, badge: 'likes' },
  { to: '/app/matches', label: 'Matches', mobileLabel: 'Matches', Icon: IconChat, badge: 'unread' },
  { to: '/app/campus', label: 'Campus', mobileLabel: 'Campus', Icon: IconCampus },
  { to: '/app/profile', label: 'Profile', mobileLabel: 'You', Icon: IconPerson },
]

import type { MissingDetail } from '@backoffice/domain/missing';
import type { Stage } from '@backoffice/domain/stages';
import type { StageTone } from '@backoffice/ui/brand';

import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Calendar,
  CalendarX,
  CircleCheck,
  CircleDashed,
  Clock,
  Copy,
  DoorOpen,
  HeartHandshake,
  Inbox,
  Lock,
  LogOut,
  type LucideIcon,
  Mail,
  MapPin,
  MessagesSquare,
  Moon,
  Phone,
  PhoneOff,
  Target,
  TriangleAlert,
  User,
  UserMinus,
  Users,
  UserX,
} from 'lucide-react';

/**
 * The staff app's icons (PLAN R61): one meaning, one Lucide icon, everywhere. An icon is decoration next to its word,
 * never instead of it: it is hidden from screen readers, and the word says what it means.
 */
export const icons = {
  owner: User,
  unassigned: UserX,
  inCommunity: Users,
  outOfCommunity: UserMinus,
  arrival: DoorOpen,
  province: MapPin,
  nextStep: ArrowRight,
  due: Calendar,
  late: CalendarX,
  attention: TriangleAlert,
  followUp: Clock,
  duplicate: Copy,
  private: Lock,
  team: BadgeCheck,
  inbox: Inbox,
} as const satisfies Record<string, LucideIcon>;

/** Each stage's icon: a dashed circle before anything starts, a check once someone is active. */
export const STAGE_ICONS = {
  new: CircleDashed,
  contacting: MessagesSquare,
  welcomed: HeartHandshake,
  active: CircleCheck,
  dormant: Moon,
  unresponsive: PhoneOff,
  left: LogOut,
  discarded: Ban,
} as const satisfies Record<Stage, LucideIcon>;

/** Each stage's colour (packages/ui brand.ts): the two closed stages share the closed grey. */
export const STAGE_TONE = {
  new: 'stageNew',
  contacting: 'stageContacting',
  welcomed: 'stageWelcomed',
  active: 'stageActive',
  dormant: 'stageDormant',
  unresponsive: 'stageUnresponsive',
  left: 'stageClosed',
  discarded: 'stageClosed',
} as const satisfies Record<Stage, StageTone>;

/** What a card says is missing, each with its icon (PLAN M5, step 4). */
export const MISSING_ICONS = {
  phone: Phone,
  email: Mail,
  province: MapPin,
  interests: Target,
} as const satisfies Record<MissingDetail, LucideIcon>;

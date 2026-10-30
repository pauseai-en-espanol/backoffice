import type { MissingDetail } from '@backoffice/domain/missing';
import type { Stage } from '@backoffice/domain/stages';
import type { StageTone } from '@backoffice/ui/brand';

import {
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  Ban,
  Building2,
  Calendar,
  CalendarRange,
  CalendarX,
  ChartColumn,
  Check,
  ChevronDown,
  CircleArrowRight,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Contact,
  Copy,
  DoorOpen,
  FilePlus,
  FileSpreadsheet,
  Handshake,
  HeartHandshake,
  IdCard,
  Inbox,
  ListTree,
  Lock,
  LogOut,
  type LucideIcon,
  Mail,
  MapPin,
  Megaphone,
  MessageSquareText,
  MessagesSquare,
  Moon,
  Phone,
  PhoneOff,
  Power,
  ScrollText,
  Search,
  Send,
  Settings,
  SquareKanban,
  Sun,
  Target,
  TriangleAlert,
  Upload,
  User,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
  UserX,
  X,
} from 'lucide-react';

import type { RelationshipStage } from '@/outreach/types';
import type { NavItem } from '@/shell/nav';

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
  /** A picker's list (PLAN R74): open it, empty the field, the option chosen. */
  open: ChevronDown,
  clear: X,
  selected: Check,
  /** The search from anywhere (PLAN R80). */
  search: Search,
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

/**
 * Outreach's relationship stages (PLAN R67), from the same cool hues as the onboarding's: blue before a first letter,
 * violet once written to, teal in conversation, green for an ally, greys for declined and dormant. Identified and
 * qualified share the blue, and declined the closed grey; their icons tell them apart.
 */
export const RELATIONSHIP_ICONS = {
  identified: CircleDashed,
  qualified: ClipboardCheck,
  contacted: Send,
  engaged: MessagesSquare,
  ally: Handshake,
  declined: Ban,
  dormant: Moon,
} as const satisfies Record<RelationshipStage, LucideIcon>;

export const RELATIONSHIP_TONE = {
  identified: 'stageNew',
  qualified: 'stageNew',
  contacted: 'stageContacting',
  engaged: 'stageWelcomed',
  ally: 'stageActive',
  declined: 'stageClosed',
  dormant: 'stageDormant',
} as const satisfies Record<RelationshipStage, StageTone>;

/** Each section of the menu (PLAN R66), beside its word; "Salir" too. None shares a card's icon. */
export const NAV_ICONS = {
  today: Sun,
  people: IdCard,
  board: SquareKanban,
  add: UserPlus,
  bandeja: Inbox,
  imports: Upload,
  panel: ChartColumn,
  census: ClipboardList,
  messages: MessageSquareText,
  next: CircleArrowRight,
  campaigns: Megaphone,
  contacts: Contact,
  organisations: Building2,
  movements: ArrowLeftRight,
  newMovement: FilePlus,
  reports: FileSpreadsheet,
  chart: ListTree,
  years: CalendarRange,
  team: UsersRound,
  audit: ScrollText,
  settings: Settings,
  signOut: Power,
} as const satisfies Record<NavItem['label'] | 'settings' | 'signOut', LucideIcon>;

export type NavIcon = keyof typeof NAV_ICONS;

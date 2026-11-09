import {
  BarChart3,
  CalendarPlus,
  CalendarDays,
  CalendarCheck2,
  ClipboardList,
  Cog,
  Home,
  IndianRupee,
  LayoutGrid,
  MapPin,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Tags,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Short label for the phone tab bar. */
  short?: string;
  /** Roles that get this screen as a phone tab (4 per role; the 5th tab is "More"). */
  tabs?: Role[];
  group: 'main' | 'manage' | 'system';
}

export const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Today',
    icon: Home,
    roles: ['coach', 'admin'],
    tabs: ['coach', 'admin'],
    group: 'main',
  },
  {
    to: '/calendar',
    label: 'Calendar',
    icon: CalendarDays,
    roles: ['coach', 'admin'],
    tabs: ['coach', 'admin'],
    group: 'main',
  },
  {
    to: '/attendance',
    label: 'Attendance',
    tabs: ['coach'],
    icon: CalendarCheck2,
    roles: ['coach', 'admin'],
    group: 'main',
  },
  {
    to: '/lesson-plans',
    label: 'Lesson plans',
    short: 'Plans',
    tabs: ['coach'],
    icon: ClipboardList,
    roles: ['coach', 'admin'],
    group: 'main',
  },
  {
    to: '/feedback',
    label: 'Feedback',
    icon: MessageSquareText,
    roles: ['coach', 'admin'],
    group: 'main',
  },
  {
    to: '/students',
    label: 'Students',
    tabs: ['admin'],
    icon: Users,
    roles: ['coach', 'admin'],
    group: 'main',
  },
  {
    to: '/invoices',
    label: 'Fees',
    icon: IndianRupee,
    roles: ['coach'],
    group: 'main',
  },
  {
    to: '/invoices',
    label: 'Invoices',
    tabs: ['admin'],
    icon: IndianRupee,
    roles: ['admin'],
    group: 'main',
  },
  {
    to: '/finance',
    label: 'Finance',
    icon: BarChart3,
    roles: ['admin'],
    group: 'main',
  },
  {
    to: '/money',
    label: 'Money',
    icon: Wallet,
    roles: ['coach', 'admin'],
    group: 'main',
  },

  {
    to: '/batches',
    label: 'Batches',
    icon: LayoutGrid,
    roles: ['coach', 'admin'],
    group: 'manage',
  },
  { to: '/coaches', label: 'Coaches', icon: UsersRound, roles: ['admin'], group: 'manage' },
  {
    to: '/registrations',
    label: 'Registrations',
    icon: UserPlus,
    roles: ['admin'],
    group: 'manage',
  },
  {
    to: '/makeups',
    label: 'Makeup requests',
    icon: CalendarPlus,
    roles: ['admin'],
    group: 'manage',
  },
  {
    to: '/coach-sessions',
    label: 'Coach check-ins',
    icon: ShieldCheck,
    roles: ['admin', 'coach'],
    group: 'manage',
  },
  { to: '/locations', label: 'Locations', icon: MapPin, roles: ['admin'], group: 'manage' },
  { to: '/fee-plans', label: 'Fee plans', icon: Tags, roles: ['admin'], group: 'manage' },

  { to: '/settings', label: 'Settings', icon: Cog, roles: ['admin'], group: 'system' },
  { to: '/audit-log', label: 'Audit log', icon: ScrollText, roles: ['admin'], group: 'system' },
];

export function navFor(role: Role) {
  return NAV.filter((n) => n.roles.includes(role));
}

/** Phone tab bar: the role's most-used screens (the layout adds a "More" tab for the rest). */
export function tabsFor(role: Role) {
  return NAV.filter((n) => n.tabs?.includes(role));
}

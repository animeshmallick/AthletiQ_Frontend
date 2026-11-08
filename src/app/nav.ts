import {
  BarChart3,
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
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Shown in the phone bottom bar (max 5 per role). */
  mobile?: boolean;
  group: 'main' | 'manage' | 'system';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: Home, roles: ['coach', 'admin'], mobile: true, group: 'main' },
  {
    to: '/attendance',
    label: 'Attendance',
    icon: CalendarCheck2,
    roles: ['coach', 'admin'],
    mobile: true,
    group: 'main',
  },
  {
    to: '/lesson-plans',
    label: 'Lesson plans',
    icon: ClipboardList,
    roles: ['coach', 'admin'],
    mobile: true,
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
    icon: Users,
    roles: ['coach', 'admin'],
    mobile: true,
    group: 'main',
  },
  {
    to: '/invoices',
    label: 'Invoices',
    icon: IndianRupee,
    roles: ['coach', 'admin'],
    mobile: true,
    group: 'main',
  },
  { to: '/finance', label: 'Finance', icon: BarChart3, roles: ['coach', 'admin'], group: 'main' },

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

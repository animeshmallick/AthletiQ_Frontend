import {
  CalendarPlus,
  CalendarCheck2,
  ClipboardList,
  Cog,
  Home,
  IndianRupee,
  LayoutGrid,
  MapPin,
  MessageSquareText,
  ReceiptText,
  Repeat,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Trophy,
  Tags,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export const UNPAID_INVOICES = '/finance?tab=invoices&status=open';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Short label for the phone tab bar. */
  short?: string;
  /** Roles that get this screen as a phone tab (4 per role; the 5th tab is "More"). */
  tabs?: Role[];
  group: 'main' | 'manage' | 'approvals' | 'system';
  /** Other paths that belong to this item (it stays highlighted on them). */
  also?: string[];
}

export const NAV: NavItem[] = [
  {
    // Today and the calendar, as two tabs.
    to: '/',
    label: 'Dashboard',
    short: 'Home',
    icon: Home,
    roles: ['coach', 'admin'],
    tabs: ['coach', 'admin'],
    group: 'main',
    also: ['/calendar'],
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
  { to: '/skills', label: 'Skills', icon: Sparkles, roles: ['coach', 'admin'], group: 'main' },
  {
    to: '/students',
    label: 'Students',
    icon: Users,
    roles: ['coach'],
    group: 'main',
  },
  {
    // Admins: one place for people — students, the team and payees.
    to: '/people',
    label: 'Users',
    tabs: ['admin'],
    icon: Users,
    roles: ['admin'],
    group: 'main',
    also: ['/students', '/coaches', '/payees'],
  },
  {
    // Finance, Money and Invoices in one screen (tabs), for admins and coaches.
    to: '/finance',
    label: 'Finance',
    tabs: ['admin'],
    icon: IndianRupee,
    roles: ['coach', 'admin'],
    group: 'main',
    also: ['/invoices', '/money'],
  },
  {
    // Straight to the unpaid invoices; its badge counts the overdue ones.
    to: UNPAID_INVOICES,
    label: 'Unpaid invoices',
    short: 'Unpaid',
    // Coaches only (admins have Finance, and Batches as their fourth tab).
    tabs: ['coach'],
    icon: ReceiptText,
    roles: ['coach'],
    group: 'main',
  },
  {
    to: '/coach-sessions',
    label: 'Coach check-ins',
    short: 'Check-ins',
    icon: ShieldCheck,
    roles: ['admin', 'coach'],
    group: 'main',
  },

  {
    to: '/batches',
    label: 'Batches',
    tabs: ['admin'],
    icon: LayoutGrid,
    roles: ['coach', 'admin'],
    group: 'manage',
  },
  {
    to: '/substitutions',
    label: 'Substitutes',
    icon: Repeat,
    roles: ['coach', 'admin'],
    group: 'approvals',
  },
  {
    to: '/registrations',
    label: 'Registrations',
    short: 'Sign-ups',
    icon: UserPlus,
    roles: ['admin'],
    group: 'approvals',
  },
  {
    to: '/makeups',
    label: 'Makeup requests',
    short: 'Makeups',
    icon: CalendarPlus,
    roles: ['admin'],
    group: 'approvals',
  },
  { to: '/locations', label: 'Locations', icon: MapPin, roles: ['admin'], group: 'manage' },
  { to: '/fee-plans', label: 'Fee plans', icon: Tags, roles: ['admin'], group: 'manage' },
  { to: '/sports', label: 'Sports & skills', icon: Trophy, roles: ['admin'], group: 'manage' },

  { to: '/settings', label: 'Settings', icon: Cog, roles: ['admin'], group: 'system' },
  { to: '/audit-log', label: 'Audit log', icon: ScrollText, roles: ['admin'], group: 'system' },
  // Coaches see only their own activity on the same screen.
  { to: '/audit-log', label: 'My activity', icon: ScrollText, roles: ['coach'], group: 'system' },
];

export function navFor(role: Role) {
  return NAV.filter((n) => n.roles.includes(role));
}

/** Phone tab bar: the role's most-used screens (the layout adds a "More" tab for the rest). */
export function tabsFor(role: Role) {
  return NAV.filter((n) => n.tabs?.includes(role));
}

/**
 * Is the user on this item's screen (or one of its related screens)? An item with a query (like
 * the unpaid invoices) matches only when the current search has those values too.
 */
export function matches(item: Pick<NavItem, 'to' | 'also'>, path: string, search = '') {
  const [to = '', query] = item.to.split('?');
  if (query) {
    const want = new URLSearchParams(query);
    const have = new URLSearchParams(search);
    if (path !== to) return false;
    for (const [k, v] of want)
      if ((have.get(k) ?? (k === 'status' ? 'open' : '')) !== v) return false;
    return true;
  }
  if (item.to === '/') return path === '/' || (item.also ?? []).includes(path);
  return [item.to, ...(item.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`));
}

/** The one item to highlight: one with a query (Unpaid) wins over its plain screen (Finance). */
export function activeItem<T extends Pick<NavItem, 'to' | 'also'>>(
  items: T[],
  path: string,
  search = '',
): T | undefined {
  return (
    items.find((t) => t.to.includes('?') && matches(t, path, search)) ??
    items.find((t) => !t.to.includes('?') && matches(t, path))
  );
}

/** Section titles, in order (Approvals reads as Requests for coaches). */
export const NAV_GROUPS: { key: NavItem['group']; label: (role: Role) => string }[] = [
  { key: 'main', label: () => 'Coaching' },
  { key: 'manage', label: () => 'Manage' },
  { key: 'approvals', label: (role) => (role === 'admin' ? 'Approvals' : 'Requests') },
  { key: 'system', label: () => 'System' },
];

import {
  ArrowDownLeft,
  ArrowRightLeft,
  HandCoins,
  ReceiptIndianRupee,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import type { FundTxnType } from '@/lib/types';

export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'venue', label: 'Venue / ground' },
  { value: 'travel', label: 'Travel' },
  { value: 'tournament', label: 'Tournament fees' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'refreshments', label: 'Refreshments' },
  { value: 'other', label: 'Other' },
];

export const categoryLabel = (c: string | null) =>
  EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? 'Other';

export const TXN_META: Record<FundTxnType, { label: string; icon: LucideIcon; tone: string }> = {
  fee_split: {
    label: 'Fee',
    icon: ReceiptIndianRupee,
    tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
  handover: {
    label: 'Handover',
    icon: ArrowRightLeft,
    tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  },
  expense: {
    label: 'Purchase',
    icon: ShoppingBag,
    tone: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  payout: {
    label: 'Payout',
    icon: HandCoins,
    tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  },
  income: {
    label: 'Income',
    icon: ArrowDownLeft,
    tone: 'bg-teal-500/12 text-teal-700 dark:text-teal-300',
  },
};

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError, errorMessage } from './api';

/**
 * Maps server validation errors (`details.fields[].path`) onto react-hook-form fields so messages
 * appear next to the right input; anything else becomes a toast.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fallbackTitle = 'Could not save',
): void {
  if (err instanceof ApiError && err.fieldErrors.length) {
    for (const f of err.fieldErrors) {
      if (f.path) setError(f.path as Path<T>, { type: 'server', message: f.message });
    }
    toast.error(fallbackTitle, { description: 'Please fix the highlighted fields.' });
    return;
  }
  toast.error(fallbackTitle, { description: errorMessage(err) });
}

// Shared client-side schemas (mirroring server rules for instant feedback).

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone is required')
  .refine(
    (v) =>
      /^(\+?91)?[6-9]\d{9}$/.test(v.replace(/[\s\-()]/g, '')) ||
      /^\+[1-9]\d{7,14}$/.test(v.replace(/[\s\-()]/g, '')),
    'Enter a valid mobile number',
  );

export const optionalPhoneSchema = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === '' ||
      /^(\+?91)?[6-9]\d{9}$/.test(v.replace(/[\s\-()]/g, '')) ||
      /^\+[1-9]\d{7,14}$/.test(v.replace(/[\s\-()]/g, '')),
    'Enter a valid mobile number',
  );

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letters and numbers');

export const MIN_TRAINING_DAYS = 1;
export const MAX_TRAINING_DAYS = 6;

export const trainingDaysSchema = z
  .array(z.number())
  .min(MIN_TRAINING_DAYS, `Pick at least ${MIN_TRAINING_DAYS} day`)
  .max(MAX_TRAINING_DAYS, `Pick at most ${MAX_TRAINING_DAYS} days`);

/** Empty string → null for optional text fields sent to the API. */
export const nullIfEmpty = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Training days when a batch is chosen: keep the days the student already has that the batch runs;
 * if none fit, use the batch's own days (at most MAX_TRAINING_DAYS).
 */
export function daysForBatch(batchWeekdays: number[], current: number[] = []): number[] {
  const kept = current.filter((d) => batchWeekdays.includes(d)).sort((a, b) => a - b);
  if (kept.length) return kept;
  return [...batchWeekdays].sort((a, b) => a - b).slice(0, MAX_TRAINING_DAYS);
}

export const sameDays = (a: number[] = [], b: number[] = []) =>
  a.length === b.length && a.every((d, i) => d === b[i]);
